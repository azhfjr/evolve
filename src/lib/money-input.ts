// PostgreSQL unconstrained numeric supports 131,072 digits before the point.
// This storage/resource boundary replaces the former practical amount cap.
export const MAX_MONEY_WHOLE_DIGITS = 131072;
export const MAX_MONEY_INPUT_LENGTH = MAX_MONEY_WHOLE_DIGITS + 7;
export function groupMoneyWhole(whole: string): string {
  const first = whole.length % 3 || 3;
  const groups = [whole.slice(0, first)];
  for (let index = first; index < whole.length; index += 3)
    groups.push(whole.slice(index, index + 3));
  return groups.join(",");
}
// Keep the user's precision and edit state. Monetary arithmetic stays in minor units.
export function moneyInputValue(
  display: string,
  decimalPlaces: 2 | 6 = 2,
): string | null {
  const raw = display.normalize("NFKC").replaceAll(",", "");
  return raw.length <= MAX_MONEY_WHOLE_DIGITS + decimalPlaces + 1 &&
    (raw.split(".")[0]?.length || 0) <= MAX_MONEY_WHOLE_DIGITS &&
    new RegExp(`^\\d*(\\.\\d{0,${decimalPlaces}})?$`).test(raw)
    ? raw
    : null;
}
// A unit change may leave six rate decimals in a two-decimal money field.
// Let deletion reduce that existing precision while final validation stays strict.
export function moneyInputEditValue(
  display: string,
  previousValue: string,
  decimalPlaces: 2 | 6 = 2,
): string | null {
  const valid = moneyInputValue(display, decimalPlaces);
  if (valid !== null) return valid;
  const previous = moneyInputValue(previousValue, 6);
  const next = moneyInputValue(display, 6);
  if (previous === null || next === null) return null;
  const previousPrecision = previous.split(".")[1]?.length || 0;
  const nextPrecision = next.split(".")[1]?.length || 0;
  return previousPrecision > decimalPlaces && nextPrecision < previousPrecision
    ? next
    : null;
}
export function moneyInputDisplay(raw: string) {
  const [whole, fraction] = raw.split(".");
  return (
    groupMoneyWhole(whole) + (fraction === undefined ? "" : `.${fraction}`)
  );
}
export function finishMoneyInput(raw: string) {
  return raw.replace(/\.$/, "").replace(/^\./, "0.");
}
export function moneyCaret(display: string, digits: number) {
  let position = 0,
    count = 0;
  while (position < display.length && count < digits) {
    if (display[position] !== ",") count++;
    position++;
  }
  return position;
}
