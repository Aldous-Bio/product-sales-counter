import { describe, expect, it } from "vitest";
import {
  MAX_PREVIEW_UNITS,
  isBelowMinimum,
  isProductHidden,
  parseMinUnitsToShow,
  parsePreviewUnits,
} from "./productDisplay";

describe("parsePreviewUnits", () => {
  it("accepts non-negative integers, including 0", () => {
    expect(parsePreviewUnits("25")).toBe(25);
    expect(parsePreviewUnits(" 1250 ")).toBe(1250);
    expect(parsePreviewUnits("0")).toBe(0);
  });

  it("clears the field for empty or invalid input", () => {
    expect(parsePreviewUnits("")).toBeNull();
    expect(parsePreviewUnits(null)).toBeNull();
    expect(parsePreviewUnits("-3")).toBeNull();
    expect(parsePreviewUnits("2.5")).toBeNull();
    expect(parsePreviewUnits("abc")).toBeNull();
  });

  it("caps absurdly large values", () => {
    expect(parsePreviewUnits("99999999999")).toBe(MAX_PREVIEW_UNITS);
  });
});

describe("isProductHidden", () => {
  it("shows the counter for a product with no setting", () => {
    expect(isProductHidden(null)).toBe(false);
    expect(isProductHidden(undefined)).toBe(false);
  });

  it("follows the setting's hidden flag", () => {
    expect(isProductHidden({ hidden: true })).toBe(true);
    expect(isProductHidden({ hidden: false })).toBe(false);
  });
});

describe("parseMinUnitsToShow", () => {
  it("accepts non-negative integers", () => {
    expect(parseMinUnitsToShow("10")).toBe(10);
    expect(parseMinUnitsToShow(" 250 ")).toBe(250);
    expect(parseMinUnitsToShow("0")).toBe(0);
  });

  it("falls back to no minimum for empty or invalid input", () => {
    expect(parseMinUnitsToShow("")).toBe(0);
    expect(parseMinUnitsToShow(null)).toBe(0);
    expect(parseMinUnitsToShow("-3")).toBe(0);
    expect(parseMinUnitsToShow("2.5")).toBe(0);
    expect(parseMinUnitsToShow("abc")).toBe(0);
  });

  it("caps absurdly large values", () => {
    expect(parseMinUnitsToShow("99999999999")).toBe(MAX_PREVIEW_UNITS);
  });
});

describe("isBelowMinimum", () => {
  it("never hides with no minimum", () => {
    expect(isBelowMinimum(0, 0)).toBe(false);
    expect(isBelowMinimum(0, undefined)).toBe(false);
  });

  it("shows the counter from the minimum itself upwards", () => {
    expect(isBelowMinimum(9, 10)).toBe(true);
    expect(isBelowMinimum(10, 10)).toBe(false);
    expect(isBelowMinimum(11, 10)).toBe(false);
  });
});
