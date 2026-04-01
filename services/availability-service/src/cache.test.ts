import { describe, expect, it } from "vitest";

import { makeAvailabilityCacheKey } from "./cache.js";

describe("availability cache key", () => {
  it("builds deterministic cache keys", () => {
    expect(makeAvailabilityCacheKey("doctor-1", "2026-03-10T00:00:00.000Z", "2026-03-11T00:00:00.000Z")).toBe(
      "availability:doctor-1:2026-03-10T00:00:00.000Z:2026-03-11T00:00:00.000Z"
    );
  });
});
