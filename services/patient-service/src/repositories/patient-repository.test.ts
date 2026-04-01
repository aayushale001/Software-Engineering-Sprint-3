import { describe, expect, it } from "vitest";

import { isPatientProfileComplete } from "./patient-repository.js";

describe("isPatientProfileComplete", () => {
  it("returns true when full name, date of birth, and phone are present", () => {
    expect(
      isPatientProfileComplete({
        fullName: "Alex Carter",
        dateOfBirth: "1990-02-15",
        phoneNumber: "+447700900111"
      })
    ).toBe(true);
  });

  it("returns false when any required field is missing", () => {
    expect(
      isPatientProfileComplete({
        fullName: "Alex Carter",
        dateOfBirth: null,
        phoneNumber: "+447700900111"
      })
    ).toBe(false);

    expect(
      isPatientProfileComplete({
        fullName: " ",
        dateOfBirth: "1990-02-15",
        phoneNumber: "+447700900111"
      })
    ).toBe(false);

    expect(
      isPatientProfileComplete({
        fullName: "Alex Carter",
        dateOfBirth: "1990-02-15",
        phoneNumber: ""
      })
    ).toBe(false);
  });
});
