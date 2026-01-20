export type QrLabelType = 'customer' | 'autoliv';

export type ParseErrorCode =
  | 'EMPTY_INPUT'
  | 'TOO_SHORT'
  | 'INVALID_QUANTITY'
  | 'MISSING_MARKER_P'
  | 'MISSING_MARKER_Q'
  | 'MISSING_MARKER_S'
  | 'INVALID_AUTOLIV_SEGMENT';

export class QrParseError extends Error {
  public readonly code: ParseErrorCode;
  public readonly labelType: QrLabelType;

  constructor(labelType: QrLabelType, code: ParseErrorCode, message: string) {
    super(message);
    this.name = 'QrParseError';
    this.code = code;
    this.labelType = labelType;
  }
}

export interface ParsedLabel {
  labelType: QrLabelType;
  /** For customer label: bin (chars 1..35). For Autoliv: between S..P per nomenclature. */
  binNumber: string;
  /** For customer label: part (chars 36..50). For Autoliv: between P..Q per nomenclature. */
  partNumber: string;
  /** Single digit quantity from label */
  quantity: string;
  /** Canonical/raw input used for parsing */
  raw: string;
}

const normalizeField = (s: string) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Customer label nomenclature (fixed-position, 1-indexed):
 * - Bin number: chars 1..35
 * - Part number: chars 36..50
 * - Quantity: char at position 51 (single digit)
 */
export function parseCustomerLabel(raw: string): ParsedLabel {
  const input = String(raw ?? '');
  if (!input) throw new QrParseError('customer', 'EMPTY_INPUT', 'Customer label is empty');
  if (input.length < 51) {
    throw new QrParseError(
      'customer',
      'TOO_SHORT',
      `Customer label too short (${input.length} chars). Expected at least 51 chars.`
    );
  }

  const binNumber = normalizeField(input.slice(0, 35)); // 1..35
  const partNumber = normalizeField(input.slice(35, 50)); // 36..50
  const quantity = normalizeField(input.slice(50, 51)); // position 51

  if (!binNumber) {
    throw new QrParseError('customer', 'INVALID_AUTOLIV_SEGMENT', 'Customer label bin number empty (chars 1..35)');
  }
  if (!partNumber) {
    throw new QrParseError('customer', 'INVALID_AUTOLIV_SEGMENT', 'Customer label part number empty (chars 36..50)');
  }
  if (!/^\d$/.test(quantity)) {
    throw new QrParseError(
      'customer',
      'INVALID_QUANTITY',
      `Customer label quantity invalid at position 51. Expected single digit, got "${quantity || '(empty)'}".`
    );
  }

  return { labelType: 'customer', binNumber, partNumber, quantity, raw: input };
}

/**
 * Autoliv label nomenclature:
 * - Bin number: between S and P (choose S after last V before P if V exists; if multiple S, choose closest to P)
 * - Part number: between P and Q (same P/Q pair)
 * - Quantity: single digit after that Q
 */
export function parseAutolivLabel(raw: string): ParsedLabel {
  const input = String(raw ?? '');
  if (!input) throw new QrParseError('autoliv', 'EMPTY_INPUT', 'Autoliv label is empty');

  if (!input.includes('Q')) throw new QrParseError('autoliv', 'MISSING_MARKER_Q', "Autoliv label missing 'Q' marker");
  if (!input.includes('P')) throw new QrParseError('autoliv', 'MISSING_MARKER_P', "Autoliv label missing 'P' marker");

  // Choose the first Q that has a single digit immediately after it, and has a P before it.
  const qCandidates: number[] = [];
  for (let i = 0; i < input.length - 1; i++) {
    if (input[i] === 'Q' && /^\d$/.test(input[i + 1])) qCandidates.push(i);
  }
  if (qCandidates.length === 0) {
    throw new QrParseError(
      'autoliv',
      'INVALID_QUANTITY',
      "Autoliv label missing a 'Q' marker followed by a single digit quantity"
    );
  }

  for (const qIndex of qCandidates) {
    const pIndex = input.lastIndexOf('P', qIndex - 1);
    if (pIndex === -1) continue;

    const partNumber = normalizeField(input.slice(pIndex + 1, qIndex));
    if (!partNumber) continue;

    const quantity = input[qIndex + 1];
    if (!/^\d$/.test(quantity)) continue;

    const vIndex = input.lastIndexOf('V', pIndex - 1);
    let sIndex = -1;

    if (vIndex !== -1) {
      for (let i = pIndex - 1; i > vIndex; i--) {
        if (input[i] === 'S') {
          sIndex = i;
          break;
        }
      }
    } else {
      sIndex = input.lastIndexOf('S', pIndex - 1);
    }

    if (sIndex === -1) continue;

    const binNumber = normalizeField(input.slice(sIndex + 1, pIndex));
    if (!binNumber) continue;

    return { labelType: 'autoliv', binNumber, partNumber, quantity, raw: input };
  }

  if (!input.includes('S')) throw new QrParseError('autoliv', 'MISSING_MARKER_S', "Autoliv label missing 'S' marker");
  throw new QrParseError(
    'autoliv',
    'INVALID_AUTOLIV_SEGMENT',
    'Autoliv label could not be parsed using S..P..Q nomenclature'
  );
}


