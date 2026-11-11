import crypto from 'crypto';

/**
 * Timing-safe string comparison to prevent timing attacks on API key validation.
 * If lengths differ, still performs a comparison to avoid leaking length information.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    // Compare bufA against itself to avoid timing leak, but return false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
