/**
 * In-memory sliding-window rate limiter.
 *
 * Tracks request timestamps per key (token or IP) and rejects
 * when the count within the window exceeds the configured limit.
 *
 * Stale entries are purged every 60 seconds to avoid memory leaks.
 */

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimiterOptions {
  windowMs: number;   // sliding window in milliseconds
  maxRequests: number; // max requests allowed within the window
}

const DEFAULT_TOKEN_LIMIT: RateLimiterOptions = {
  windowMs: 60_000,   // 1 minute
  maxRequests: 100,    // 100 req/min per token
};

const DEFAULT_IP_LIMIT: RateLimiterOptions = {
  windowMs: 60_000,   // 1 minute
  maxRequests: 200,    // 200 req/min per IP
};

class SlidingWindowRateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private options: RateLimiterOptions;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(options: RateLimiterOptions) {
    this.options = options;
    // Purge stale entries every 60s
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    // Allow Node to exit even if timer is running
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  /**
   * Check if the key is within its rate limit.
   * Returns { allowed, remaining, retryAfterMs }.
   */
  check(key: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;

    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }

    // Drop timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    if (entry.timestamps.length >= this.options.maxRequests) {
      const oldestInWindow = entry.timestamps[0];
      const retryAfterMs = oldestInWindow + this.options.windowMs - now;
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(retryAfterMs, 1),
      };
    }

    entry.timestamps.push(now);
    return {
      allowed: true,
      remaining: this.options.maxRequests - entry.timestamps.length,
      retryAfterMs: 0,
    };
  }

  private cleanup() {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;
    for (const [key, entry] of this.store) {
      entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }
}

// Singleton instances (persist across requests in the same process)
const tokenLimiter = new SlidingWindowRateLimiter(DEFAULT_TOKEN_LIMIT);
const ipLimiter = new SlidingWindowRateLimiter(DEFAULT_IP_LIMIT);

/**
 * Check rate limits for an ingest request.
 * Returns null if allowed, or a { status, retryAfter, message } object if blocked.
 */
export function checkIngestRateLimit(
  token: string,
  ip: string
): { message: string; retryAfter: number } | null {
  // Check per-token limit first
  const tokenResult = tokenLimiter.check(`token:${token}`);
  if (!tokenResult.allowed) {
    return {
      message: 'Rate limit exceeded for this token',
      retryAfter: Math.ceil(tokenResult.retryAfterMs / 1000),
    };
  }

  // Check per-IP limit
  const ipResult = ipLimiter.check(`ip:${ip}`);
  if (!ipResult.allowed) {
    return {
      message: 'Rate limit exceeded for this IP',
      retryAfter: Math.ceil(ipResult.retryAfterMs / 1000),
    };
  }

  return null;
}
