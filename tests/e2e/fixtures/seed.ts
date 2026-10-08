/**
 * Test-data seeding for the E2E suite, via @supabase/supabase-js.
 *
 * - Uses SUPABASE_SERVICE_ROLE_KEY from .env.test ONLY (see env.ts) and runs in Node, never in the browser.
 * - Refuses to touch a non-local Supabase unless E2E_ALLOW_REMOTE=staging (same guard as the config).
 * - Everything it creates carries a run tag (E2E-<TAG>) so `cleanupTag` can remove it.
 *
 * RPC / table names come from supabase/migrations:
 *   grant_admin_by_email (service-role only), place_order, request_return, driver_accept_order,
 *   driver_set_status, admin_add_driver (admin JWT only, so the seed writes user_roles/driver_profiles directly).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ACCOUNTS,
  E2E_READY,
  SKIP_REASON,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  assertSafeTarget,
  type Role,
} from "./env";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, "public", any>;

let svc: Db | null = null;

/** Service-role client. Throws (never silently continues) if the environment is incomplete or unsafe. */
export function service(): Db {
  if (!E2E_READY) throw new Error(SKIP_REASON);
  assertSafeTarget(SUPABASE_URL, "Supabase URL");
  svc ??= createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return svc;
}

/** Anonymous-key client signed in as one of the test accounts (RPCs that use auth.uid()). */
export async function signedIn(role: Role): Promise<Db> {
  assertSafeTarget(SUPABASE_URL, "Supabase URL");
  const c: Db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword(ACCOUNTS[role]);
  if (error) throw new Error(`sign in as ${role} failed: ${error.message}`);
  return c;
}

/** Throws on a Supabase error. `data` is typed non-null; callers using maybeSingle() re-type it as `| null`. */
function must<T>(
  res: { data: T; error: { message: string } | null },
  what: string,
): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as NonNullable<T>;
}

/* ------------------------------------------------------------------ users -- */

