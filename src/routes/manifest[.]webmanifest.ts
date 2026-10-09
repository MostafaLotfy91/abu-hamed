import { createFileRoute } from "@tanstack/react-router";
import { settingsQuery } from "@/lib/store-settings";
import { appManifest } from "@/lib/app-manifest";

/** GET /manifest.webmanifest: the storefront's install manifest, named and coloured from store_settings. */
export const Route = createFileRoute("/manifest.webmanifest")({
  server: {
    handlers: {
      GET: async () => {
        const settings = await settingsQuery.queryFn().catch(() => null);
        return new Response(JSON.stringify(appManifest(settings)), {
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
