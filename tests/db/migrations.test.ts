import { describe, expect, it } from "vitest";
import { freshDb, migrationFiles } from "./harness";

describe("migrations build a fresh database", () => {
  it("applies every migration in order with no manual steps", async () => {
    const db = await freshDb();
    expect(migrationFiles().length).toBeGreaterThanOrEqual(13);
    const { rows } = await db.query<{ n: number }>(`select count(*)::int n from pg_tables where schemaname = 'public'`);
    expect(rows[0].n).toBeGreaterThan(20);
  });

  it("creates the store-media bucket as public, images only, with a size limit", async () => {
    const db = await freshDb();
    const { rows } = await db.query<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>(
      `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'store-media'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].public).toBe(true);
    expect(Number(rows[0].file_size_limit)).toBeGreaterThan(0);
    expect(rows[0].allowed_mime_types).not.toContain("image/svg+xml");
  });

  it("seeds the singleton store_settings row", async () => {
    const db = await freshDb();
    const { rows } = await db.query(`select id from public.store_settings`);
    expect(rows).toHaveLength(1);
  });

  it("enables RLS on every public table (lists any exceptions)", async () => {
    const db = await freshDb();
    const { rows } = await db.query<{ tablename: string }>(
      `select c.relname as tablename from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it("every public table with RLS has at least one policy", async () => {
    const db = await freshDb();
    const { rows } = await db.query<{ tablename: string }>(
      `select c.relname as tablename from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
       order by 1`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });
});
