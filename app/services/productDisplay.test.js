import { describe, expect, it } from "vitest";
import { MAX_PREVIEW_UNITS, isProductHidden, parsePreviewUnits } from "./productDisplay";

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
