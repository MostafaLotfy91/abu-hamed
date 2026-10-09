import { createFileRoute } from "@tanstack/react-router";
import { handlePhoneSignup } from "@/lib/phone-auth.server";

export const Route = createFileRoute("/api/phone-signup")({
  server: { handlers: { POST: ({ request }) => handlePhoneSignup(request) } },
});
