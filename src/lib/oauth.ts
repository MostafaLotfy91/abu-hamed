// Google sign-in through Supabase (works on any host). The button is shown only when the Google provider is
// enabled in the Supabase project (Authentication -> Providers); otherwise it would lead to an error page.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** Whether the Supabase project has Google sign-in turned on (public auth settings). */
export function useGoogleEnabled() {
  return useQuery({
    queryKey: ["auth-settings", "google"],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: PUBLISHABLE_KEY },
      });
      if (!res.ok) return false;
      const s = (await res.json()) as { external?: Record<string, boolean> };
      return !!s.external?.google;
    },
  });
}

/** Sends the browser to Google; afterwards Supabase returns to /auth, which forwards to `dest`. */
export function signInWithGoogle(dest: string) {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth?redirect=${encodeURIComponent(dest)}` },
  });
}
