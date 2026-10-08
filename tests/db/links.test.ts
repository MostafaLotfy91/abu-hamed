// Banner and social links must never accept script URLs, even from an admin.
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createUser, freshDb, tryAs, user } from "./harness";

let db: PGlite;
let admin: string;

beforeAll(async () => {
  db = await freshDb();
  admin = await createUser(db, "admin@test.local", ["admin"]);
});

const banner = (link: string) =>
  tryAs(db, user(admin), (tx) =>
    tx.query(`insert into public.banners(image_url, link) values ('/b.jpg', $1)`, [link]),
  );
const social = (url: string) =>
  tryAs(db, user(admin), (tx) =>
    tx.query(`insert into public.social_links(platform, url) values ('facebook', $1)`, [url]),
  );

describe("banner links", () => {
  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>",
    "//evil.example",
    "/\\evil.example",
    "http://example.com",
    '/x"onmouseover=alert(1)',
  ])("rejects %s", async (link) => expect(await banner(link)).toMatch(/banners_link_safe_chk/));
  it.each(["/products", "/", "/category/abc?x=1", "https://example.com/sale"])(
    "accepts %s",
    async (link) => {
      expect(await banner(link)).toBeNull();
    },
  );
});

describe("social links", () => {
  it.each([
    "javascript:alert(1)",
    "http://facebook.com/x",
    "data:text/html,x",
    "https://x.com/a b",
  ])("rejects %s", async (url) => {
    expect(await social(url)).toMatch(/social_links_url_chk/);
  });
  it("accepts https", async () => expect(await social("https://facebook.com/store")).toBeNull());
});
