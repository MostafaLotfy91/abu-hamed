import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));

import { checkRateLimit, rateLimitResponse, visitorKey } from "../rate-limit.server";

describe("rate limit", () => {
  beforeEach(() => {
    rpc.mockReset();
    process.env["RATE_LIMIT_SALT"] = "test-salt";
  });

  it("keys visitors by the trusted header only, ignoring spoofable x-forwarded-for", () => {
    const spoofed = new Request("https://x", { headers: { "x-forwarded-for": "1.2.3.4" } });
    expect(visitorKey(spoofed)).toBe("ip:unknown");
    const cf = new Request("https://x", {
      headers: { "cf-connecting-ip": "5.6.7.8", "x-forwarded-for": "1.2.3.4" },
    });
    expect(visitorKey(cf)).toBe("ip:5.6.7.8");
  });

  it("allows, limits, and fails closed", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await checkRateLimit("k")).toBe("ok");
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await checkRateLimit("k")).toBe("limited");
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await checkRateLimit("k")).toBe("unavailable");
    rpc.mockRejectedValueOnce(new Error("network"));
    expect(await checkRateLimit("k")).toBe("unavailable");
  });

  it("never sends the raw key, only a salted hash", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await checkRateLimit("ip:5.6.7.8", 3);
    const args = rpc.mock.calls[0][1];
    expect(args._client_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(args._message_count).toBe(3);
  });

  it("maps results to responses", () => {
    expect(rateLimitResponse("ok")).toBeNull();
    expect(rateLimitResponse("limited")!.status).toBe(429);
    expect(rateLimitResponse("unavailable")!.status).toBe(503);
  });
});
