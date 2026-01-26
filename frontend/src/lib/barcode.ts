export interface BarcodeData {
  rawValue: string;
  /**
   * If the scanner provides an encoded/altered payload (e.g. ASCII-triplet digits),
   * we canonicalize `rawValue` and keep the original here for debugging/diagnostics.
   */
  originalRawValue?: string;
  partCode: string;
  quantity: string;
  binNumber: string;
  binQuantity?: string; // Bin quantity extracted from QR (for validation)
  qrType?: 'autoliv' | 'customer'; // Type of QR code scanned
  // Additional fields for customer QR codes
  invoiceNumber?: string; // Invoice number (10 digits after date)
  totalQty?: string; // Total quantity (numbers after invoice number, before first 'A')
  totalBinNo?: string; // Total bin number (number before "AUTOLIV INDIA PRIVATE LIMITED")
}

export type ParseBarcodeResult = { data: BarcodeData | null; error?: string };

const normalizeField = (s: string) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Customer label (fixed-position, 1-indexed spec):
 * - Bin number: chars 1..35
 * - Customer item / part number: chars 36..50
 * - Quantity: char at position 51 (single digit)
 */
const parseCustomerLabelFixed = (rawValue: string): ParseBarcodeResult => {
  try {
    // Need at least 51 chars to read quantity at position 51.
    if (rawValue.length < 51) {
      return {
        data: null,
        error:
          `Customer QR Format Error: Data too short (${rawValue.length} chars). ` +
          `Expected at least 51 chars to extract quantity at position 51.`,
      };
    }

    // 1-indexed positions mapped to JS 0-index slices:
    // bin 1..35 => [0,35)
    // part 36..50 => [35,50)
    // qty at 51 => [50]
    const binNumber = normalizeField(rawValue.slice(0, 35));
    const partCode = normalizeField(rawValue.slice(35, 50));
    const quantityChar = normalizeField(rawValue.slice(50, 51));

    if (!binNumber) {
      return { data: null, error: 'Customer QR Format Error: Bin number empty in characters 1..35.' };
    }
    if (!partCode) {
      return { data: null, error: 'Customer QR Format Error: Part number empty in characters 36..50.' };
    }
    if (!quantityChar || !/^\d$/.test(quantityChar)) {
      return {
        data: null,
        error:
          `Customer QR Format Error: Invalid quantity at position 51. ` +
          `Expected a single digit, found: "${quantityChar || '(empty)'}".`,
      };
    }

    return {
      data: {
        rawValue,
        partCode,
        quantity: quantityChar,
        binNumber,
        binQuantity: quantityChar,
        qrType: 'customer',
      },
    };
  } catch (error) {
    console.error('Error parsing Customer QR (fixed):', error);
    return {
      data: null,
      error: 'Customer QR Parse Error: ' + (error instanceof Error ? error.message : 'Unknown error occurred'),
    };
  }
};

/**
 * Autoliv label (marker-based spec):
 * - Find the relevant Q (must have single digit right after)
 * - Find the P before that Q (same P/Q pair)
 * - Part number: between that P and that Q
 * - Quantity: single digit after that Q
 * - Bin number: between S and that same P
 *   - Prefer S occurring after the last V before P (if V exists)
 *   - If multiple S, choose the one closest to P (last S in the allowed range)
 */
