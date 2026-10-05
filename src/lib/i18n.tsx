import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "ar" | "en";

const dict = {
  home: { ar: "الرئيسية", en: "Home" },
  categories: { ar: "الأقسام", en: "Categories" },
  cart: { ar: "السلة", en: "Cart" },
  orders: { ar: "طلباتي", en: "Orders" },
  account: { ar: "حسابي", en: "Account" },
  search_placeholder: { ar: "ابحث عن منتج...", en: "Search products..." },
  recent_searches: { ar: "عمليات البحث الأخيرة", en: "Recent searches" },
  clear: { ar: "مسح", en: "Clear" },
  flash_deals: { ar: "عروض سريعة", en: "Flash deals" },
  ends_in: { ar: "ينتهي خلال", en: "Ends in" },
  best_sellers: { ar: "الأكثر مبيعاً", en: "Best sellers" },
  new_arrivals: { ar: "وصل حديثاً", en: "New arrivals" },
  order_again: { ar: "اطلب تاني", en: "Order again" },
  see_all: { ar: "عرض الكل", en: "See all" },
  add: { ar: "أضف", en: "Add" },
  add_to_cart: { ar: "أضف للسلة", en: "Add to cart" },
  out_of_stock: { ar: "غير متوفر", en: "Out of stock" },
  in_stock: { ar: "متوفر", en: "In stock" },
  low_stock: { ar: "كمية محدودة", en: "Low stock" },
  filters: { ar: "تصفية", en: "Filters" },
  sort: { ar: "ترتيب", en: "Sort" },
  sort_newest: { ar: "الأحدث", en: "Newest" },
  sort_price_asc: { ar: "السعر: من الأقل", en: "Price: low to high" },
  sort_price_desc: { ar: "السعر: من الأعلى", en: "Price: high to low" },
  sort_popular: { ar: "الأكثر مبيعاً", en: "Most popular" },
  price: { ar: "السعر", en: "Price" },
  min: { ar: "من", en: "Min" },
  max: { ar: "إلى", en: "Max" },
  brand: { ar: "الماركة", en: "Brand" },
  discounted_only: { ar: "العروض فقط", en: "Discounted only" },
  in_stock_only: { ar: "المتوفر فقط", en: "In stock only" },
  apply: { ar: "تطبيق", en: "Apply" },
  reset: { ar: "إعادة ضبط", en: "Reset" },
  all_products: { ar: "كل المنتجات", en: "All products" },
  no_products: { ar: "لا توجد منتجات", en: "No products found" },
  no_products_hint: { ar: "جرّب تغيير التصفية أو البحث بكلمة أخرى", en: "Try different filters or another search" },
  error_title: { ar: "حدث خطأ", en: "Something went wrong" },
  retry: { ar: "حاول مرة أخرى", en: "Try again" },
  related: { ar: "منتجات مشابهة", en: "Related products" },
  reviews: { ar: "التقييمات", en: "Reviews" },
  write_review: { ar: "اكتب تقييمك", en: "Write a review" },
  submit: { ar: "إرسال", en: "Submit" },
  no_reviews: { ar: "لا توجد تقييمات بعد", en: "No reviews yet" },
  sign_in_to_review: { ar: "سجّل الدخول لكتابة تقييم", en: "Sign in to write a review" },
  quantity: { ar: "الكمية", en: "Quantity" },
  options: { ar: "الاختيارات", en: "Options" },
  description: { ar: "الوصف", en: "Description" },
  cart_empty: { ar: "سلتك فاضية", en: "Your cart is empty" },
  cart_empty_hint: { ar: "ابدأ التسوق وأضف منتجاتك المفضلة", en: "Start shopping and add your favorites" },
  start_shopping: { ar: "ابدأ التسوق", en: "Start shopping" },
  item_note: { ar: "ملاحظة على المنتج", en: "Note for this item" },
  coupon: { ar: "كود الخصم", en: "Coupon code" },
  apply_coupon: { ar: "تطبيق", en: "Apply" },
  remove: { ar: "إزالة", en: "Remove" },
  subtotal: { ar: "المجموع الفرعي", en: "Subtotal" },
  delivery_fee: { ar: "رسوم التوصيل", en: "Delivery fee" },
  free: { ar: "مجاناً", en: "Free" },
  discount: { ar: "الخصم", en: "Discount" },
  total: { ar: "الإجمالي", en: "Total" },
  checkout: { ar: "إتمام الطلب", en: "Checkout" },
  view_cart: { ar: "عرض السلة", en: "View cart" },
  min_order_note: { ar: "الحد الأدنى للطلب", en: "Minimum order" },
  free_delivery_over: { ar: "توصيل مجاني للطلبات فوق", en: "Free delivery over" },
  delivery_address: { ar: "عنوان التوصيل", en: "Delivery address" },
  add_address: { ar: "إضافة عنوان", en: "Add address" },
  delivery_time: { ar: "وقت التوصيل", en: "Delivery time" },
  asap: { ar: "في أسرع وقت", en: "As soon as possible" },
  scheduled: { ar: "موعد محدد", en: "Scheduled" },
  payment_method: { ar: "طريقة الدفع", en: "Payment method" },
  cod: { ar: "الدفع عند الاستلام", en: "Cash on delivery" },
  online: { ar: "الدفع أونلاين", en: "Pay online" },
  coming_soon: { ar: "قريباً", en: "Coming soon" },
  order_notes: { ar: "ملاحظات الطلب", en: "Order notes" },
  place_order: { ar: "تأكيد الطلب", en: "Place order" },
  order_summary: { ar: "ملخص الطلب", en: "Order summary" },
  order_placed: { ar: "تم استلام طلبك!", en: "Order placed!" },
  no_orders: { ar: "لا توجد طلبات بعد", en: "No orders yet" },
  reorder: { ar: "إعادة الطلب", en: "Reorder" },
  order: { ar: "طلب", en: "Order" },
  items: { ar: "منتجات", en: "items" },
  cancel_order: { ar: "إلغاء الطلب", en: "Cancel order" },
  status_pending: { ar: "قيد الانتظار", en: "Pending" },
  status_confirmed: { ar: "تم التأكيد", en: "Confirmed" },
  status_preparing: { ar: "جاري التجهيز", en: "Preparing" },
  status_out_for_delivery: { ar: "في الطريق", en: "Out for delivery" },
  status_delivered: { ar: "تم التوصيل", en: "Delivered" },
  status_cancelled: { ar: "ملغي", en: "Cancelled" },
  sign_in: { ar: "تسجيل الدخول", en: "Sign in" },
  sign_up: { ar: "إنشاء حساب", en: "Create account" },
  sign_out: { ar: "تسجيل الخروج", en: "Sign out" },
  email: { ar: "البريد الإلكتروني", en: "Email" },
  password: { ar: "كلمة المرور", en: "Password" },
  phone: { ar: "رقم الموبايل", en: "Phone" },
  full_name: { ar: "الاسم بالكامل", en: "Full name" },
  send_code: { ar: "أرسل الكود", en: "Send code" },
  verify: { ar: "تأكيد", en: "Verify" },
  otp_code: { ar: "كود التحقق", en: "Verification code" },
  continue_google: { ar: "المتابعة باستخدام Google", en: "Continue with Google" },
  or: { ar: "أو", en: "or" },
  check_email: { ar: "راجع بريدك لتأكيد الحساب", en: "Check your email to confirm your account" },
  profile: { ar: "الملف الشخصي", en: "Profile" },
  addresses: { ar: "العناوين", en: "Addresses" },
  wishlist: { ar: "المفضلة", en: "Wishlist" },
  save: { ar: "حفظ", en: "Save" },
  saved: { ar: "تم الحفظ", en: "Saved" },
  delete: { ar: "حذف", en: "Delete" },
  edit: { ar: "تعديل", en: "Edit" },
  cancel: { ar: "إلغاء", en: "Cancel" },
  city: { ar: "المدينة", en: "City" },
  area: { ar: "المنطقة", en: "Area" },
  street: { ar: "الشارع", en: "Street" },
  building: { ar: "العمارة", en: "Building" },
  floor: { ar: "الدور", en: "Floor" },
  apartment: { ar: "الشقة", en: "Apartment" },
  label: { ar: "اسم العنوان", en: "Label" },
  notes: { ar: "ملاحظات", en: "Notes" },
  default: { ar: "افتراضي", en: "Default" },
  no_addresses: { ar: "لا توجد عناوين محفوظة", en: "No saved addresses" },
  wishlist_empty: { ar: "قائمة المفضلة فاضية", en: "Your wishlist is empty" },
  admin: { ar: "لوحة التحكم", en: "Admin" },
  language: { ar: "English", en: "العربية" },
  added_to_cart: { ar: "تمت الإضافة للسلة", en: "Added to cart" },
  contact_us: { ar: "تواصل معنا", en: "Contact us" },
  subcategories: { ar: "الأقسام الفرعية", en: "Subcategories" },
  results_for: { ar: "نتائج البحث عن", en: "Results for" },
  load_more: { ar: "تحميل المزيد", en: "Load more" },
  timeline: { ar: "حالة الطلب", en: "Order status" },
  live: { ar: "مباشر", en: "Live" },
  required_sign_in: { ar: "سجل دخولك للمتابعة", en: "Sign in to continue" },
} as const;

