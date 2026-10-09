import { describe, expect, it } from "vitest";
import { isPhoneLoginEmail, localPhone, phoneLoginEmail } from "../phone-auth";

describe("phone + password accounts", () => {
  it("derives the same login identity from any way of writing the number", () => {
    for (const p of [
      "01012345678",
      "+20 10 1234 5678",
      "00201012345678",
      "٠١٠١٢٣٤٥٦٧٨",
      "010-1234-5678",
    ])
      expect(phoneLoginEmail(p), p).toBe("201012345678@phone.local");
  });
  it("rejects numbers that are not Egyptian mobiles", () => {
    for (const p of ["", "123", "0223456789", "01312345678", "010123456789"])
      expect(phoneLoginEmail(p), p).toBeNull();
  });
  it("recognises the internal address and shows the local number", () => {
    expect(isPhoneLoginEmail("201012345678@phone.local")).toBe(true);
    expect(isPhoneLoginEmail("someone@gmail.com")).toBe(false);
    expect(isPhoneLoginEmail(null)).toBe(false);
    expect(localPhone("201012345678")).toBe("01012345678");
  });
});
