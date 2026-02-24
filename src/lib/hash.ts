import { createHash } from 'crypto';

// SHA-256 hash for PII fields (Meta CAPI requirement)
export function sha256(value: string): string {
  return createHash('sha256')
    .update(value.trim().toLowerCase())
    .digest('hex');
}

// Hash PII only if not already hashed (64 hex chars = already SHA-256)
export function hashIfNeeded(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^[a-f0-9]{64}$/.test(value)) return value; // already hashed
  return sha256(value);
}

// Hash IP address
export function hashIp(ip: string): string {
  return sha256(ip);
}

// Normalize and hash user data for Meta CAPI
export function hashUserData(userData: Record<string, unknown> = {}): Record<string, unknown> {
  const piiFields = ['em', 'ph', 'fn', 'ln', 'ct', 'st', 'zp', 'country', 'external_id'];
  const result: Record<string, unknown> = { ...userData };

  for (const field of piiFields) {
    if (typeof result[field] === 'string' && result[field]) {
      result[field] = hashIfNeeded(result[field] as string);
    }
  }

  return result;
}
