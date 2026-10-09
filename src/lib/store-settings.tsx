import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { readableOn } from "./color-contrast";

export type StoreSettings = Tables<"store_settings">;
export type FeatureFlags = {
  delivery_tracking?: boolean;
  ai_assistant?: boolean;
  ai_analytics?: boolean;
  online_payment?: boolean;
  loyalty?: boolean;
  whatsapp_button?: boolean;
  auto_dispatch_enabled?: boolean;
};

export const settingsQuery = {
  queryKey: ["store_settings"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("store_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  staleTime: 5 * 60_000,
};

type Ctx = { settings: StoreSettings | null; loading: boolean; features: FeatureFlags };
const SettingsContext = createContext<Ctx>({ settings: null, loading: true, features: {} });

/** CSS custom properties for the store colours (also rendered inline on <html> by the server). */
export function themeVars(
  s: Pick<StoreSettings, "primary_color" | "secondary_color"> | null,
): Record<string, string> {
  const v: Record<string, string> = {};
  if (s?.primary_color) {
    // --primary itself is derived in CSS, so dark mode can lighten a dark brand colour (styles.css).
    v["--brand-primary"] = s.primary_color;
    v["--brand-primary-foreground"] = readableOn(s.primary_color);
  }
  if (s?.secondary_color) {
    v["--brand-secondary"] = s.secondary_color;
    v["--brand-secondary-foreground"] = readableOn(s.secondary_color);
  }
  return v;
}

/**
 * Provides store settings. `initial` comes from the root route loader (server-rendered), so the first paint already
 * has the store's name, logo and colours; nothing waits on a client fetch.
 */
export function SettingsProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: StoreSettings | null;
}) {
  const { data, isLoading } = useQuery({
    ...settingsQuery,
    ...(initial ? { initialData: initial } : {}),
  });

  useEffect(() => {
    if (isLoading) return;
    const root = document.documentElement.style;
    if (data?.primary_color) {
      root.setProperty("--brand-primary", data.primary_color);
      root.setProperty("--brand-primary-foreground", readableOn(data.primary_color));
    }
    if (data?.secondary_color) {
      root.setProperty("--brand-secondary", data.secondary_color);
      root.setProperty("--brand-secondary-foreground", readableOn(data.secondary_color));
    }
  }, [data, isLoading]);

  return (
    <SettingsContext.Provider
      value={{
        settings: data ?? null,
        loading: isLoading,
        features: (data?.features ?? {}) as FeatureFlags,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
