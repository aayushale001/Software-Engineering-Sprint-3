import { describe, expect, it } from "vitest";

import { makeRecordsCacheKey } from "./cache.js";

describe("records cache key", () => {
  it("includes filter dimensions in cache key", () => {
    const key = makeRecordsCacheKey("patient-1", {
      from: "2026-01-01",
      to: "2026-02-01",
      type: "lab_result",
      limit: 20,
      offset: 0
    });

    expect(key).toContain("records:patient-1");
    expect(key).toContain("lab_result");
  });
});
