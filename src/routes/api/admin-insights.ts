import { createFileRoute } from "@tanstack/react-router";
import { handleInsights } from "@/lib/insights.server";

export const Route = createFileRoute("/api/admin-insights")({
  server: { handlers: { POST: ({ request }) => handleInsights(request) } },
});
