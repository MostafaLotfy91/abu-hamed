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
import { EmptyState, ProductGridSkeleton, RowSkeleton } from "@/components/store/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "حسابي · My account" }, { name: "description", content: "Profile, addresses and wishlist" }, { property: "og:title", content: "My account" }, { property: "og:description", content: "Profile, addresses and wishlist" }] }),
  component: Account,
});

function Account() {
  const { t } = useI18n();
  const { user, signOut, isStaff } = useAuth();
  const nav = useNavigate();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-3xl bg-primary p-5 text-primary-foreground">
        <div><p className="text-lg font-extrabold">{(user?.user_metadata?.full_name as string) || user?.email || user?.phone}</p><p className="text-sm opacity-80">{user?.email}</p></div>
        <div className="flex gap-2">
          {isStaff && <Button asChild variant="secondary" size="sm"><Link to="/admin"><LayoutDashboard className="h-4 w-4" />{t("admin")}</Link></Button>}
          <Button variant="secondary" size="sm" onClick={async () => { await signOut(); nav({ to: "/", replace: true }); }}>{t("sign_out")}</Button>
        </div>
      </div>
      <Tabs defaultValue="profile">
        <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="profile">{t("profile")}</TabsTrigger><TabsTrigger value="addresses">{t("addresses")}</TabsTrigger><TabsTrigger value="wishlist">{t("wishlist")}</TabsTrigger></TabsList>
        <TabsContent value="profile"><Profile /></TabsContent>
        <TabsContent value="addresses"><Addresses /></TabsContent>
        <TabsContent value="wishlist"><Wishlist /></TabsContent>
      </Tabs>
    </div>
  );
}

function Profile() {
  const { t } = useI18n();
  const { user, isAdmin } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const q = useQuery({ queryKey: ["profile", user?.id], queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle()).data });
  useEffect(() => { if (q.data) { setName(q.data.full_name ?? ""); setPhone(q.data.phone ?? ""); } }, [q.data]);
  const save = async () => {
    const { error } = await supabase.from("profiles").upsert({ id: user!.id, full_name: name.slice(0, 100), phone: phone.slice(0, 30), email: user!.email });
    if (error) toast.error(error.message); else toast.success(t("saved"));
  };
  const claim = async () => {
    const { data } = await supabase.rpc("claim_first_admin");
    if (data) { toast.success("✓"); window.location.href = "/admin"; } else toast.error("Admin already exists");
  };
  return (
    <div className="space-y-3 rounded-3xl bg-card p-4 shadow-card">
      <div><Label>{t("full_name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div><Label>{t("phone")}</Label><Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <Button onClick={save}>{t("save")}</Button>
      {!isAdmin && (
        <p className="pt-4 text-xs text-muted-foreground">
          Store owner setting up? <button className="font-semibold text-primary underline" onClick={claim}>Claim admin access</button> (works only once, while no admin exists).
        </p>
      )}
    </div>
  );
}

function Addresses() {
  const { t } = useI18n();
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const q = useQuery({ queryKey: ["addresses"], queryFn: async () => (await supabase.from("addresses").select("*").order("created_at", { ascending: false })).data ?? [] });
  if (q.isLoading) return <RowSkeleton />;
  return (
    <div className="space-y-3">
      {editing ? (
        <div className="rounded-3xl bg-card p-4 shadow-card"><AddressForm initial={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); q.refetch(); }} /></div>
      ) : (
        <Button onClick={() => setEditing("new")}>{t("add_address")}</Button>
      )}
      {!q.data?.length && !editing && <EmptyState icon={<MapPin className="h-8 w-8" />} title={t("no_addresses")} />}
      {q.data?.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card">
          <MapPin className="h-5 w-5 text-primary" />
          <div className="flex-1"><p className="font-semibold">{a.label}</p><p className="text-sm text-muted-foreground">{addressLine(a)}</p></div>
          <Button size="icon" variant="ghost" onClick={() => setEditing(a)} aria-label={t("edit")}><Pencil className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" aria-label={t("delete")} onClick={async () => { await supabase.from("addresses").delete().eq("id", a.id); q.refetch(); }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
    </div>
  );
}

function Wishlist() {
  const { t } = useI18n();
  const q = useQuery({
    queryKey: ["wishlist"],
    queryFn: async () => (await supabase.from("wishlist").select("products(*)").order("created_at", { ascending: false })).data?.map((r) => r.products).filter(Boolean) as Product[],
  });
  if (q.isLoading) return <ProductGridSkeleton n={4} />;
  if (!q.data?.length) return <EmptyState icon={<Heart className="h-8 w-8" />} title={t("wishlist_empty")} />;
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{q.data.map((p) => <ProductCard key={p.id} p={p} />)}</div>;
}
