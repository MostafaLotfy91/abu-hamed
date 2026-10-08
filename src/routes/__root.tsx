import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { THEME_SCRIPT, ThemeProvider } from "@/lib/theme";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import {
  SettingsProvider,
  settingsQuery,
  themeVars,
  useSettings,
  type StoreSettings,
} from "@/lib/store-settings";
import { pageHead, storeName } from "@/lib/seo";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { SiteShell } from "@/components/store/SiteShell";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          الصفحة غير موجودة · Page not found
        </h2>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            الرئيسية · Home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          حدث خطأ · Something went wrong
        </h1>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            حاول مرة أخرى · Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground"
          >
            الرئيسية · Home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Store settings are loaded on the server so the first HTML already has the store's name, colours and meta.
  loader: async ({ context }): Promise<{ settings: StoreSettings | null }> => {
    try {
      return { settings: (await context.queryClient.ensureQueryData(settingsQuery)) ?? null };
    } catch {
      return { settings: null };
    }
  },
  head: ({ loaderData, matches }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: loaderData?.settings?.primary_color ?? "#111111" },
      ...(storeName(loaderData?.settings ?? null)
        ? [{ property: "og:site_name", content: storeName(loaderData?.settings ?? null) }]
        : []),
      ...pageHead(matches).meta,
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      ...(import.meta.env.VITE_SUPABASE_URL
        ? [
            {
              rel: "preconnect",
              href: import.meta.env.VITE_SUPABASE_URL as string,
              crossOrigin: "anonymous" as const,
            },
          ]
        : []),
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      loaderData?.settings?.logo_url
        ? { rel: "icon", href: loaderData.settings.logo_url }
        : { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      ...(loaderData?.settings?.logo_url
        ? [{ rel: "apple-touch-icon", href: loaderData.settings.logo_url }]
        : []),
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const settings = Route.useLoaderData()?.settings ?? null;
  const lang = settings?.default_language === "en" ? "en" : "ar";
  return (
    // suppressHydrationWarning: the head script may add class="dark" before React hydrates.
    <html
      suppressHydrationWarning
      lang={lang}
      dir={lang === "ar" ? "rtl" : "ltr"}
      style={themeVars(settings) as React.CSSProperties}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function LangFromSettings({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  return (
    <I18nProvider defaultLang={settings?.default_language === "en" ? "en" : "ar"}>
      {children}
    </I18nProvider>
  );
}

function Chrome() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (path.startsWith("/admin") || path.startsWith("/auth")) return <Outlet />;
  return (
    <SiteShell>
      <Outlet />
    </SiteShell>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { settings } = Route.useLoaderData();
  // Marks the moment React owns the server-rendered page (used by the E2E tests before they interact).
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SettingsProvider initial={settings}>
          <LangFromSettings>
            <AuthProvider>
              <CartProvider>
                <Chrome />
                <Toaster position="top-center" richColors />
              </CartProvider>
            </AuthProvider>
          </LangFromSettings>
        </SettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
