/**
 * Date parsing utilities for Excel uploads.
 *
 * Goals:
 * - Avoid JS Date overflow bugs (e.g. new Date(2026, 20, 1) => 2027-09-01)
 * - Avoid ambiguous parsing via `new Date(string)`
 * - Support common Excel exports: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, YYYY/MM/DD
 * - Support Excel serial dates (including floats for date+time)
 */
export type ParsedDate = Date | null;

const EXCEL_EPOCH_OFFSET_DAYS = 25569; // days between 1899-12-30 and 1970-01-01
const MS_PER_DAY = 86400 * 1000;

export function isLikelyExcelSerial(n: number): boolean {
  // Practical bounds:
  // 30000 ~ 1982-02, 80000 ~ 2119-01 (covers any real operational schedule/invoice dates)
  return Number.isFinite(n) && n >= 30000 && n <= 80000;
}

export function excelSerialToLocalDate(serial: number): ParsedDate {
  if (!Number.isFinite(serial)) return null;
  // Excel dates can be floats (date + fractional day time). For date-only fields, floor.
  const wholeDays = Math.floor(serial);
  if (!isLikelyExcelSerial(wholeDays)) return null;

  const utcDays = wholeDays - EXCEL_EPOCH_OFFSET_DAYS;
  const utcMs = utcDays * MS_PER_DAY;
  const dateInfo = new Date(utcMs);
  // Convert to local Y/M/D, stripping any timezone/time component.
  return new Date(dateInfo.getFullYear(), dateInfo.getMonth(), dateInfo.getDate());
}

function daysInMonth(year: number, month1to12: number): number {
  // month is 1..12; Date expects 0..11
  return new Date(year, month1to12, 0).getDate();
}

export function makeLocalDateStrict(year: number, month1to12: number, day1to31: number): ParsedDate {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return null;
  if (!Number.isInteger(month1to12) || month1to12 < 1 || month1to12 > 12) return null;
  if (!Number.isInteger(day1to31) || day1to31 < 1 || day1to31 > 31) return null;

  const dim = daysInMonth(year, month1to12);
  if (day1to31 > dim) return null;

  const d = new Date(year, month1to12 - 1, day1to31);
  // Extra guard: ensure no overflow occurred.
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month1to12 - 1 ||
    d.getDate() !== day1to31
  ) {
    return null;
  }
  return d;
}

function parseIsoYmd(s: string): ParsedDate {
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  return makeLocalDateStrict(year, month, day);
}

function parseDmyOrMdy(s: string, preferDayFirst: boolean): ParsedDate {
  // Accept optional time part after date; we ignore it for date-only.
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+.*)?$/);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);

  const tryDmy = () => makeLocalDateStrict(year, b, a);
  const tryMdy = () => makeLocalDateStrict(year, a, b);

  // Choose based on preference, but only accept if strict-valid.
  if (preferDayFirst) {
    return tryDmy() ?? tryMdy();
  }
  return tryMdy() ?? tryDmy();
}

function parseMonthNameDate(s: string): ParsedDate {
  // Support common month-name forms from Excel:
  // - 21-Jan-2026 / 21-Jan-26
  // - 21 January 2026 / 21 January 26
  // Allow optional trailing time text (ignored).
  const cleaned = s.trim();
  if (!cleaned) return null;

  const monthMap: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  // 21-Jan-2026 / 21-Jan-26
  {
    const m = cleaned.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{2}|\d{4})(?:\s+.*)?$/);
    if (m) {
      const day = parseInt(m[1], 10);
      const monToken = m[2].toLowerCase();
      const month = monthMap[monToken];
      if (!month) return null;
      let year = parseInt(m[3], 10);
      // Interpret 2-digit years as 20xx for operational range.
      if (m[3].length === 2) year = 2000 + year;
      return makeLocalDateStrict(year, month, day);
    }
  }

  // 21 January 2026 / 21 January 26 (also covers multiple spaces)
  {
    const m = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2}|\d{4})(?:\s+.*)?$/);
    if (m) {
      const day = parseInt(m[1], 10);
      const monToken = m[2].toLowerCase();
      const month = monthMap[monToken];
      if (!month) return null;
      let year = parseInt(m[3], 10);
      if (m[3].length === 2) year = 2000 + year;
      return makeLocalDateStrict(year, month, day);
    }
  }

  return null;
}

/**
 * Parse a date value coming from XLSX sheet_to_json().
 * - Dates may be Date objects (if cellDates true elsewhere), numbers (serial), numeric strings, or formatted strings.
 */
export function parseExcelDateValue(value: any, opts?: { preferDayFirst?: boolean }): ParsedDate {
  const preferDayFirst = opts?.preferDayFirst ?? true;

  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Normalize to local Y/M/D to avoid time components.
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === 'number') {
    // Only treat as Excel serial if plausible, otherwise reject.
    return excelSerialToLocalDate(value);
  }

  const asString = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!asString) return null;

  // Numeric strings can be Excel serials.
  if (/^\d+(\.\d+)?$/.test(asString)) {
    const n = Number(asString);
    const fromSerial = excelSerialToLocalDate(n);
    if (fromSerial) return fromSerial;
    // If it looks numeric but not a plausible serial, treat as invalid rather than guessing.
    return null;
  }

  // Strip time portion for ISO timestamps (e.g., 2026-01-21T00:00:00Z)
  const datePart = asString.split('T')[0].trim();

  // YYYY-MM-DD / YYYY/MM/DD
  const iso = parseIsoYmd(datePart);
  if (iso) return iso;

  // Month-name formats (e.g., 21-Jan-2026)
  const monthName = parseMonthNameDate(asString);
  if (monthName) return monthName;

  // DD/MM/YYYY / MM/DD/YYYY (strict + preference)
  const dmyMdy = parseDmyOrMdy(asString, preferDayFirst);
  if (dmyMdy) return dmyMdy;

  return null;
}

export function toIsoDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