const parseAutolivLabel = (rawValue: string): ParseBarcodeResult => {
  try {
    const qCandidates: number[] = [];
    for (let i = 0; i < rawValue.length - 1; i++) {
      if (rawValue[i] === 'Q' && /^\d$/.test(rawValue[i + 1])) {
        qCandidates.push(i);
      }
    }

    for (const qIndex of qCandidates) {
      const pIndex = rawValue.lastIndexOf('P', qIndex - 1);
      if (pIndex === -1) continue;

      const partCode = normalizeField(rawValue.slice(pIndex + 1, qIndex));
      if (!partCode) continue;

      const quantity = rawValue[qIndex + 1];
      if (!/^\d$/.test(quantity)) continue;

      const vIndex = rawValue.lastIndexOf('V', pIndex - 1);

      let sIndex = -1;
      if (vIndex !== -1) {
        // Find last S between (vIndex, pIndex)
        for (let i = pIndex - 1; i > vIndex; i--) {
          if (rawValue[i] === 'S') {
            sIndex = i;
            break;
          }
        }
      } else {
        sIndex = rawValue.lastIndexOf('S', pIndex - 1);
      }

      if (sIndex === -1) continue;

      const binNumber = normalizeField(rawValue.slice(sIndex + 1, pIndex));
      if (!binNumber) continue;

      return {
        data: {
          rawValue,
          partCode,
          quantity,
          binNumber,
          binQuantity: quantity,
          qrType: 'autoliv',
        },
      };
    }

    // If we got here, parsing failed. Provide a helpful diagnostic.
    const hasP = rawValue.includes('P');
    const hasQ = rawValue.includes('Q');
    const hasS = rawValue.includes('S');
    return {
      data: null,
      error:
        `Autoliv QR Format Error: Could not extract fields using S..P..Q markers. ` +
        `Found markers - P:${hasP ? 'yes' : 'no'}, Q:${hasQ ? 'yes' : 'no'}, S:${hasS ? 'yes' : 'no'}.`,
    };
  } catch (error) {
    console.error('Error parsing Autoliv QR:', error);
    return {
      data: null,
      error: 'Autoliv QR Parse Error: ' + (error instanceof Error ? error.message : 'Unknown error occurred'),
    };
  }
};

// =============================================
// Scanner payload normalization (ASCII-triplet decoding)
// =============================================
const stripUnsafeControlChars = (s: string) => {
  // Keep tab/newline/carriage return; remove other control chars.
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
};

const isLikelyAsciiTriplets = (s: string) => {
  const trimmed = s.trim();
  if (trimmed.length < 6) return false;
  if (trimmed.length % 3 !== 0) return false;
  if (!/^\d+$/.test(trimmed)) return false;
  // Guard: very long digit-only strings can be accidental; still bounded elsewhere (10k).
  return true;
};

const decodeAsciiTriplets = (s: string): string | null => {
  const trimmed = s.trim();
  if (!isLikelyAsciiTriplets(trimmed)) return null;

  // Decode 3-digit ASCII codes (e.g. 050048... => '20...')
  const out: number[] = [];
  for (let i = 0; i < trimmed.length; i += 3) {
    const code = Number(trimmed.slice(i, i + 3));
    if (!Number.isFinite(code) || code < 0 || code > 255) return null;
    out.push(code);
  }

  const decoded = String.fromCharCode(...out);

  // Heuristic: require that a good portion is printable whitespace/ASCII.
  // This avoids decoding arbitrary numeric payloads.
  const printable = decoded.match(/[\x09\x0A\x0D\x20-\x7E]/g)?.length ?? 0;
  const ratio = decoded.length > 0 ? printable / decoded.length : 0;
  if (ratio < 0.85) return null;

  return decoded;
};

export const canonicalizeBarcodePayload = (
  input: string
): { canonical: string; original?: string; decoded: boolean } => {
  // Normalize line endings for downstream parsing, and strip unsafe control chars.
  const cleaned = stripUnsafeControlChars(String(input ?? ''));
  const decoded = decodeAsciiTriplets(cleaned);
  const canonical = stripUnsafeControlChars((decoded ?? cleaned).replace(/\r\n/g, '\n'));
  const changed = decoded !== null && decoded !== cleaned;
  return { canonical, original: changed ? cleaned : undefined, decoded: changed };
};

