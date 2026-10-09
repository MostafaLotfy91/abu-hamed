// Phone number + password accounts, without SMS codes.
// Supabase's own phone login needs an SMS provider and sends codes, so a phone account is a normal password
// account whose (never emailed) login address is derived from the phone: 201012345678@phone.local. The real
// phone is stored on the account and the profile; the address is never shown.
import { normalizeEgyptPhone } from "./whatsapp";

export const PHONE_LOGIN_DOMAIN = "phone.local";
export const MIN_PASSWORD = 6;

/** "01012345678" / "+20 10 1234 5678" -> "201012345678@phone.local"; null if not a valid Egyptian mobile. */
export function phoneLoginEmail(phone: string): string | null {
  const n = normalizeEgyptPhone(phone);
  return n ? `${n}@${PHONE_LOGIN_DOMAIN}` : null;
}

/** True for the internal login address of a phone account (hide it, show the phone instead). */
export const isPhoneLoginEmail = (email: string | null | undefined) =>
  !!email && email.toLowerCase().endsWith(`@${PHONE_LOGIN_DOMAIN}`);

/** "201012345678" -> "01012345678" (how customers write it). */
export const localPhone = (normalized: string) => `0${normalized.slice(2)}`;
