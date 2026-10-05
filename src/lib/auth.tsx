import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "staff" | "driver" | "customer";
type Ctx = {
  session: Session | null;
  user: User | null;
  ready: boolean;
  roles: Role[];
  isStaff: boolean;
  isAdmin: boolean;
  rolesLoading: boolean;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    let lastUid: string | null | undefined = undefined;
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      const uid = s?.user?.id ?? null;
      // Only update state when the signed-in user actually changes; token refreshes
      // also emit SIGNED_IN and reacting to them caused a refresh loop.
      setSession((prev) => (prev?.access_token === s?.access_token ? prev : s));
      const changed = uid !== lastUid;
      lastUid = uid;
      if (!changed) return;
      if (uid) setTimeout(() => qc.invalidateQueries(), 0);
      if (event === "SIGNED_IN" && s?.user) {
        // ensure a profile row exists (no triggers on auth schema)
        const u = s.user;
        setTimeout(() => {
          supabase
            .from("profiles")
            .upsert(
              { id: u.id, email: u.email ?? null, phone: u.phone ?? null, full_name: (u.user_metadata?.full_name as string) ?? null },
              { onConflict: "id", ignoreDuplicates: true },
            )
            .then(() => {});
        }, 0);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const uid = session?.user.id;
  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["my_roles", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid!);
      return (data ?? []).map((r) => r.role as Role);
    },
  });

  const value: Ctx = {
    session,
    user: session?.user ?? null,
    ready,
    roles,
    isStaff: roles.includes("admin") || roles.includes("staff"),
    isAdmin: roles.includes("admin"),
    rolesLoading: !!uid && rolesLoading,
    signOut: async () => {
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const c = useContext(AuthContext);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
