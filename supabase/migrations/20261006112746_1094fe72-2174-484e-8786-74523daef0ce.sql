ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_message_general_ar text DEFAULT 'مرحباً {store_name}، عندي استفسار',
  ADD COLUMN IF NOT EXISTS whatsapp_message_general_en text DEFAULT 'Hello {store_name}, I have a question',
  ADD COLUMN IF NOT EXISTS whatsapp_message_product_ar text DEFAULT 'مرحباً، أستفسر عن {product_name} (المقاس: {size}، اللون: {color}) {product_url}',
  ADD COLUMN IF NOT EXISTS whatsapp_message_product_en text DEFAULT 'Hi, I''m asking about {product_name} (size: {size}, color: {color}) {product_url}',
  ADD COLUMN IF NOT EXISTS whatsapp_message_order_ar text DEFAULT 'مرحباً، أستفسر عن طلبي رقم #{order_number}',
  ADD COLUMN IF NOT EXISTS whatsapp_message_order_en text DEFAULT 'Hi, I''m asking about my order #{order_number}',
  ADD COLUMN IF NOT EXISTS whatsapp_reply_hours_text_ar text DEFAULT 'نرد يومياً من 10 ص حتى 10 م',
  ADD COLUMN IF NOT EXISTS whatsapp_reply_hours_text_en text DEFAULT 'We reply daily 10am–10pm';

UPDATE public.store_settings SET features = features || '{"whatsapp_button": true}'::jsonb WHERE NOT (features ? 'whatsapp_button');

CREATE TABLE public.social_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_links_platform_chk CHECK (platform IN ('facebook','instagram','tiktok','youtube','x','snapchat','telegram')),
  CONSTRAINT social_links_url_chk CHECK (url ~* '^https://[^\s<>"]+$')
);
GRANT SELECT ON public.social_links TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.social_links TO authenticated;
GRANT ALL ON public.social_links TO service_role;
ALTER TABLE public.social_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads active social links" ON public.social_links FOR SELECT USING (is_active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert social links" ON public.social_links FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update social links" ON public.social_links FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete social links" ON public.social_links FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER social_links_touch BEFORE UPDATE ON public.social_links FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.social_links (platform, url, sort_order)
SELECT k, v, row_number() OVER ()
FROM public.store_settings s, jsonb_each_text(s.social_links) AS e(k, v)
WHERE s.id = 1 AND k IN ('facebook','instagram','tiktok','youtube','x','snapchat','telegram') AND v ~* '^https://[^\s<>"]+$';