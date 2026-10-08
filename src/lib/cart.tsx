import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** Cart quantities are always whole pieces. */
export type CartItem = {
  key: string; // productId|variantId
  productId: string;
  variantId: string | null;
  name_ar: string;
  name_en: string;
  variant_ar?: string | null;
  variant_en?: string | null;
  size?: string | null;
  color_ar?: string | null;
  color_en?: string | null;
  color_hex?: string | null;
  image?: string | null;
  maxQty?: number;
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
const LS = "app.cart.v2";

const clampQty = (q: number, max?: number) => {
  const n = Math.max(1, Math.round(q));
  return max != null && max > 0 ? Math.min(n, max) : n;
};

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

  const add = useCallback<Ctx["add"]>((item, qty = 1) => {
    const key = `${item.productId}|${item.variantId ?? ""}`;
    setItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing)
        return prev.map((i) =>
          i.key === key ? { ...i, ...item, quantity: clampQty(i.quantity + qty, item.maxQty) } : i,
        );
      return [...prev, { ...item, key, quantity: clampQty(qty, item.maxQty) }];
    });
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setItems((prev) =>
      prev.flatMap((i) =>
        i.key !== key ? [i] : qty < 1 ? [] : [{ ...i, quantity: clampQty(qty, i.maxQty) }],
      ),
    );
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      items,
      count: items.reduce((s, i) => s + i.quantity, 0),
      subtotal: items.reduce((s, i) => s + Math.round(i.price * i.quantity * 100) / 100, 0),
      coupon,
      setCoupon,
      add,
      setQty,
      setNotes: (key, notes) =>
        setItems((p) => p.map((i) => (i.key === key ? { ...i, notes } : i))),
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