async function findUserId(email: string) {
  const db = service();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureUser(role: Role, fullName: string, phone: string) {
  const db = service();
  const { email, password } = ACCOUNTS[role];
  let id = await findUserId(email);
  if (!id) {
    const res = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (res.error) throw new Error(`create ${role} user: ${res.error.message}`);
    id = res.data.user.id;
  } else {
    const res = await db.auth.admin.updateUserById(id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (res.error) throw new Error(`update ${role} user: ${res.error.message}`);
  }
  must(
    await db
      .from("profiles")
      .upsert({ id, email, full_name: fullName, phone }, { onConflict: "id" }),
    `profile ${role}`,
  );
  return id;
}

async function ensureRole(userId: string, role: "admin" | "driver") {
  const db = service();
  const existing = must(
    await db.from("user_roles").select("id").eq("user_id", userId).eq("role", role),
    "read roles",
  );
  if (!existing?.length)
    must(await db.from("user_roles").insert({ user_id: userId, role }), `grant ${role}`);
}

export type AccountIds = Record<Role, string>;
let accountsCache: Promise<AccountIds> | null = null;

/**
 * Creates (or reuses) the three test accounts and their roles:
 *  admin    -> grant_admin_by_email RPC (service role only)
 *  driver   -> user_roles 'driver' + active driver_profiles row (what admin_add_driver does; that RPC needs an admin JWT)
 *  customer -> no staff/driver role, one saved address
 */
export function ensureAccounts(): Promise<AccountIds> {
  accountsCache ??= (async () => {
    const db = service();
    const admin = await ensureUser("admin", "E2E Admin", "01000000001");
    const customer = await ensureUser("customer", "عميل اختبار", "01000000002");
    const driver = await ensureUser("driver", "مندوب اختبار", "01000000003");
    must(
      await db.rpc("grant_admin_by_email", { _email: ACCOUNTS.admin.email }),
      "grant_admin_by_email",
    );
    await ensureRole(driver, "driver");
    must(
      await db
        .from("driver_profiles")
        .upsert(
          { user_id: driver, is_active: true, status: "available" },
          { onConflict: "user_id" },
        ),
      "driver profile",
    );
    // The customer and driver must not be staff, or the access-control specs would be meaningless.
    await db
      .from("user_roles")
      .delete()
      .eq("user_id", customer)
      .in("role", ["admin", "staff", "driver"]);
    await db.from("user_roles").delete().eq("user_id", driver).in("role", ["admin", "staff"]);
    await ensureAddress(customer);
    return { admin, customer, driver };
  })();
  return accountsCache;
}

export async function ensureAddress(userId: string) {
  const db = service();
  const rows = must(
    await db.from("addresses").select("id").eq("user_id", userId).eq("label", "E2E"),
    "read address",
  );
  if (rows?.length) return rows[0].id as string;
  const row = must(
    await db
      .from("addresses")
      .insert({
        user_id: userId,
        label: "E2E",
        recipient_name: "عميل اختبار",
        phone: "01000000002",
        city: "القاهرة",
        area: "مدينة نصر",
        street: "شارع الاختبار",
        building: "1",
        floor: "2",
        apartment: "3",
        is_default: true,
      })
      .select("id")
      .single(),
    "insert address",
  );
  return row.id as string;
}

/* --------------------------------------------------------------- settings -- */

/** WhatsApp number/templates the specs assert against (store_settings is the source of truth in the app). */
export const WA = {
  number: "201012345678",
  general: { ar: "مرحبا {store_name}", en: "Hello {store_name}" },
  product: {
    ar: "استفسار عن {product_name} مقاس {size} لون {color}",
    en: "About {product_name} size {size} color {color}",
  },
  order: { ar: "استفسار عن الطلب رقم {order_number}", en: "Question about order {order_number}" },
};

export type SettingsRow = Record<string, unknown> & { features: Record<string, unknown> | null };

export async function readSettings(): Promise<SettingsRow> {
  return must(
    await service().from("store_settings").select("*").eq("id", 1).single(),
    "read store_settings",
  ) as SettingsRow;
}

/** Turns on the flags/values the suite needs. COD only: online_payment stays off. */
export async function applyBaselineSettings(current?: SettingsRow) {
  const s = current ?? (await readSettings());
  must(
    await service()
      .from("store_settings")
      .update({
        features: {
          ...(s.features ?? {}),
          delivery_tracking: true,
          whatsapp_button: true,
          ai_assistant: true,
          online_payment: false,
        },
        whatsapp_enabled: true,
        whatsapp_number: WA.number,
        whatsapp_message_general_ar: WA.general.ar,
        whatsapp_message_general_en: WA.general.en,
        whatsapp_message_product_ar: WA.product.ar,
        whatsapp_message_product_en: WA.product.en,
        whatsapp_message_order_ar: WA.order.ar,
        whatsapp_message_order_en: WA.order.en,
        return_window_days: 14,
        min_order_amount: 0,
        default_language: "ar",
      })
      .eq("id", 1),
    "baseline settings",
  );
}

/** Restores a snapshot taken by global setup (drops id/updated_at). */
export async function restoreSettings(snapshot: SettingsRow) {
  const { id: _id, updated_at: _u, ...rest } = snapshot;
  must(await service().from("store_settings").update(rest).eq("id", 1), "restore settings");
}

export async function updateSettings(patch: Record<string, unknown>) {
  must(await service().from("store_settings").update(patch).eq("id", 1), "update settings");
}

/* ---------------------------------------------------------------- catalog -- */

export type Catalog = {
  tag: string;
  categoryId: string;
  category: { ar: string; en: string };
  productId: string;
  product: { ar: string; en: string };
  sku: string;
  price: number;
  color: { ar: string; en: string; hex: string };
  /** S is out of stock, M and L have 50 each (several specs order from the same worker catalog). */
  variants: Record<"S" | "M" | "L", string>;
  couponCode: string;
  couponPercent: number;
};

/** One clothes category, a shirt with Black S(0)/M(50)/L(50) variants, and a 10% coupon. */
export async function createCatalog(tag: string): Promise<Catalog> {
  const db = service();
  const category = { ar: `قسم اختبار ${tag}`, en: `E2E Dept ${tag}` };
  const cat = must(
    await db
      .from("categories")
      .insert({
        name_ar: category.ar,
        name_en: category.en,
        size_type: "clothes",
        profile: "clothes",
        sort_order: -1,
        is_active: true,
      })
      .select("id")
      .single(),
    "insert category",
  );
  const product = { ar: `قميص اختبار ${tag}`, en: `E2E Shirt ${tag}` };
  const sku = `E2E-${tag}`;
  const price = 500;
  const p = must(
    await db
      .from("products")
      .insert({
        category_id: cat.id,
        name_ar: product.ar,
        name_en: product.en,
        sku,
        price,
        stock: 10,
        is_active: true,
        gender: "men",
        season: "all",
        brand: `E2E ${tag}`,
        description_ar: "منتج تجريبي للاختبارات الآلية",
        description_en: "Product used by automated tests",
      })
      .select("id")
      .single(),
    "insert product",
  );
  const color = { ar: "أسود", en: "Black", hex: "#111111" };
  const stock = { S: 0, M: 50, L: 50 } as const;
  const rows = (["S", "M", "L"] as const).map((size, i) => ({
    product_id: p.id,
    size,
    color_ar: color.ar,
    color_en: color.en,
    color_hex: color.hex,
    name_ar: `${size} / ${color.ar}`,
    name_en: `${size} / ${color.en}`,
    sku: `${sku}-BLK-${size}`,
    stock: stock[size],
    sort_order: 100 + i,
    price: null,
    is_active: true,
  }));
  const vs = must(
    await db.from("product_variants").insert(rows).select("id,size"),
    "insert variants",
  ) as { id: string; size: "S" | "M" | "L" }[];
  const couponCode = `E2E${tag}`;
  must(
    await db.from("coupons").insert({
      code: couponCode,
      discount_type: "percent",
      value: 10,
      min_order: 0,
      is_active: true,
    }),
    "insert coupon",
  );
  return {
    tag,
    categoryId: cat.id,
    category,
    productId: p.id,
    product,
    sku,
    price,
    color,
    variants: Object.fromEntries(vs.map((v) => [v.size, v.id])) as Catalog["variants"],
    couponCode,
    couponPercent: 10,
  };
}

export type ProfileCatalog = {
  perfume: { categoryId: string; name: { ar: string; en: string }; productId: string };
  accessories: {
    categoryId: string;
    watchesId: string;
    name: { ar: string; en: string };
    productId: string;
  };
};

/** A perfume department and an accessories department (with a "watches" subcategory), tagged for cleanup. */
export async function createProfileCatalog(tag: string): Promise<ProfileCatalog> {
  const db = service();
  const perfName = { ar: `عطور اختبار ${tag}`, en: `E2E Perfumes ${tag}` };
  const perfCat = must(
    await db
      .from("categories")
      .insert({
        name_ar: perfName.ar,
        name_en: perfName.en,
        profile: "perfume",
        sort_order: 998,
        is_active: true,
      })
      .select("id")
      .single(),
    "perfume category",
  );
  const perf = must(
    await db
      .from("products")
      .insert({
        category_id: perfCat.id,
        name_ar: `عطر اختبار ${tag}`,
        name_en: `E2E Perfume ${tag}`,
        sku: `E2E-${tag}-PERF`,
        price: 800,
        stock: 5,
        is_active: true,
        gender: "unisex",
        brand: `E2E ${tag}`,
        concentration: "EDP",
        volume_ml: 100,
        top_notes: "برغموت",
        base_notes: "مسك",
      })
      .select("id")
      .single(),
    "perfume product",
  );
  const accName = { ar: `إكسسوارات اختبار ${tag}`, en: `E2E Accessories ${tag}` };
  const accCat = must(
    await db
      .from("categories")
      .insert({
        name_ar: accName.ar,
        name_en: accName.en,
        profile: "accessories",
        sort_order: 997,
        is_active: true,
      })
      .select("id")
      .single(),
    "accessories category",
  );
  const watches = must(
    await db
      .from("categories")
      .insert({
        name_ar: `ساعات اختبار ${tag}`,
        name_en: `E2E Watches ${tag}`,
        parent_id: accCat.id,
        sort_order: 0,
        is_active: true,
      })
      .select("id")
      .single(),
    "watches category",
  );
  const watch = must(
    await db
      .from("products")
      .insert({
        category_id: watches.id,
        name_ar: `ساعة اختبار ${tag}`,
        name_en: `E2E Watch ${tag}`,
        sku: `E2E-${tag}-WATCH`,
        price: 1200,
        stock: 0,
        is_active: true,
        brand: `E2E ${tag}`,
        material_ar: "ستانلس",
        material_en: "Stainless",
      })
      .select("id")
      .single(),
    "watch product",
  );
  must(
    await db.from("product_variants").insert([
      {
        product_id: watch.id,
        name_ar: "ذهبي",
        name_en: "Gold",
        color_ar: "ذهبي",
        color_en: "Gold",
        color_hex: "#c8a24a",
        stock: 3,
        sku: `E2E-${tag}-WATCH-GLD`,
        is_active: true,
      },
    ]),
    "watch variant",
  );
  return {
    perfume: { categoryId: perfCat.id, name: perfName, productId: perf.id },
    accessories: {
      categoryId: accCat.id,
      watchesId: watches.id,
      name: accName,
      productId: watch.id,
    },
  };
}

export async function setVariantStock(variantId: string, stock: number) {
  must(
    await service().from("product_variants").update({ stock }).eq("id", variantId),
    "set variant stock",
  );
}

/* ----------------------------------------------------------------- orders -- */

export const ORDER_FLOW = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
] as const;
export type OrderStatus = (typeof ORDER_FLOW)[number] | "cancelled";
export type SeededOrder = { id: string; order_number: number };

/** Places a real order through the place_order RPC, signed in as the customer (COD). */
export async function placeOrderAs(
  items: { product_id: string; variant_id: string | null; quantity: number }[],
  opts: { coupon?: string; notes?: string } = {},
): Promise<SeededOrder> {
  const ids = await ensureAccounts();
  const addressId = await ensureAddress(ids.customer);
  const c = await signedIn("customer");
  const id = must(
    await c.rpc("place_order", {
      _items: items,
      _address_id: addressId,
      _delivery_slot: "asap",
      _payment_method: "cod",
      _coupon: opts.coupon ?? "",
      _notes: opts.notes ?? "",
    }),
    "place_order",
  ) as string;
  await c.auth.signOut();
  return getOrderNumber(id);
}

async function getOrderNumber(id: string): Promise<SeededOrder> {
  const o = must(
    await service().from("orders").select("id,order_number").eq("id", id).single(),
    "read order",
  );
  return { id: o.id, order_number: Number(o.order_number) };
}

/** Moves an order forward one allowed step at a time (the orders_guard trigger rejects skips). */
export async function advanceOrder(orderId: string, to: OrderStatus) {
  const db = service();
  const cur = must(
    await db.from("orders").select("status").eq("id", orderId).single(),
    "read status",
  ).status as OrderStatus;
  if (to === "cancelled") {
    must(await db.from("orders").update({ status: "cancelled" }).eq("id", orderId), "cancel order");
    return;
  }
  for (
    let i = ORDER_FLOW.indexOf(cur as (typeof ORDER_FLOW)[number]) + 1;
    i <= ORDER_FLOW.indexOf(to);
    i++
  ) {
    must(
      await db.from("orders").update({ status: ORDER_FLOW[i] }).eq("id", orderId),
      `status -> ${ORDER_FLOW[i]}`,
    );
  }
}

export async function assignDriver(orderId: string, driverId: string, accepted = false) {
  must(
    await service()
      .from("orders")
      .update({
        driver_id: driverId,
        driver_accepted_at: accepted ? new Date().toISOString() : null,
      })
      .eq("id", orderId),
    "assign driver",
  );
}

/** Customer order (1 x M) that is delivered now, so it is inside the return window. */
export async function createDeliveredOrder(cat: Catalog) {
  const o = await placeOrderAs([
    { product_id: cat.productId, variant_id: cat.variants.M, quantity: 1 },
  ]);
  await advanceOrder(o.id, "delivered");
  return o;
}

/** Confirmed order assigned to the test driver (not yet accepted). */
export async function createAssignedOrder(cat: Catalog) {
  const ids = await ensureAccounts();
  const o = await placeOrderAs([
    { product_id: cat.productId, variant_id: cat.variants.L, quantity: 1 },
  ]);
  await advanceOrder(o.id, "confirmed");
  await assignDriver(o.id, ids.driver);
  return o;
}

export async function createPendingOrder(cat: Catalog) {
  return placeOrderAs([{ product_id: cat.productId, variant_id: cat.variants.M, quantity: 1 }]);
}

export async function getOrder(id: string) {
  return must(
    await service()
      .from("orders")
      .select("*, order_status_history(status,created_at)")
      .eq("id", id)
      .single(),
    "get order",
  ) as {
    id: string;
    status: string;
    payment_method: string;
    coupon_code: string | null;
    discount: number;
    driver_accepted_at: string | null;
    driver_id: string | null;
    dispatch_status: string;
    order_status_history: { status: string; created_at: string }[];
  };
}

export async function latestOrderFor(userId: string, productId: string) {
  const items = must(
    await service()
      .from("order_items")
      .select("order_id, orders!inner(created_at,user_id)")
      .eq("product_id", productId)
      .eq("orders.user_id", userId),
    "order items",
  ) as unknown as { order_id: string; orders: { created_at: string } }[];
  return (
    items.sort((a, b) => b.orders.created_at.localeCompare(a.orders.created_at))[0]?.order_id ??
    null
  );
}

export async function driverLocations(orderId: string) {
  return must(
    await service()
      .from("driver_locations")
      .select("lat,lng,driver_id,created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    "driver locations",
  ) as { lat: number; lng: number; driver_id: string }[];
}

export async function insertDriverLocation(
  orderId: string,
  driverId: string,
  lat: number,
  lng: number,
) {
  must(
    await service()
      .from("driver_locations")
      .insert({ order_id: orderId, driver_id: driverId, lat, lng }),
    "insert location",
  );
}

export async function driverProfile(userId: string) {
  return must(
    await service()
      .from("driver_profiles")
      .select("status,is_active")
      .eq("user_id", userId)
      .single(),
    "driver profile",
  ) as { status: string; is_active: boolean };
}

export async function returnRequests(orderId: string) {
  return must(
    await service().from("return_requests").select("*").eq("order_id", orderId),
    "return requests",
  ) as { kind: string; status: string; order_item_id: string | null; reason: string }[];
}

export async function wishlistHas(userId: string, productId: string) {
  const rows = must(
    await service()
      .from("wishlist")
      .select("product_id")
      .eq("user_id", userId)
      .eq("product_id", productId),
    "wishlist",
  );
  return !!rows?.length;
}

export async function clearWishlist(userId: string, productId: string) {
  await service().from("wishlist").delete().eq("user_id", userId).eq("product_id", productId);
}

export async function findProductBySku(sku: string) {
  return must(
    await service()
      .from("products")
      .select("id,is_active,images,name_ar,price")
      .eq("sku", sku)
      .maybeSingle(),
    "product by sku",
  ) as { id: string; is_active: boolean; images: string[]; name_ar: string; price: number } | null;
}

/** Removes products a test created, so tests sharing the worker's catalogue category see only the seeded product. */
export async function deleteProductsBySku(...skus: string[]) {
  await service().from("products").delete().in("sku", skus);
}

export async function socialLinkSaved(url: string) {
  const { data } = await service().from("social_links").select("id").eq("url", url).maybeSingle();
  return !!data;
}

export async function findProductByName(nameAr: string) {
  return must(
    await service()
      .from("products")
      .select("id,is_active,images,sku,price")
      .eq("name_ar", nameAr)
      .maybeSingle(),
    "product by name",
  ) as {
    id: string;
    is_active: boolean;
    images: string[];
    sku: string | null;
    price: number;
  } | null;
}

export async function variantsOf(productId: string) {
  return must(
    await service()
      .from("product_variants")
      .select("id,size,color_en,stock")
      .eq("product_id", productId),
    "variants",
  ) as { id: string; size: string; color_en: string; stock: number }[];
}

export async function findCoupon(code: string) {
  return must(
    await service()
      .from("coupons")
      .select("id,code,value,discount_type")
      .eq("code", code)
      .maybeSingle(),
    "coupon",
  );
}

export async function findBanner(titleEn: string) {
  return must(
    await service()
      .from("banners")
      .select("id,link,image_url")
      .eq("title_en", titleEn)
      .maybeSingle(),
    "banner",
  ) as { id: string; link: string | null; image_url: string } | null;
}

export async function lastImportJob(fileName: string) {
  return must(
    await service()
      .from("import_jobs")
      .select("id,status,products_created")
      .eq("file_name", fileName)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "import job",
  ) as { id: string; status: string; products_created: number } | null;
}

/* ---------------------------------------------------------------- cleanup -- */

/** Removes every row created for a run tag. Orders go first (order_items only SET NULL on product delete). */
export async function cleanupTag(tag: string) {
  const db = service();
  const like = `%${tag}%`;
  const products = ((
    await db
      .from("products")
      .select("id")
      .or(`sku.ilike.${like},name_en.ilike.${like},name_ar.ilike.${like}`)
  ).data ?? []) as { id: string }[];
  const productIds = products.map((p) => p.id);
  if (productIds.length) {
    const items = ((await db.from("order_items").select("order_id").in("product_id", productIds))
      .data ?? []) as { order_id: string }[];
    const orderIds = [...new Set(items.map((i) => i.order_id))];
    if (orderIds.length) await db.from("orders").delete().in("id", orderIds);
    await db.from("products").delete().in("id", productIds);
  }
  await db.from("categories").delete().ilike("name_en", like);
  await db.from("coupons").delete().ilike("code", like);
  await db.from("banners").delete().ilike("title_en", like);
  await db.from("social_links").delete().ilike("url", like);
  await db.from("import_jobs").delete().ilike("file_name", like);
}

/* --------------------------------------------------------------- dispatch -- */

/**
 * Makes the test driver the only one dispatch can pick: other available drivers go offline (returned so they
 * can be restored) and the per-driver limit is raised so earlier specs' open orders don't count against it.
 */
export async function reserveDispatchForTestDriver() {
  const db = service();
  const ids = await ensureAccounts();
  const others = (must(
    await db
      .from("driver_profiles")
      .select("user_id,status")
      .neq("user_id", ids.driver)
      .neq("status", "offline"),
    "other drivers",
  ) ?? []) as { user_id: string; status: string }[];
  if (others.length)
    must(
      await db
        .from("driver_profiles")
        .update({ status: "offline" })
        .in(
          "user_id",
          others.map((o) => o.user_id),
        ),
      "pause other drivers",
    );
  must(
    await db
      .from("driver_profiles")
      .update({ status: "available", is_active: true })
      .eq("user_id", ids.driver),
    "test driver available",
  );
  const s = await readSettings();
  await updateSettings({ max_active_orders_per_driver: 20, driver_accept_timeout_seconds: 120 });
  return async () => {
    for (const o of others)
      await db.from("driver_profiles").update({ status: o.status }).eq("user_id", o.user_id);
    await updateSettings({
      max_active_orders_per_driver: s.max_active_orders_per_driver,
      driver_accept_timeout_seconds: s.driver_accept_timeout_seconds,
    });
  };
}

/** A confirmed order offered to the test driver through dispatch_order (as the service role). */
export async function createOfferedOrder(cat: Catalog) {
  const o = await placeOrderAs([
    { product_id: cat.productId, variant_id: cat.variants.L, quantity: 2 },
  ]);
  await advanceOrder(o.id, "confirmed");
  const r = must(await service().rpc("dispatch_order", { _order_id: o.id }), "dispatch_order");
  if (r !== "offered") throw new Error(`dispatch_order returned ${String(r)}`);
  return o;
}

export async function offersFor(orderId: string) {
  return (must(
    await service()
      .from("order_dispatch_offers")
      .select("id,driver_id,status")
      .eq("order_id", orderId),
    "offers",
  ) ?? []) as { id: string; driver_id: string; status: string }[];
}

/** Ends an open offer's time and runs the expiry job (what pg_cron does every minute). */
export async function expireOffersNow(orderId: string) {
  const db = service();
  must(
    await db
      .from("order_dispatch_offers")
      // A fixed past time: this machine's clock may differ from the server's.
      .update({ expires_at: "2000-01-01T00:00:00Z" } as never)
      .eq("order_id", orderId)
      .eq("status", "offered"),
    "expire offer",
  );
  must(await db.rpc("expire_stale_offers"), "expire_stale_offers");
}

/** A confirmed order that dispatch could not place (test driver offline for the call, then restored). */
export async function createWaitingOrder(cat: Catalog) {
  const db = service();
  const ids = await ensureAccounts();
  const o = await placeOrderAs([
    { product_id: cat.productId, variant_id: cat.variants.L, quantity: 1 },
  ]);
  await advanceOrder(o.id, "confirmed");
  must(
    await db.from("driver_profiles").update({ status: "offline" }).eq("user_id", ids.driver),
    "driver offline",
  );
  try {
    const r = must(await db.rpc("dispatch_order", { _order_id: o.id }), "dispatch_order");
    if (r !== "no_driver_available") throw new Error(`dispatch_order returned ${String(r)}`);
  } finally {
    must(
      await db.from("driver_profiles").update({ status: "available" }).eq("user_id", ids.driver),
      "driver available",
    );
  }
  return o;
}

/** The test driver answers "reject" (through the same RPC the app uses). */
export async function rejectAsDriver(offerId: string) {
  const c = await signedIn("driver");
  const r = must(
    await c.rpc("driver_respond_to_offer", { _offer_id: offerId, _accept: false }),
    "reject",
  );
  await c.auth.signOut();
  return r;
}

export async function setProductImages(productId: string, images: string[]) {
  must(
    await service().from("products").update({ images, thumbnails: [] }).eq("id", productId),
    "set product images",
  );
}
