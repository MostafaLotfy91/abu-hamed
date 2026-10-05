import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { StoreLogo } from "@/components/store/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "تسجيل الدخول · Sign in" },
      { name: "description", content: "سجل دخولك أو أنشئ حساب جديد. Sign in or create an account." },
      { property: "og:title", content: "تسجيل الدخول · Sign in" },
      { property: "og:description", content: "Sign in or create an account." },
    ],
  }),
  component: AuthPage,
});

function safePath(p?: string) {
  return p && p.startsWith("/") && !p.startsWith("//") ? p : "/";
}

function AuthPage() {
  const { t, toggle } = useI18n();
  const { user, ready } = useAuth();
  const nav = useNavigate();
  const { redirect } = Route.useSearch();
  const dest = safePath(redirect);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) nav({ to: dest, replace: true });
  }, [ready, user, dest, nav]);

  const emailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}${dest}`, data: { full_name: name } },
        });
        if (error) throw error;
        if (!data.session) toast.success(t("check_email"));
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const phoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (!otpSent) {
        const { error } = await supabase.auth.signInWithOtp({ phone });
        if (error) throw error;
        setOtpSent(true);
      } else {
        const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: "sms" });
        if (error) throw error;
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    if (dest !== "/") sessionStorage.setItem("auth.redirect", dest);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error(r.error.message);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-soft p-4">
      <div className="w-full max-w-md space-y-5 rounded-3xl bg-card p-6 shadow-card">
        <div className="flex items-center justify-between"><StoreLogo /><Button variant="ghost" size="sm" onClick={toggle}>{t("language")}</Button></div>
        <h1 className="text-2xl font-extrabold">{mode === "in" ? t("sign_in") : t("sign_up")}</h1>
        <Button variant="outline" className="w-full" onClick={google}>{t("continue_google")}</Button>
        <div className="flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />{t("or")}<div className="h-px flex-1 bg-border" /></div>
        <Tabs defaultValue="email">
          <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="email">{t("email")}</TabsTrigger><TabsTrigger value="phone">{t("phone")}</TabsTrigger></TabsList>
          <TabsContent value="email">
            <form onSubmit={emailSubmit} className="space-y-3 pt-2">
              {mode === "up" && <div><Label>{t("full_name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></div>}
              <div><Label>{t("email")}</Label><Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div><Label>{t("password")}</Label><Input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
              <Button type="submit" className="w-full" disabled={busy}>{mode === "in" ? t("sign_in") : t("sign_up")}</Button>
            </form>
            <button className="mt-3 w-full text-center text-sm font-semibold text-primary" onClick={() => setMode(mode === "in" ? "up" : "in")}>
              {mode === "in" ? t("sign_up") : t("sign_in")}
            </button>
          </TabsContent>
          <TabsContent value="phone">
            <form onSubmit={phoneSubmit} className="space-y-3 pt-2">
              <div><Label>{t("phone")}</Label><Input type="tel" dir="ltr" placeholder="+20..." value={phone} onChange={(e) => setPhone(e.target.value)} required disabled={otpSent} /></div>
              {otpSent && <div><Label>{t("otp_code")}</Label><Input dir="ltr" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value)} required maxLength={6} /></div>}
              <Button type="submit" className="w-full" disabled={busy}>{otpSent ? t("verify") : t("send_code")}</Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
