import { describe, expect, it } from "vitest";
import {
  extractDirectoryEmail,
  extractDirectoryName,
  mapDirectoryRoleToTenantRole,
} from "./directory-sync.js";

describe("mapDirectoryRoleToTenantRole", () => {
  it("defaults missing / empty / whitespace roles to drafter", () => {
    expect(mapDirectoryRoleToTenantRole(null)).toBe("drafter");
    expect(mapDirectoryRoleToTenantRole(undefined)).toBe("drafter");
    expect(mapDirectoryRoleToTenantRole("")).toBe("drafter");
    expect(mapDirectoryRoleToTenantRole("   ")).toBe("drafter");
  });

  it("maps admin-shaped slugs to admin", () => {
    expect(mapDirectoryRoleToTenantRole("admin")).toBe("admin");
    expect(mapDirectoryRoleToTenantRole("ADMIN")).toBe("admin");
    expect(mapDirectoryRoleToTenantRole("tenant_admin")).toBe("admin");
    expect(mapDirectoryRoleToTenantRole("workspace-admin")).toBe("admin");
  });

  it("maps the exact 'owner' slug to owner — but admin wins on substrings", () => {
    expect(mapDirectoryRoleToTenantRole("owner")).toBe("owner");
    // Substring match for admin runs before owner — by design, since most IdPs
    // emit "admin"-shaped slugs and we want them to land safely.
    expect(mapDirectoryRoleToTenantRole("co-owner")).toBe("drafter");
  });

  it("maps reader/reviewer slugs to their bands", () => {
    expect(mapDirectoryRoleToTenantRole("viewer")).toBe("viewer");
    expect(mapDirectoryRoleToTenantRole("readonly")).toBe("viewer");
    expect(mapDirectoryRoleToTenantRole("read_only")).toBe("viewer");
    expect(mapDirectoryRoleToTenantRole("reviewer")).toBe("reviewer");
    expect(mapDirectoryRoleToTenantRole("approver")).toBe("reviewer");
  });

  it("falls back to drafter for unrecognised slugs (safe default)", () => {
    expect(mapDirectoryRoleToTenantRole("super_user")).toBe("drafter");
    expect(mapDirectoryRoleToTenantRole("guest")).toBe("drafter");
  });
});

describe("extractDirectoryEmail", () => {
  it("prefers the top-level email when present", () => {
    expect(extractDirectoryEmail({ email: "Jane@Example.com" })).toBe("jane@example.com");
  });

  it("falls back to a primary email in customAttributes.emails", () => {
    expect(
      extractDirectoryEmail({
        email: null,
        customAttributes: {
          emails: [
            { type: "work", value: "secondary@example.com" },
            { type: "work", value: "primary@example.com", primary: true },
          ],
        },
      }),
    ).toBe("primary@example.com");
  });

  it("falls back to the first valid email when no primary flag is set", () => {
    expect(
      extractDirectoryEmail({
        email: null,
        customAttributes: { emails: [{ value: "first@example.com" }, { value: "second@example.com" }] },
      }),
    ).toBe("first@example.com");
  });

  it("returns null when no usable email exists", () => {
    expect(extractDirectoryEmail({ email: null })).toBeNull();
    expect(extractDirectoryEmail({ email: "no-at-symbol" })).toBeNull();
    expect(extractDirectoryEmail({ customAttributes: { emails: [] } })).toBeNull();
  });
});

describe("extractDirectoryName", () => {
  it("combines first + last name when present", () => {
    expect(extractDirectoryName({ firstName: "Jane", lastName: "Patel" })).toBe("Jane Patel");
  });

  it("handles missing first OR last", () => {
    expect(extractDirectoryName({ firstName: "Jane", lastName: null })).toBe("Jane");
    expect(extractDirectoryName({ firstName: null, lastName: "Patel" })).toBe("Patel");
  });

  it("falls back to email local-part when both names are absent", () => {
    expect(extractDirectoryName({ firstName: null, lastName: null, email: "jane@example.com" })).toBe(
      "jane",
    );
  });

  it("returns null when nothing usable is present", () => {
    expect(extractDirectoryName({ firstName: null, lastName: null, email: null })).toBeNull();
  });
});
