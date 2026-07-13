import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pool, db } from "./client.js";

try {
  await migrate(db, { migrationsFolder: new URL("../../drizzle", import.meta.url).pathname });
  console.log("Database migrations applied successfully");
} finally {
  await pool.end();
}
