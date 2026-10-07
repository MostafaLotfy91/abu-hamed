// The test-safety allowlist: localhost always; the one staging ref from supabase/config.toml only with
// E2E_ALLOW_REMOTE=staging; everything else refused. Pure checks, nothing connects.
import { afterEach, describe, expect, it } from "vitest";
import { assertAllowed, isAllowedDbUrl, isAllowedSupabaseUrl, stagingProjectRef } from "../safety";

const ref = stagingProjectRef()!;
const other = "abcdefghijklmnopqrst";
const prev = process.env["E2E_ALLOW_REMOTE"];
afterEach(() => {
  if (prev === undefined) delete process.env["E2E_ALLOW_REMOTE"];
  else process.env["E2E_ALLOW_REMOTE"] = prev;
});
const remote = (on: boolean) => {
  if (on) process.env["E2E_ALLOW_REMOTE"] = "staging";
  else delete process.env["E2E_ALLOW_REMOTE"];
};

describe("test safety allowlist", () => {
  it("reads a 20-character project ref from supabase/config.toml", () => {
    expect(ref).toMatch(/^[a-z0-9]{20}$/);
  });

  it("always allows localhost", () => {
    remote(false);
    expect(isAllowedSupabaseUrl("http://127.0.0.1:54321")).toBe(true);
    expect(isAllowedDbUrl("postgresql://postgres:postgres@127.0.0.1:54322/postgres")).toBe(true);
  });

  it("refuses the staging project unless E2E_ALLOW_REMOTE=staging", () => {
    remote(false);
    expect(isAllowedSupabaseUrl(`https://${ref}.supabase.co`)).toBe(false);
    expect(isAllowedDbUrl(`postgresql://postgres:x@db.${ref}.supabase.co:5432/postgres`)).toBe(false);
  });

  it("with the switch on, allows only the staging ref", () => {
    remote(true);
    expect(isAllowedSupabaseUrl(`https://${ref}.supabase.co`)).toBe(true);
    expect(isAllowedDbUrl(`postgresql://postgres:x@db.${ref}.supabase.co:5432/postgres`)).toBe(true);
    expect(isAllowedDbUrl(`postgresql://postgres.${ref}:x@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`)).toBe(true);
  });

  it("with the switch on, still refuses every other project and host", () => {
    remote(true);
    for (const u of [
      `https://${other}.supabase.co`,
      `http://${ref}.supabase.co`,
      `https://${ref}.supabase.co.evil.example`,
      `https://evil.example/${ref}.supabase.co`,
      "https://example.com",
    ]) expect(isAllowedSupabaseUrl(u), u).toBe(false);
    for (const u of [
      `postgresql://postgres:x@db.${other}.supabase.co:5432/postgres`,
      `postgresql://postgres.${other}:x@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
      `postgresql://postgres:x@db.${ref}.supabase.co.evil.example:5432/postgres`,
      "postgresql://postgres:x@10.0.0.5:5432/postgres",
    ]) expect(isAllowedDbUrl(u), u).toBe(false);
  });

  it("never allows a remote app URL, even with the switch on", () => {
    remote(true);
    expect(() => assertAllowed("https://abu-hamed.lovable.app", "E2E_BASE_URL", "app")).toThrow(/localhost only/);
    expect(() => assertAllowed("http://localhost:8080", "E2E_BASE_URL", "app")).not.toThrow();
  });

  it("error messages never echo credentials", () => {
    remote(true);
    expect(() => assertAllowed(`postgresql://postgres:SECRET@db.${other}.supabase.co:5432/postgres`, "TEST_DATABASE_URL", "db"))
      .toThrow(/^(?!.*SECRET)/s);
  });
});
