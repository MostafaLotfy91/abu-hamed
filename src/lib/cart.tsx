import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { snapQty } from "./format";

export type CartItem = {
  key: string; // productId|variantId
  productId: string;
  variantId: string | null;
  name_ar: string;
  name_en: string;
  variant_ar?: string | null;
  variant_en?: string | null;
  image?: string | null;
  unit: string;
  step: number;
  minQty: number;
  price: number; // display snapshot; server recomputes at checkout
  quantity: number;
  notes?: string;
};

type Ctx = {
  items: CartItem[];
  count: number;
  subtotal: number;
  coupon: string | null;
  setCoupon: (c: string | null) => void;
  add: (item: Omit<CartItem, "key" | "quantity">, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  setNotes: (key: string, notes: string) => void;
  remove: (key: string) => void;
  clear: () => void;
  qtyOf: (productId: string, variantId?: string | null) => number;
  drawerOpen: boolean;
  setDrawerOpen: (o: boolean) => void;
};

const CartContext = createContext<Ctx | null>(null);
const LS = "app.cart.v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS);
      if (raw) {
        const parsed = JSON.parse(raw);
        setItems(parsed.items ?? []);
        setCoupon(parsed.coupon ?? null);
      }
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(LS, JSON.stringify({ items, coupon }));
  }, [items, coupon, loaded]);

  const add = useCallback<Ctx["add"]>((item, qty) => {
    const key = `${item.productId}|${item.variantId ?? ""}`;
    setItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      const inc = qty ?? (existing ? item.step : Math.max(item.minQty, item.step));
      if (existing) {
        return prev.map((i) => (i.key === key ? { ...i, quantity: snapQty(i.quantity + inc, i.step, i.minQty) } : i));
      }
      return [...prev, { ...item, key, quantity: snapQty(inc, item.step, item.minQty) }];
    });
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setItems((prev) =>
      prev.flatMap((i) => {
        if (i.key !== key) return [i];
        if (qty < i.minQty - 1e-9) return [];
        return [{ ...i, quantity: snapQty(qty, i.step, i.minQty) }];
      }),
    );
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      items,
      count: items.length,
      subtotal: items.reduce((s, i) => s + Math.round(i.price * i.quantity * 100) / 100, 0),
      coupon,
      setCoupon,
      add,
      setQty,
      setNotes: (key, notes) => setItems((p) => p.map((i) => (i.key === key ? { ...i, notes } : i))),
      remove: (key) => setItems((p) => p.filter((i) => i.key !== key)),
      clear: () => {
        setItems([]);
        setCoupon(null);
      },
      qtyOf: (pid, vid = null) => items.find((i) => i.key === `${pid}|${vid ?? ""}`)?.quantity ?? 0,
      drawerOpen,
      setDrawerOpen,
    }),
    [items, coupon, add, setQty, drawerOpen],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const c = useContext(CartContext);
  if (!c) throw new Error("useCart outside provider");
  return c;
}
