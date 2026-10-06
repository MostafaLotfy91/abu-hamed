import { useQuery } from "@tanstack/react-query";
import { Facebook, Instagram, Youtube, Send, Ghost, Music2, Twitter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isSafeHttpsUrl } from "@/lib/whatsapp";

export const PLATFORMS = ["facebook", "instagram", "tiktok", "youtube", "x", "snapchat", "telegram"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_ICON: Record<Platform, typeof Facebook> = {
  facebook: Facebook, instagram: Instagram, tiktok: Music2, youtube: Youtube, x: Twitter, snapchat: Ghost, telegram: Send,
};

export const socialLinksQuery = {
  queryKey: ["social_links"],
  queryFn: async () => {
    const { data, error } = await supabase.from("social_links").select("*").order("sort_order");
    if (error) throw error;
    return data ?? [];
  },
  staleTime: 5 * 60_000,
};

export function SocialIcons({ className = "" }: { className?: string }) {
  const { data } = useQuery(socialLinksQuery);
  const links = (data ?? []).filter((l) => l.is_active && l.url && isSafeHttpsUrl(l.url));
  if (!links.length) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {links.map((l) => {
        const Icon = PLATFORM_ICON[l.platform as Platform] ?? Send;
        return (
          <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" aria-label={l.platform}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-foreground transition-colors hover:bg-primary hover:text-primary-foreground">
            <Icon className="h-5 w-5" />
          </a>
        );
      })}
    </div>
  );
}
