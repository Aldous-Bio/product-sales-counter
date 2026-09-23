import { describe, expect, it } from "vitest";
import { MAX_PREVIEW_UNITS, isDefaultSetting, parsePreviewUnits, resolveProductDisplay } from "./productDisplay";

describe("parsePreviewUnits", () => {
  it("accepts non-negative integers, including 0", () => {
    expect(parsePreviewUnits("25")).toBe(25);
    expect(parsePreviewUnits(" 1250 ")).toBe(1250);
    expect(parsePreviewUnits("0")).toBe(0);
  });

  it("switches the test figure off for empty or invalid input", () => {
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

describe("resolveProductDisplay", () => {
  const editor = new URLSearchParams("preview=1");
  const live = new URLSearchParams("");

  it("uses the defaults for a product with no setting", () => {
    expect(resolveProductDisplay(null, editor)).toEqual({ hidden: false, previewUnits: null });
  });

  it("applies the test figure only to theme-editor requests", () => {
    const setting = { hidden: false, previewUnits: 25 };
    expect(resolveProductDisplay(setting, editor)).toEqual({ hidden: false, previewUnits: 25 });
    expect(resolveProductDisplay(setting, live)).toEqual({ hidden: false, previewUnits: null });
    expect(resolveProductDisplay({ hidden: false, previewUnits: 0 }, editor).previewUnits).toBe(0);
  });

  it("hides the product everywhere when hidden, test figure or not", () => {
    const setting = { hidden: true, previewUnits: 25 };
    expect(resolveProductDisplay(setting, editor)).toEqual({ hidden: true, previewUnits: null });
    expect(resolveProductDisplay(setting, live)).toEqual({ hidden: true, previewUnits: null });
  });
});

describe("isDefaultSetting", () => {
  it("is true only for a visible product without a test figure", () => {
    expect(isDefaultSetting({ hidden: false, previewUnits: null })).toBe(true);
    expect(isDefaultSetting({ hidden: true, previewUnits: null })).toBe(false);
    expect(isDefaultSetting({ hidden: false, previewUnits: 0 })).toBe(false);
  });
});
