const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Persian or Arabic-Indic digits → ASCII. Also maps the Arabic decimal/thousands separators. */
export function toEnDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const fa = FA_DIGITS.indexOf(ch);
    if (fa >= 0) {
      out += String(fa);
      continue;
    }
    const ar = AR_DIGITS.indexOf(ch);
    if (ar >= 0) {
      out += String(ar);
      continue;
    }
    if (ch === '٫') out += '.';
    else if (ch === '٬') out += ',';
    else out += ch;
  }
  return out;
}

/** ASCII digits → Persian digits; '.' between digits becomes the Persian decimal separator «٫». */
export function toFaDigits(input: string | number): string {
  return String(input)
    .replace(/(\d)\.(\d)/g, '$1٫$2')
    .replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}
