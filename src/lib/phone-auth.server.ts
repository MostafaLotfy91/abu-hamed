// POST /api/phone-signup {phone, password, full_name}: creates a phone + password account (no SMS) with the
// service role, already confirmed, plus its profile. The browser then signs in with phone + password.
import { z } from "zod";
import { normalizeEgyptPhone } from "./whatsapp";
import { MIN_PASSWORD, localPhone, phoneLoginEmail } from "./phone-auth";
import { checkRateLimit, rateLimitResponse, visitorKey } from "./rate-limit.server";

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const bodySchema = z.object({
  phone: z.string().min(1).max(40),
  password: z.string().min(MIN_PASSWORD).max(72),
  full_name: z.string().trim().min(1).max(100),
});

export async function handlePhoneSignup(request: Request): Promise<Response> {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return json(400, { error: "bad_request" });
  }
  const phone = normalizeEgyptPhone(body.phone);
  const email = phoneLoginEmail(body.phone);
  if (!phone || !email) return json(400, { error: "invalid_phone" });

  // Account creation is not free to abuse: limited per visitor like the AI endpoints.
  const limited = rateLimitResponse(await checkRateLimit(`signup:${visitorKey(request)}`));
  if (limited) return limited;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
    phone,
    phone_confirm: true,
    user_metadata: { full_name: body.full_name, phone: localPhone(phone) },
  });
  if (created.error) {
    const code = (created.error as { code?: string }).code;
    if (code === "phone_exists" || code === "email_exists" || created.error.status === 422)
      return json(409, { error: "phone_taken" });
    return json(500, { error: "signup_failed" });
  }
  // The profile shows the phone, never the internal login address.
  await supabaseAdmin.from("profiles").upsert(
    {
      id: created.data.user.id,
      full_name: body.full_name,
      phone: localPhone(phone),
      email: null,
    },
    { onConflict: "id" },
  );
  return json(201, { ok: true });
}
