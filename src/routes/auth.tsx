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
import { pageHead } from "@/lib/seo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MIN_PASSWORD, phoneLoginEmail } from "@/lib/phone-auth";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: ({ matches }) =>
    pageHead(matches, { title: { ar: "تسجيل الدخول", en: "Sign in" }, noindex: true }),
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) nav({ to: dest, replace: true });
  }, [ready, user, dest, nav]);

  // After hydration, adopt anything typed or autofilled into the server-rendered inputs, so the next render
  // of these controlled inputs doesn't clear it.
  useEffect(() => {
    const dom = (id: string) =>
      (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
    if (dom("auth-email")) setEmail(dom("auth-email"));
    if (dom("auth-password")) setPassword(dom("auth-password"));
    if (dom("auth-phone")) setPhone(dom("auth-phone"));
  }, []);

  // Values are read from the form, not React state: text typed (or autofilled) before hydration is in the DOM
  // but never reached onChange.
  const field = (e: React.FormEvent<HTMLFormElement>, n: string) =>
    String(new FormData(e.currentTarget).get(n) ?? "");

  const emailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = field(e, "email").trim();
    const password = field(e, "password");
    const name = field(e, "full_name").trim();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${dest}`,
            data: { full_name: name },
          },
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

  const phoneSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const phoneValue = field(e, "phone").trim();
    const pw = field(e, "password");
    const fullName = field(e, "full_name").trim();
    const loginEmail = phoneLoginEmail(phoneValue);
    if (!loginEmail) return toast.error(t("invalid_phone"));
    setBusy(true);
    try {
      if (mode === "up") {
        const res = await fetch("/api/phone-signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phone: phoneValue, password: pw, full_name: fullName }),
        });
        if (!res.ok) {
          const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
          throw new Error(
            code === "phone_taken"
              ? t("phone_taken")
              : code === "invalid_phone"
                ? t("invalid_phone")
                : code === "rate_limited"
                  ? t("try_later")
                  : t("error_title"),
          );
        }
      }
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: pw });
      if (error) throw new Error(t("phone_login_failed"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    if (dest !== "/") sessionStorage.setItem("auth.redirect", dest);
    const r = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (r.error) toast.error(r.error.message);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-soft p-4">
      <div className="w-full max-w-md space-y-5 rounded-3xl bg-card p-6 shadow-card">
        <div className="flex items-center justify-between">
          <StoreLogo />
          <Button variant="ghost" size="sm" onClick={toggle}>
            {t("language")}
          </Button>
        </div>
        <h1 className="text-2xl font-extrabold">{mode === "in" ? t("sign_in") : t("sign_up")}</h1>
        <Button variant="outline" className="w-full" onClick={google}>
          {t("continue_google")}
        </Button>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          {t("or")}
          <div className="h-px flex-1 bg-border" />
        </div>
        <Tabs defaultValue="email">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="email">{t("email")}</TabsTrigger>
            <TabsTrigger value="phone">{t("phone")}</TabsTrigger>
          </TabsList>
          <TabsContent value="email">
            <form onSubmit={emailSubmit} className="space-y-3 pt-2">
              {mode === "up" && (
                <div>
                  <Label htmlFor="auth-name">{t("full_name")}</Label>
                  <Input
                    id="auth-name"
                    name="full_name"
                    autoComplete="name"
                    className="h-11"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={100}
                  />
                </div>
              )}
              <div>
                <Label htmlFor="auth-email">{t("email")}</Label>
                <Input
                  id="auth-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  dir="ltr"
                  className="h-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="auth-password">{t("password")}</Label>
                <Input
                  id="auth-password"
                  name="password"
                  type="password"
                  autoComplete={mode === "in" ? "current-password" : "new-password"}
                  dir="ltr"
                  className="h-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="h-11 w-full" disabled={busy}>
                {mode === "in" ? t("sign_in") : t("sign_up")}
              </Button>
            </form>
            <button
              className="mt-3 w-full text-center text-sm font-semibold text-primary"
              onClick={() => setMode(mode === "in" ? "up" : "in")}
            >
              {mode === "in" ? t("sign_up") : t("sign_in")}
            </button>
          </TabsContent>
          <TabsContent value="phone">
            <form onSubmit={phoneSubmit} className="space-y-3 pt-2">
              {mode === "up" && (
                <div>
                  <Label htmlFor="auth-phone-name">{t("full_name")}</Label>
                  <Input
                    id="auth-phone-name"
                    name="full_name"
                    autoComplete="name"
                    className="h-11"
                    required
                    maxLength={100}
                  />
                </div>
              )}
              <div>
                <Label htmlFor="auth-phone">{t("phone")}</Label>
                <Input
                  id="auth-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  className="h-11"
                  placeholder="01xxxxxxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="auth-phone-password">{t("password")}</Label>
                <Input
                  id="auth-phone-password"
                  name="password"
                  type="password"
                  autoComplete={mode === "in" ? "current-password" : "new-password"}
                  dir="ltr"
                  className="h-11"
                  required
                  minLength={MIN_PASSWORD}
                />
              </div>
              <Button type="submit" className="h-11 w-full" disabled={busy}>
                {mode === "in" ? t("sign_in") : t("sign_up")}
              </Button>
            </form>
            <button
              className="mt-3 w-full text-center text-sm font-semibold text-primary"
              onClick={() => setMode(mode === "in" ? "up" : "in")}
            >
              {mode === "in" ? t("sign_up") : t("sign_in")}
            </button>
            <p className="mt-2 text-center text-xs text-muted-foreground">{t("phone_forgot")}</p>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
