import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pool, db } from "./client.js";

try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
  console.log("Database migrations applied successfully");
} finally {
  await pool.end();
}
