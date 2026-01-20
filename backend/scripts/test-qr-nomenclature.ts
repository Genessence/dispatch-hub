/* eslint-disable no-console */
import { parseAutolivLabel, parseCustomerLabel } from '../src/utils/qrNomenclature';

function assert(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function padRight(s: string, len: number, ch = ' ') {
  return s.length >= len ? s.slice(0, len) : s + ch.repeat(len - s.length);
}

function run() {
  console.log('== QR nomenclature smoke test ==');

  // ----------------------------
  // Customer label (fixed-position)
  // ----------------------------
  const customerBin = padRight('2083107504002', 35, ' ');
  const customerPart = padRight('84940M69R13-BHE', 15, ' ');
  const customerQty = '8';
  const customerRaw = customerBin + customerPart + customerQty + 'TRAILING-DATA-OK';

  const c = parseCustomerLabel(customerRaw);
  console.log('Customer parsed:', c);
  assert(c.binNumber === '2083107504002', `Customer bin mismatch: "${c.binNumber}"`);
  assert(c.partNumber === '84940M69R13-BHE', `Customer part mismatch: "${c.partNumber}"`);
  assert(c.quantity === '8', `Customer qty mismatch: "${c.quantity}"`);

  // ----------------------------
  // Autoliv label (marker-based)
  // ----------------------------
  // Multiple S markers present; bin must come from the S after the last V before P.
  const autolivRaw =
    '[)>0612SA16S1V123456SIGNORE' +
    'S BIN-42   ' +
    'PITEM123Q8' +
    'ZZZ';

  const a = parseAutolivLabel(autolivRaw);
  console.log('Autoliv parsed:', a);
  assert(a.binNumber === 'BIN-42', `Autoliv bin mismatch: "${a.binNumber}"`);
  assert(a.partNumber === 'ITEM123', `Autoliv part mismatch: "${a.partNumber}"`);
  assert(a.quantity === '8', `Autoliv qty mismatch: "${a.quantity}"`);

  // ----------------------------
  // Negative cases (should throw)
  // ----------------------------
  let threw = false;
  try {
    parseCustomerLabel('too-short');
  } catch {
    threw = true;
  }
  assert(threw, 'Expected parseCustomerLabel to throw on too-short input');

  threw = false;
  try {
    parseAutolivLabel('NO_MARKERS_HERE');
  } catch {
    threw = true;
  }
  assert(threw, 'Expected parseAutolivLabel to throw on missing markers');

  console.log('✅ All QR nomenclature smoke tests passed.');
}

run();


