import { describe, it, expect } from "vitest";
import {
  formatINR,
  formatLakh,
  formatCrore,
  formatIndianNumber,
  formatEmissionsT,
  parseIndianCurrency,
} from "./format";

describe("PRD §21 Indian Number Formatting Suite", () => {
  it("formats standard amounts with Indian grouping (formatINR)", () => {
    // PRD §21 explicit golden acceptance test
    expect(formatINR(1234567)).toBe("₹12,34,567");
    expect(formatINR(0)).toBe("₹0");
    expect(formatINR(100)).toBe("₹100");
    expect(formatINR(1000)).toBe("₹1,000");
    expect(formatINR(100000)).toBe("₹1,00,000");
    expect(formatINR(10000000)).toBe("₹1,00,00,000");
  });

  it("formats lakh values with 1 decimal place (formatLakh)", () => {
    // PRD §21 explicit golden acceptance test
    expect(formatLakh(1250000)).toBe("₹12.5 L");
    expect(formatLakh(1000000)).toBe("₹10.0 L");
    expect(formatLakh(50000)).toBe("₹0.5 L");
    expect(formatLakh(2400000)).toBe("₹24.0 L");
  });

  it("formats crore values with 2 decimal places (formatCrore)", () => {
    // PRD §21 crore formatting test
    expect(formatCrore(15000000)).toBe("₹1.50 Cr");
    expect(formatCrore(10000000)).toBe("₹1.00 Cr");
    expect(formatCrore(24500000)).toBe("₹2.45 Cr");
    expect(formatCrore(5000000)).toBe("₹0.50 Cr");
  });

  it("formats emissions in tCO2e with 1 decimal place (formatEmissionsT)", () => {
    expect(formatEmissionsT(7500)).toBe("7.5 tCO2e");
    expect(formatEmissionsT(1234500)).toBe("1234.5 tCO2e");
    expect(formatEmissionsT(0)).toBe("0.0 tCO2e");
  });

  it("handles negative and decimal values in formatIndianNumber", () => {
    expect(formatIndianNumber(-1234567)).toBe("-12,34,567");
    expect(formatIndianNumber(1234.56, 2)).toBe("1,234.56");
    expect(formatIndianNumber(-9876543.21, 2)).toBe("-98,76,543.21");
    expect(formatIndianNumber(0)).toBe("0");
  });

  it("parses user-entered Indian currency strings into numerical INR (parseIndianCurrency)", () => {
    // Suffixes: L, Lakh, Lakhs, Lac
    expect(parseIndianCurrency("10 L")).toBe(1000000);
    expect(parseIndianCurrency("12.5 lakh")).toBe(1250000);
    expect(parseIndianCurrency("2.4 Lacs")).toBe(240000);

    // Suffixes: Cr, Crore, Crores
    expect(parseIndianCurrency("1.5 Cr")).toBe(15000000);
    expect(parseIndianCurrency("2 crore")).toBe(20000000);

    // Suffixes: k, thousand
    expect(parseIndianCurrency("50k")).toBe(50000);
    expect(parseIndianCurrency("75 thousand")).toBe(75000);

    // Comma-separated numbers and currency symbols
    expect(parseIndianCurrency("₹12,34,567")).toBe(1234567);
    expect(parseIndianCurrency("₹ 5,00,000")).toBe(500000);
    expect(parseIndianCurrency("75000")).toBe(75000);

    // Empty/invalid input
    expect(parseIndianCurrency("")).toBe(0);
    expect(parseIndianCurrency("invalid")).toBe(0);
  });
});
