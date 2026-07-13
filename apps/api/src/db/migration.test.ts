import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("database migrations", () => {
  it("applies all committed migrations to a clean PostgreSQL database", async () => {
    const database = new PGlite();
    try {
      for (const file of ["0000_true_jean_grey.sql", "0001_peaceful_photon.sql", "0002_huge_paibok.sql"]) {
        const sql = await readFile(resolve(process.cwd(), "drizzle", file), "utf8");
        const statements = sql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean);
        for (const statement of statements) await database.exec(statement);
      }
      const result = await database.query<{ count: number }>("select count(*)::int as count from information_schema.tables where table_schema = 'public'");
      expect(result.rows[0]?.count).toBeGreaterThanOrEqual(26);
      const content = await database.query<{ name: string }>("select table_name as name from information_schema.tables where table_name = 'content_items'");
      expect(content.rows[0]?.name).toBe("content_items");
    } finally {
      await database.close();
    }
  }, 30_000);
});
