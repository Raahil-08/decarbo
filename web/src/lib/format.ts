/**
 * Indian currency and number formatters for Decarbo frontend (PRD §17.4).
 */

export function formatIndianNumber(value: number, decimals?: number): string {
  if (value === null || value === undefined || isNaN(value)) {
    return "0";
  }

  const isNegative = value < 0;
  const absVal = Math.abs(value);

  let intPart: string;
  let decPart = "";

  if (decimals !== undefined) {
    const fixed = absVal.toFixed(decimals);
    const parts = fixed.split(".");
    intPart = parts[0];
    decPart = parts[1] || "";
  } else {
    if (Math.abs(absVal - Math.round(absVal)) < 1e-5) {
      intPart = Math.round(absVal).toString();
    } else {
      const parts = absVal.toFixed(2).split(".");
      intPart = parts[0];
      decPart = (parts[1] || "").replace(/0+$/, "");
    }
  }

  // Indian digit grouping: last 3 digits, then groups of 2
  if (intPart.length <= 3) {
    const res = decPart ? `${intPart}.${decPart}` : intPart;
    return isNegative ? `-${res}` : res;
  }

  const last3 = intPart.slice(-3);
  let remaining = intPart.slice(0, -3);
  const groups: string[] = [];

  while (remaining.length > 2) {
    groups.unshift(remaining.slice(-2));
    remaining = remaining.slice(0, -2);
  }
  if (remaining.length > 0) {
    groups.unshift(remaining);
  }
  groups.push(last3);

  const groupedInt = groups.join(",");
  const finalStr = decPart ? `${groupedInt}.${decPart}` : groupedInt;
  return isNegative ? `-${finalStr}` : finalStr;
}

export function formatINR(amount: number, decimals: number = 0): string {
  return `₹${formatIndianNumber(amount, decimals)}`;
}

export function formatLakh(amount: number): string {
  const lakhs = amount / 100000;
  return `₹${lakhs.toFixed(1)} L`;
}

export function formatCrore(amount: number): string {
  const crores = amount / 10000000;
  return `₹${crores.toFixed(2)} Cr`;
}

export function formatEmissionsT(kgco2e: number): string {
  const t = kgco2e / 1000;
  return `${t.toFixed(1)} tCO2e`;
}