export type DictKey = keyof typeof dict;

type Ctx = {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (k: DictKey) => string;
  /** pick name_ar / name_en style fields */
  tx: <T extends Record<string, unknown>>(obj: T | null | undefined, field: string) => string;
};

const I18nContext = createContext<Ctx | null>(null);
const LS_KEY = "app.lang";

export function I18nProvider({ children, defaultLang = "ar" }: { children: ReactNode; defaultLang?: Lang }) {
  const [lang, setLangState] = useState<Lang>(defaultLang);
  const [userChose, setUserChose] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY) as Lang | null;
    if (saved === "ar" || saved === "en") {
      setLangState(saved);
      setUserChose(true);
    }
  }, []);

  useEffect(() => {
    if (!userChose) setLangState(defaultLang);
  }, [defaultLang, userChose]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(LS_KEY, l);
    setUserChose(true);
    setLangState(l);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      setLang,
      toggle: () => setLang(lang === "ar" ? "en" : "ar"),
      t: (k) => dict[k][lang],
      tx: (obj, field) => {
        if (!obj) return "";
        const v = obj[`${field}_${lang}`] ?? obj[`${field}_${lang === "ar" ? "en" : "ar"}`];
        return typeof v === "string" ? v : "";
      },
    }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const c = useContext(I18nContext);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}
