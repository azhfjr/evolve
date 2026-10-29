// Normalize decimal magnitudes before converting: SQL sums can exceed Number.MAX_VALUE.
function magnitude(value: string | number) {
  const raw = String(value).trim().toLowerCase();
  if (!/^\+?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/.test(raw))
    return { coefficient: 0, exponent: 0 };
  const [base, power = "0"] = raw.replace(/^\+/, "").split("e"),
    [whole, fraction = ""] = base.split(".");
  const digits = whole + fraction,
    first = digits.search(/[1-9]/);
  if (first < 0) return { coefficient: 0, exponent: 0 };
  return {
    coefficient: Number(
      digits[first] + "." + digits.slice(first + 1, first + 15),
    ),
    exponent: whole.length - first - 1 + Number(power),
  };
}
export function chartRatios(values: (string | number)[]): number[] {
  const parts = values.map(magnitude);
  const max = parts.reduce(
    (a, b) =>
      !a.coefficient ||
      (b.coefficient &&
        (b.exponent > a.exponent ||
          (b.exponent === a.exponent && b.coefficient > a.coefficient)))
        ? b
        : a,
    { coefficient: 0, exponent: 0 },
  );
  return parts.map((p) =>
    !p.coefficient
      ? 0
      : max.coefficient
        ? Math.min(
            1,
            (p.coefficient / max.coefficient) *
              10 ** (p.exponent - max.exponent),
          )
        : 0,
  );
}
export function pieSegments(values: number[]) {
  const total = values.reduce((s, n) => s + Math.max(0, n), 0);
  let angle = 0;
  return values.flatMap((value, index) => {
    if (value <= 0 || !total) return [];
    const start = angle;
    angle += (value / total) * 360;
    return [{ index, start, end: angle, fraction: value / total }];
  });
}
export function chartTick(value: string | number, fraction: number): string {
  const p = magnitude(value);
  if (!p.coefficient || !fraction) return "0";
  let coefficient = p.coefficient * fraction,
    exponent = p.exponent;
  while (coefficient < 1) {
    coefficient *= 10;
    exponent--;
  }
  while (coefficient >= 10) {
    coefficient /= 10;
    exponent++;
  }
  return exponent >= 7 || exponent <= -4
    ? `${Number(coefficient.toPrecision(3))}e${exponent}`
    : (coefficient * 10 ** exponent).toLocaleString("en-US", {
        maximumFractionDigits: 3,
      });
}
/** Retain visible precision without claiming a small positive share is zero. */
export function chartShare(value: number, total: number): string {
  if (!total || !value) return "0%";
  const percent = (value / total) * 100;
  return percent < 0.1 ? "<0.1%" : `${percent.toFixed(1)}%`;
}
