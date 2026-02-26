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

// Normalize phone for Brazil and hash for Meta CAPI
// Removes non-digits, prefixes "55" if missing, then SHA-256
export function hashPhone(phone: string): string | undefined {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return undefined;
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  return sha256(normalized);
}

// Split full name into first and last name
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
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