// Legacy Customer QR parsing (space-delimited) - kept for backward compatibility only.
const parseCustomerQRLegacy = (rawValue: string): ParseBarcodeResult => {
  try {
    console.log('Parsing Customer QR:', rawValue);

    // Extract Bin Number: First sequence of digits before first occurrence of multiple spaces (2+ spaces)
    const binNumberMatch = rawValue.match(/^(\d+)\s{2,}/);
    const binNumber = binNumberMatch ? binNumberMatch[1] : null;

    if (!binNumber) {
      return {
        data: null,
        error: 'Customer QR Format Error: Could not extract bin number from start of QR code.',
      };
    }

    // Split by multiple spaces (2 or more) to extract fields
    const fields = rawValue
      .split(/\s{2,}/)
      .map((field) => field.trim())
      .filter((field) => field.length > 0);

    if (fields.length < 2) {
      return {
        data: null,
        error:
          'Customer QR Format Error: Expected at least 2 fields separated by multiple spaces. Found ' +
          fields.length +
          ' field(s).',
      };
    }

    // Extract Part Code and Bin Quantity from second field
    // Format: 84940M69R13-BHE8 where '8' is the bin quantity
    const partCodeField = fields[1];
    let partCode = partCodeField;
    let binQuantity: string | null = null;

    // Check if last character is a digit (bin quantity)
    const lastChar = partCodeField[partCodeField.length - 1];
    if (lastChar && /^\d$/.test(lastChar)) {
      // Extract part code without trailing digit
      partCode = partCodeField.slice(0, -1);
      binQuantity = lastChar;
    } else {
      // If no trailing digit, default bin quantity to "1"
      binQuantity = '1';
    }

    if (!partCode) {
      return {
        data: null,
        error: 'Customer QR Format Error: Part code not found in expected position (field 2).',
      };
    }

    // Extract Invoice Number: 10 digits after date pattern DD/MM/YY
    // Pattern: date pattern followed by optional spaces, then exactly 10 digits
    const invoiceNumberMatch = rawValue.match(/(\d{2}\/\d{2}\/\d{2})\s*(\d{10})/);
    const invoiceNumber = invoiceNumberMatch ? invoiceNumberMatch[2] : null;

    // Extract Total Quantity: Numbers after invoice number, before first 'A'
    // Pattern: After the 10-digit invoice number, capture all consecutive digits before first 'A'
    let totalQty: string | null = null;
    if (invoiceNumber) {
      const invoiceIndex = rawValue.indexOf(invoiceNumber);
      if (invoiceIndex !== -1) {
        const afterInvoice = rawValue.substring(invoiceIndex + invoiceNumber.length);
        const totalQtyMatch = afterInvoice.match(/^(\d+)A/i);
        if (totalQtyMatch) {
          totalQty = totalQtyMatch[1];
        }
      }
    }

    // Extract Total Bin Number: Number before "AUTOLIV INDIA PRIVATE LIMITED"
    // Pattern: /(\d+)AUTOLIV (case-insensitive)
    const totalBinNoMatch = rawValue.match(/\/(\d+)AUTOLIV/i);
    const totalBinNo = totalBinNoMatch ? totalBinNoMatch[1] : null;

    console.log('Customer QR parsed successfully:', {
      binNumber,
      partCode,
      binQuantity,
      invoiceNumber,
      totalQty,
      totalBinNo,
    });

    return {
      data: {
        rawValue,
        partCode,
        quantity: binQuantity || '1',
        binNumber,
        binQuantity: binQuantity || undefined,
        qrType: 'customer',
        invoiceNumber: invoiceNumber || undefined,
        totalQty: totalQty || undefined,
        totalBinNo: totalBinNo || undefined,
      },
    };
  } catch (error) {
    console.error('Error parsing Customer QR:', error);
    return {
      data: null,
      error: 'Customer QR Parse Error: ' + (error instanceof Error ? error.message : 'Unknown error occurred'),
    };
  }
};

/**
 * Autoliv QR detection (strict):
 * Avoid false positives where normal text contains letters 'P'/'Q' (e.g. "PRIVATE", "-QS98").
 * We only consider it Autoliv if it has at least one Q immediately followed by a single-digit quantity,
 * with a matching P before that Q and a matching S before that P (per the same rules as parsing).
 */
const isLikelyAutolivMarkerQr = (rawValue: string) => {
  if (!rawValue) return false;

  // Fast reject: without a Q followed by a digit, it can't be an Autoliv marker QR.
  let hasQDigit = false;
  for (let i = 0; i < rawValue.length - 1; i++) {
    if (rawValue[i] === 'Q' && /^\d$/.test(rawValue[i + 1])) {
      hasQDigit = true;
      break;
    }
  }
  if (!hasQDigit) return false;

  // Confirm we can form a valid S..P..Q<digit> chain (same selection logic as parseAutolivLabel).
  const qCandidates: number[] = [];
  for (let i = 0; i < rawValue.length - 1; i++) {
    if (rawValue[i] === 'Q' && /^\d$/.test(rawValue[i + 1])) qCandidates.push(i);
  }

  for (const qIndex of qCandidates) {
    const pIndex = rawValue.lastIndexOf('P', qIndex - 1);
    if (pIndex === -1) continue;

    const vIndex = rawValue.lastIndexOf('V', pIndex - 1);
    let sIndex = -1;
    if (vIndex !== -1) {
      for (let i = pIndex - 1; i > vIndex; i--) {
        if (rawValue[i] === 'S') {
          sIndex = i;
          break;
        }
      }
    } else {
      sIndex = rawValue.lastIndexOf('S', pIndex - 1);
    }

    if (sIndex !== -1) return true;
  }

  return false;
};

