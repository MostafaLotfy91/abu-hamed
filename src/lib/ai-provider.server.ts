// AI model for the shopping assistant and admin insights. Any OpenAI-compatible provider, chosen with env vars
// (server only, never VITE_):
//   AI_API_KEY    required; e.g. a free Google AI Studio key (https://aistudio.google.com/apikey)
//   AI_PROVIDER   "gemini" (default) | "groq" | "openrouter" | "openai"
//   AI_MODEL      optional; overrides the provider's default model
//   AI_BASE_URL   optional; any other OpenAI-compatible endpoint (then AI_PROVIDER is only a label)
// Both features need tool calling; the defaults below support it on the free tiers.
import { createOpenAI } from "@ai-sdk/openai";

export const AI_PRESETS = {
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
  },
  groq: { baseURL: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    model: "meta-llama/llama-3.3-70b-instruct:free",
  },
  openai: { baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" },
} as const;

export type AiProvider = keyof typeof AI_PRESETS;
export type AiConfig = { provider: string; baseURL: string; apiKey: string; model: string };

/** The configured provider, or null when AI_API_KEY is missing (the features then answer "not configured"). */
export function aiConfig(env: Record<string, string | undefined> = process.env): AiConfig | null {
  const apiKey = env["AI_API_KEY"]?.trim();
  if (!apiKey) return null;
  const name = (env["AI_PROVIDER"]?.trim().toLowerCase() || "gemini") as AiProvider;
  const preset = AI_PRESETS[name] ?? AI_PRESETS.gemini;
  return {
    provider: AI_PRESETS[name] ? name : "gemini",
    baseURL: (env["AI_BASE_URL"]?.trim() || preset.baseURL).replace(/\/+$/, ""),
    apiKey,
    model: env["AI_MODEL"]?.trim() || preset.model,
  };
}

/** Chat-completions model (the endpoint every OpenAI-compatible provider implements, incl. tool calls). */
export function aiModel(cfg: AiConfig) {
  return createOpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey, name: cfg.provider }).chat(
    cfg.model,
  );
}

/**
 * Supabase settings the AI endpoints need on the server. The VITE_ copies (which every deployment has) are used
 * when the server-only names aren't set.
 */
export function serverSupabaseEnv(env: Record<string, string | undefined> = process.env) {
  const url = env["SUPABASE_URL"] || env["VITE_SUPABASE_URL"];
  const anon = env["SUPABASE_PUBLISHABLE_KEY"] || env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  return { url, anon };
}

/** Names (never values) of the settings an AI endpoint is missing, for a clear "not configured" answer. */
export function missingAiSettings(env: Record<string, string | undefined> = process.env) {
  const { url, anon } = serverSupabaseEnv(env);
  return [
    ...(aiConfig(env) ? [] : ["AI_API_KEY"]),
    ...(url ? [] : ["SUPABASE_URL"]),
    ...(anon ? [] : ["SUPABASE_PUBLISHABLE_KEY"]),
  ];
}
