import { describe, expect, it } from "vitest";
import { createOpenAI } from "@ai-sdk/openai";
import { isStepCount, streamText, tool } from "ai";
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
      fallbackModels: ["gemini-flash-lite-latest"],
    });
    expect(aiConfig({ AI_API_KEY: "k", AI_FALLBACK_MODELS: "" })?.fallbackModels).toEqual([]);
    expect(
      aiConfig({ AI_API_KEY: "k", AI_FALLBACK_MODELS: " a , gemini-flash-latest,b" })
        ?.fallbackModels,
    ).toEqual(["a", "b"]);
    expect(aiConfig({ AI_API_KEY: "k", AI_PROVIDER: "groq" })?.fallbackModels).toEqual([]);
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

  it("runs a Gemini tool call (thought signature, no index) and sends the signature back", async () => {
    const { geminiFetch } = await import("../ai-provider.server");
    const sse = (...chunks: unknown[]) =>
      new Response(
        [...chunks.map((c) => `data: ${JSON.stringify(c)}`), "data: [DONE]", ""].join("\n\n"),
        { headers: { "content-type": "text/event-stream" } },
      );
    const head = { id: "r", object: "chat.completion.chunk", created: 1, model: "m" };
    const sent: Record<string, unknown>[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_i: unknown, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      if (sent.length === 1)
        // What Gemini actually streams: no "index"/"type", plus extra_content.
        return sse({
          ...head,
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                tool_calls: [
                  {
                    extra_content: { google: { thought_signature: "SIG123" } },
                    function: { arguments: '{"query":"قميص"}', name: "search_products" },
                    id: "call_a",
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        });
      return sse(
        { ...head, choices: [{ index: 0, delta: { role: "assistant", content: "تمام" } }] },
        { ...head, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
      );
    }) as typeof fetch;

    let query = "";
    let text = "";
    try {
      const model = createOpenAI({ baseURL: "https://x/v1", apiKey: "k", fetch: geminiFetch }).chat(
        "m",
      );
      const result = streamText({
        model,
        messages: [{ role: "user", content: "عايز قميص" }],
        tools: {
          search_products: tool({
            description: "search",
            inputSchema: z.object({ query: z.string() }),
            execute: async (input) => {
              query = input.query;
              return [];
            },
          }),
        },
        stopWhen: isStepCount(3),
      });
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") text += part.text;
        if (part.type === "error") throw part.error;
      }
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(query).toBe("قميص");
    expect(text).toBe("تمام");
    const msgs = sent[1].messages as { role: string; tool_calls?: unknown[] }[];
    const call = msgs.find((m) => m.role === "assistant")?.tool_calls?.[0];
    expect(call).toMatchObject({
      id: "call_a",
      extra_content: { google: { thought_signature: "SIG123" } },
    });
  });

  it("asks for low reasoning effort, and resends without it if the model rejects it", async () => {
    const { geminiFetchFor } = await import("../ai-provider.server");
    const sent: Record<string, unknown>[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_i: unknown, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: sent.length === 1 ? 400 : 200 });
    }) as typeof fetch;
    try {
      const res = await geminiFetchFor([])("https://x/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({ model: "m", messages: [] }),
      });
      expect(res.status).toBe(200);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(sent[0].reasoning_effort).toBe("low");
    expect(sent[1].reasoning_effort).toBeUndefined();
  });

  it("on 429 tries the fallback models in order; an unavailable one keeps the earlier answer", async () => {
    const { geminiFetchFor } = await import("../ai-provider.server");
    const run = async (answers: Record<string, number>) => {
      const models: string[] = [];
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async (_i: unknown, init?: RequestInit) => {
        const m = JSON.parse(String(init?.body)).model as string;
        models.push(m);
        return new Response("{}", { status: answers[m] });
      }) as typeof fetch;
      try {
        const res = await geminiFetchFor(["lite", "other"])("https://x/v1/chat/completions", {
          method: "POST",
          body: JSON.stringify({ model: "main", messages: [] }),
        });
        return { status: res.status, models };
      } finally {
        globalThis.fetch = realFetch;
      }
    };
    expect(await run({ main: 200 })).toEqual({ status: 200, models: ["main"] });
    expect(await run({ main: 429, lite: 200, other: 200 })).toEqual({
      status: 200,
      models: ["main", "lite"],
    });
    expect(await run({ main: 429, lite: 404, other: 429 })).toEqual({
      status: 429,
      models: ["main", "lite", "other"],
    });
  });

  it("tool calls with no known signature get Google's placeholder", async () => {
    const { prepareGeminiRequest } = await import("../ai-provider.server");
    const out = JSON.parse(
      prepareGeminiRequest(
        JSON.stringify({
          messages: [
            {
              role: "assistant",
              tool_calls: [{ id: "unknown", type: "function", function: { name: "t" } }],
            },
          ],
        }),
      ),
    );
    expect(out.messages[0].tool_calls[0].extra_content.google.thought_signature).toBe(
      "skip_thought_signature_validator",
    );
    expect(prepareGeminiRequest("not json")).toBe("not json");
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
