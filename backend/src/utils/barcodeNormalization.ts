/**
 * Barcode normalization utilities
 *
 * Some wired scanners output ASCII-triplet encoded payloads, e.g.
 * "050048056..." which represents bytes [50,48,56,...] => "208...".
 *
 * We canonicalize these into readable QR text for storage/comparisons,
 * while keeping compatibility with legacy triplet-encoded rows.
 */

const stripUnsafeControlChars = (s: string) => {
  // Keep tab/newline/carriage return; remove other control chars.
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
};

const isLikelyAsciiTriplets = (s: string) => {
  const trimmed = s.trim();
  if (trimmed.length < 6) return false;
  if (trimmed.length % 3 !== 0) return false;
  if (!/^\d+$/.test(trimmed)) return false;
  return true;
};

export const decodeAsciiTriplets = (input: string): string | null => {
  const s = input.trim();
  if (!isLikelyAsciiTriplets(s)) return null;

  const bytes: number[] = [];
  for (let i = 0; i < s.length; i += 3) {
    const code = Number(s.slice(i, i + 3));
    if (!Number.isFinite(code) || code < 0 || code > 255) return null;
    bytes.push(code);
  }

  const decoded = String.fromCharCode(...bytes);

  // Heuristic: require most chars to be printable whitespace/ASCII.
  const printable = decoded.match(/[\x09\x0A\x0D\x20-\x7E]/g)?.length ?? 0;
  const ratio = decoded.length > 0 ? printable / decoded.length : 0;
  if (ratio < 0.85) return null;

  return decoded;
};

export const encodeAsciiTriplets = (input: string): string => {
  const s = String(input ?? '');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    // Clamp to byte range; Node strings are UTF-16 but our scanner payloads are ASCII.
    const byte = code & 0xff;
    out += String(byte).padStart(3, '0');
  }
  return out;
};

export const canonicalizeBarcode = (input: unknown): string => {
  const s = stripUnsafeControlChars(String(input ?? '')).replace(/\r\n/g, '\n');
  const decoded = decodeAsciiTriplets(s);
  if (decoded !== null) {
    return stripUnsafeControlChars(decoded).replace(/\r\n/g, '\n');
  }
  return s;
};


