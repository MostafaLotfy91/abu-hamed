import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Heart, LayoutDashboard, MapPin, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import type { Product } from "@/lib/queries";
import { AddressForm, addressLine, type Address } from "@/components/store/AddressForm";
import { ProductCard } from "@/components/store/ProductCard";
import {
  EmptyState,
  ErrorState,
  ProductGridSkeleton,
  RowSkeleton,
} from "@/components/store/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pageHead } from "@/lib/seo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isPhoneLoginEmail, localPhone } from "@/lib/phone-auth";

export const Route = createFileRoute("/_authenticated/account")({
  head: ({ matches }) =>
    pageHead(matches, { title: { ar: "حسابي", en: "My account" }, noindex: true }),
  component: Account,
});

function Account() {
  const { t } = useI18n();
  const { user, signOut, isStaff } = useAuth();
  // Phone accounts: show the phone, not the internal login address.
  const shownContact = isPhoneLoginEmail(user?.email)
    ? ((user?.user_metadata?.phone as string) ?? (user?.phone ? localPhone(user.phone) : ""))
    : (user?.email ?? user?.phone ?? "");
  const nav = useNavigate();
  return (
    <div className="space-y-6">
      <div className="surface-dark flex flex-wrap items-center justify-between gap-4 p-6 md:p-8">
        <div className="space-y-1">
          <p className="font-display text-2xl md:text-3xl">
            {(user?.user_metadata?.full_name as string) || shownContact}
          </p>
          <p className="text-sm opacity-80" dir="ltr">
            {shownContact}
          </p>
        </div>
        <div className="flex gap-2">
          {isStaff && (
            <Button asChild variant="secondary" size="sm">
              <Link to="/admin">
                <LayoutDashboard className="h-4 w-4" />
                {t("admin")}
              </Link>
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await signOut();
              nav({ to: "/", replace: true });
            }}
          >
            {t("sign_out")}
          </Button>
        </div>
      </div>
      <Tabs defaultValue="profile">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile">{t("profile")}</TabsTrigger>
          <TabsTrigger value="addresses">{t("addresses")}</TabsTrigger>
          <TabsTrigger value="wishlist">{t("wishlist")}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <Profile />
        </TabsContent>
        <TabsContent value="addresses">
          <Addresses />
        </TabsContent>
        <TabsContent value="wishlist">
          <Wishlist />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Profile() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const q = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (q.data) {
      setName(q.data.full_name ?? "");
      setPhone(q.data.phone ?? "");
    }
  }, [q.data]);
  const save = async () => {
    const { error } = await supabase.from("profiles").upsert({
      id: user!.id,
      full_name: name.slice(0, 100),
      phone: phone.slice(0, 30),
      email: user!.email,
    });
    if (error) toast.error(error.message);
    else toast.success(t("saved"));
  };
  return (
    <div className="space-y-3 bg-card p-5 shadow-card md:p-6">
      <div>
        <Label htmlFor="profile-name">{t("full_name")}</Label>
        <Input
          id="profile-name"
          autoComplete="name"
          className="h-11"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="profile-phone">{t("phone")}</Label>
        <Input
          id="profile-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          className="h-11"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <Button onClick={save}>{t("save")}</Button>
    </div>
  );
}

function Addresses() {
  const { t } = useI18n();
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const q = useQuery({
    queryKey: ["addresses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addresses")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  if (q.isLoading) return <RowSkeleton />;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-3">
      {editing ? (
        <div className="bg-card p-5 shadow-card md:p-6">
          <AddressForm
            initial={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onDone={() => {
              setEditing(null);
              q.refetch();
            }}
          />
        </div>
      ) : (
        <Button onClick={() => setEditing("new")}>{t("add_address")}</Button>
      )}
      {!q.data?.length && !editing && (
        <EmptyState icon={<MapPin className="h-8 w-8" />} title={t("no_addresses")} />
      )}
      {q.data?.map((a) => (
        <div key={a.id} className="flex items-center gap-3 bg-card p-5 shadow-card">
          <MapPin className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <p className="font-semibold">{a.label}</p>
            <p className="text-sm text-muted-foreground">{addressLine(a)}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={() => setEditing(a)} aria-label={t("edit")}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("delete")}
            onClick={async () => {
              const { error } = await supabase.from("addresses").delete().eq("id", a.id);
              if (error) toast.error(t("error_title"));
              else q.refetch();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function Wishlist() {
  const { t } = useI18n();
  const q = useQuery({
    queryKey: ["wishlist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wishlist")
        .select("products(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Products that were deactivated since being saved are not shown.
      return (data ?? [])
        .map((r) => r.products)
        .filter((p) => p && (p as Product).is_active) as Product[];
    },
  });
  if (q.isLoading) return <ProductGridSkeleton n={4} />;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data?.length)
    return <EmptyState icon={<Heart className="h-8 w-8" />} title={t("wishlist_empty")} />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {q.data.map((p) => (
        <ProductCard key={p.id} p={p} />
      ))}
    </div>
  );
}
