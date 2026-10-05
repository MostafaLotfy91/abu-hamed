import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type StoreSettings = Tables<"store_settings">;
export type FeatureFlags = {
  delivery_tracking?: boolean;
  ai_assistant?: boolean;
  ai_analytics?: boolean;
  online_payment?: boolean;
  loyalty?: boolean;
};

export const settingsQuery = {
  queryKey: ["store_settings"],
  queryFn: async () => {
    const { data, error } = await supabase.from("store_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    return data;
  },
  staleTime: 5 * 60_000,
};

type Ctx = { settings: StoreSettings | null; loading: boolean; features: FeatureFlags };
const SettingsContext = createContext<Ctx>({ settings: null, loading: true, features: {} });

function readableOn(hex: string) {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return "oklch(0.99 0 0)";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "oklch(0.2 0.02 160)" : "oklch(0.99 0 0)";
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery(settingsQuery);

  useEffect(() => {
    if (!data) return;
    const root = document.documentElement.style;
    if (data.primary_color) {
      root.setProperty("--primary", data.primary_color);
      root.setProperty("--primary-foreground", readableOn(data.primary_color));
    }
    if (data.secondary_color) {
      root.setProperty("--brand-secondary", data.secondary_color);
      root.setProperty("--brand-secondary-foreground", readableOn(data.secondary_color));
    }
    document.title = data.name_ar || data.name_en || document.title;
  }, [data]);

  return (
    <SettingsContext.Provider
      value={{ settings: data ?? null, loading: isLoading, features: ((data?.features ?? {}) as FeatureFlags) }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
