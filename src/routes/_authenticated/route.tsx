import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// Cosmetic gate only — RLS is the real security boundary. We read the locally
// stored session instead of calling getUser() on every navigation: a network
// check per navigation could fail transiently (e.g. rate limit), bounce the user
// to /auth, which then sends them straight back here, creating a refresh loop.
async function currentSession() {
  const first = await supabase.auth.getSession();
  if (first.data.session || !first.error) return first.data.session;
  // Transient failure (network / rate limit): wait briefly and try once more.
  await new Promise((r) => setTimeout(r, 1500));
  return (await supabase.auth.getSession()).data.session;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const session = await currentSession();
    if (!session) throw redirect({ to: "/auth", search: { redirect: location.pathname } });
    return { user: session.user };
  },
  component: () => <Outlet />,
});
