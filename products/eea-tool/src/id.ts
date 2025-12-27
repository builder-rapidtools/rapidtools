/**
 * ID generation utilities
 * Implements ULID (Universally Unique Lexicographically Sortable Identifier)
 *
 * ULID Format: ttttttttttrrrrrrrrrrrrrrr (26 chars)
 * - 10 chars timestamp (48 bits, milliseconds since Unix epoch)
 * - 16 chars randomness (80 bits)
 * - Crockford's Base32 encoding
 */

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = ENCODING.length; // 32

/**
 * Encodes a number to Crockford's Base32
 */
function encodeTime(time: number, length: number): string {
  let str = '';
  for (let i = length; i > 0; i--) {
    const mod = time % ENCODING_LEN;
    str = ENCODING[mod] + str;
    time = Math.floor(time / ENCODING_LEN);
  }
  return str;
}

/**
 * Generates random Base32 string of given length
 */
function encodeRandom(length: number): string {
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);

  let str = '';
  for (let i = 0; i < length; i++) {
    str += ENCODING[randomBytes[i] % ENCODING_LEN];
  }
  return str;
}

/**
 * Generates a new ULID
 * Format: eea_<ulid>
 */
export function generateAttestationId(): string {
  const timestamp = Date.now();
  const timeStr = encodeTime(timestamp, 10);
  const randomStr = encodeRandom(16);
  return `eea_${timeStr}${randomStr}`;
}
