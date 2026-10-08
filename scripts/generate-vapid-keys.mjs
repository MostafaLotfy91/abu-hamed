#!/usr/bin/env node
// Generates a VAPID key pair for Web Push (P-256), in the base64url format web-push and browsers expect.
//   node scripts/generate-vapid-keys.mjs
// Put the PUBLIC key in the app env as VITE_VAPID_PUBLIC_KEY (Vercel/hosting env + .env), and BOTH keys in the
// Edge Function secrets as VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY. Generate once per store; changing keys
// invalidates every existing subscription (drivers must turn notifications on again).
// The private key is printed only to your terminal; never commit it.
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" });
const pub = publicKey.export({ format: "jwk" });
const b64u = (s) => Buffer.from(s, "base64url");
// Uncompressed point: 0x04 || X || Y
const raw = Buffer.concat([Buffer.from([4]), b64u(pub.x), b64u(pub.y)]).toString("base64url");

console.log(`VAPID_PUBLIC_KEY=${raw}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log(`VITE_VAPID_PUBLIC_KEY=${raw}`);