// Detect QR type and parse accordingly
export const parseBarcodeData = (rawValue: string): ParseBarcodeResult => {
  try {
    console.log('Parsing barcode/QR:', rawValue);

    // Autoliv QR: marker-based (strict detection to avoid false positives)
    // NOTE: Do not short-circuit on Autoliv failure; fall through to customer parsers.
    let autolivError: string | undefined;
    if (isLikelyAutolivMarkerQr(rawValue)) {
      const autolivResult = parseAutolivLabel(rawValue);
      if (autolivResult.data) return { data: autolivResult.data };
      autolivError = autolivResult.error;
    }

    // Customer QR: fixed-position per nomenclature (preferred)
    if (rawValue.length >= 51) {
      const customerFixed = parseCustomerLabelFixed(rawValue);
      if (customerFixed.data) return { data: customerFixed.data };
      if (customerFixed.error) return { data: null, error: customerFixed.error };
    }

    // Customer QR: legacy format fallback (space-delimited)
    const lines = rawValue.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const fields = rawValue
      .split(/\s{2,}/)
      .map((field) => field.trim())
      .filter((field) => field.length > 0);
    if (lines.length >= 3 || fields.length >= 2) {
      const customerLegacy = parseCustomerQRLegacy(rawValue);
      if (customerLegacy.data) return { data: customerLegacy.data };
      if (customerLegacy.error) return { data: null, error: customerLegacy.error };
    }

    // Fallback: Try old format (Part_code-{value},Quantity-{value},Bin_number-{value})
    // This maintains backward compatibility
    let partCode = '';
    let quantity = '';
    let binNumber = '';

    const partCodeMatch = rawValue.match(/Part_code-([^,]+)/);
    const quantityMatch = rawValue.match(/Quantity-([^,]+)/);
    const binNumberMatch = rawValue.match(/Bin_number-([^,]+)/);

    if (partCodeMatch) {
      partCode = partCodeMatch[1].trim();
    }
    if (quantityMatch) {
      quantity = quantityMatch[1].trim();
    }
    if (binNumberMatch) {
      binNumber = binNumberMatch[1].trim();
    }

    // Validate that we got at least partCode
    if (!partCode) {
      console.error('Failed to parse any known QR/barcode format:', rawValue);

      // If it looked like an Autoliv marker QR, surface that diagnostic (after trying customer formats).
      if (autolivError) {
        return { data: null, error: autolivError };
      }

      // Generate helpful error message based on what we detected
      let errorMsg = '❌ Unrecognized QR Code Format\n\n';
      errorMsg += "This QR code doesn't match any supported format:\n\n";
      errorMsg += '✓ Autoliv QR: Should contain P...Q pattern\n';
      errorMsg += '✓ Customer QR: Multi-line (3+ lines) or space-delimited (2+ fields)\n';
      errorMsg += '✓ Legacy: Part_code-X,Quantity-Y,Bin_number-Z\n\n';

      if (rawValue.length < 10) {
        errorMsg += '⚠️ Scanned data seems too short (' + rawValue.length + ' chars). Please ensure:\n';
        errorMsg += '• Scanner is positioned correctly\n';
        errorMsg += '• QR code is not damaged or blurry\n';
        errorMsg += '• Scanner settings are correct';
      } else {
        errorMsg += '📋 Scanned data: ' + rawValue.substring(0, 50) + (rawValue.length > 50 ? '...' : '');
      }

      return { data: null, error: errorMsg };
    }

    return {
      data: {
        rawValue,
        partCode,
        quantity: quantity || '0',
        binNumber: binNumber || '',
        binQuantity: quantity || undefined,
      },
    };
  } catch (error) {
    console.error('Error parsing barcode:', error);
    return {
      data: null,
      error:
        '⚠️ Parsing Error: ' +
        (error instanceof Error ? error.message : 'An unexpected error occurred while parsing the QR code.'),
    };
  }
};

