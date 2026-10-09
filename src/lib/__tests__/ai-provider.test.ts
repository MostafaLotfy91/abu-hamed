import { describe, expect, it } from "vitest";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool } from "ai";
import { z } from "zod";
import { AI_PRESETS, aiConfig } from "../ai-provider.server";

describe("aiConfig", () => {
  it("is off without a key", () => {
    expect(aiConfig({})).toBeNull();
    expect(aiConfig({ AI_API_KEY: "  " })).toBeNull();
  });

  it("defaults to Google Gemini's free OpenAI-compatible endpoint", () => {
    expect(aiConfig({ AI_API_KEY: "k" })).toEqual({
      provider: "gemini",
      baseURL: AI_PRESETS.gemini.baseURL,
      apiKey: "k",
      model: "gemini-flash-latest",
    });
  });

  it("switches provider, model and endpoint from env", () => {
    expect(aiConfig({ AI_API_KEY: "k", AI_PROVIDER: "Groq" })).toMatchObject({
      provider: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      model: "llama-3.3-70b-versatile",
    });
    expect(
      aiConfig({
        AI_API_KEY: "k",
        AI_PROVIDER: "gemini",
        AI_MODEL: "gemini-2.0-flash",
        AI_BASE_URL: "https://proxy.example/v1/",
      }),
    ).toMatchObject({ model: "gemini-2.0-flash", baseURL: "https://proxy.example/v1" });
    // Unknown provider names fall back to Gemini rather than failing.
    expect(aiConfig({ AI_API_KEY: "k", AI_PROVIDER: "nope" })?.provider).toBe("gemini");
  });
});

describe("request sent to the provider", () => {
  it("uses chat completions with the key, model and tools in OpenAI format", async () => {
    const cfg = aiConfig({ AI_API_KEY: "test-key" })!;
    let url = "";
    let auth = "";
    let body: Record<string, unknown> = {};
    // Same construction as aiModel(), with a fake network that records the request and answers "hi".
    const model = createOpenAI({
      baseURL: cfg.baseURL,
      apiKey: cfg.apiKey,
      name: cfg.provider,
      fetch: async (input, init) => {
        url = String(input);
        auth = new Headers(init?.headers).get("authorization") ?? "";
        body = JSON.parse(String(init?.body));
        const sse = [
          `data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"role":"assistant","content":"hi"},"finish_reason":null}]}`,
          `data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}`,
          "data: [DONE]",
          "",
        ].join("\n\n");
        return new Response(sse, { headers: { "content-type": "text/event-stream" } });
      },
    }).chat(cfg.model);

    const result = streamText({
      model,
      instructions: "system prompt",
      messages: [{ role: "user", content: "مرحبا" }],
      tools: {
        search_products: tool({
          description: "search",
          inputSchema: z.object({ query: z.string() }),
          execute: async () => [],
        }),
      },
    });
    let text = "";
    for await (const part of result.fullStream) if (part.type === "text-delta") text += part.text;

    expect(text).toBe("hi");
    expect(url).toBe(`${AI_PRESETS.gemini.baseURL}/chat/completions`);
    expect(auth).toBe("Bearer test-key");
    expect(body.model).toBe("gemini-flash-latest");
    expect(body.stream).toBe(true);
    const msgs = body.messages as { role: string; content: string }[];
    expect(msgs[0]).toMatchObject({ role: "system", content: "system prompt" });
    const tools = body.tools as { type: string; function: { name: string } }[];
    expect(tools[0]).toMatchObject({ type: "function", function: { name: "search_products" } });
  });
});

describe("server settings for the AI endpoints", () => {
  it("falls back to the VITE_ copies of the Supabase settings", async () => {
    const { serverSupabaseEnv } = await import("../ai-provider.server");
    expect(
      serverSupabaseEnv({ VITE_SUPABASE_URL: "u", VITE_SUPABASE_PUBLISHABLE_KEY: "k" }),
    ).toEqual({
      url: "u",
      anon: "k",
    });
    expect(serverSupabaseEnv({ SUPABASE_URL: "s", VITE_SUPABASE_URL: "v" }).url).toBe("s");
  });

  it("names the missing settings, never their values", async () => {
    const { missingAiSettings } = await import("../ai-provider.server");
    expect(missingAiSettings({})).toEqual([
      "AI_API_KEY",
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
    ]);
    expect(
      missingAiSettings({ VITE_SUPABASE_URL: "u", VITE_SUPABASE_PUBLISHABLE_KEY: "k" }),
    ).toEqual(["AI_API_KEY"]);
    expect(
      missingAiSettings({ AI_API_KEY: "x", SUPABASE_URL: "u", SUPABASE_PUBLISHABLE_KEY: "k" }),
    ).toEqual([]);
  });
});

describe("Gemini compatibility", () => {
  it("strips schema keywords Gemini rejects, at every level", async () => {
    const { stripUnsupportedSchema } = await import("../ai-provider.server");
    const schema = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      additionalProperties: false,
      properties: {
        q: { type: "string" },
        filters: {
          type: "object",
          additionalProperties: false,
          properties: { a: { type: "string" } },
        },
        list: { type: "array", items: [{ type: "object", additionalProperties: false }] },
      },
    };
    expect(stripUnsupportedSchema(schema)).toEqual({
      type: "object",
      properties: {
        q: { type: "string" },
        filters: { type: "object", properties: { a: { type: "string" } } },
        list: { type: "array", items: [{ type: "object" }] },
      },
    });
  });

  it("the Gemini request carries clean tool schemas", async () => {
    const { geminiFetch } = await import("../ai-provider.server");
    let sent = "";
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_i: unknown, init?: RequestInit) => {
      sent = String(init?.body);
      return new Response("{}");
    }) as typeof fetch;
    try {
      await geminiFetch("https://x/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          tools: [
            {
              type: "function",
              function: {
                name: "t",
                parameters: { $schema: "s", additionalProperties: false, type: "object" },
              },
            },
          ],
        }),
      });
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(JSON.parse(sent).tools[0].function.parameters).toEqual({ type: "object" });
  });

  it("diagnostic reason never contains a key", async () => {
    const { safeReason } = await import("../ai-provider.server");
    expect(safeReason({ message: "API key not valid: AIzaSyABCDEFGHIJKLMNOPQRST" })).toBe(
      "API key not valid: [key]",
    );
    expect(
      safeReason({ responseBody: '[{"error":{"message":"Unknown name \\"$schema\\""}}]' }),
    ).toContain("Unknown name");
    expect(safeReason(null)).toBeUndefined();
  });
});
