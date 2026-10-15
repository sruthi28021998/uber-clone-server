import { describe, it, expect } from "vitest";
import { calculateFare, estimateAll, haversineKm } from "../src/lib/fare.js";
import { toNum, isUuid } from "../src/lib/utils.js";

describe("fare", () => {
  it("calculates standard and premium fares", () => {
    expect(calculateFare("standard", 10)).toBe(160);
    expect(calculateFare("premium", 5)).toBe(150);
  });

  it("never goes below the minimum fare", () => {
    expect(calculateFare("standard", 0)).toBe(60);
    expect(estimateAll(0)).toEqual({ standard: 60, premium: 60, xl: 80 });
  });

  it("measures about 111 km per degree of latitude", () => {
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.19, 0);
    expect(haversineKm(5, 5, 5, 5)).toBe(0);
  });
});

describe("utils", () => {
  it("toNum parses numbers and rejects junk", () => {
    expect(toNum("5.5")).toBe(5.5);
    expect(toNum("")).toBeNull();
    expect(toNum("abc")).toBeNull();
    expect(toNum(undefined)).toBeNull();
  });

  it("isUuid validates ids", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});