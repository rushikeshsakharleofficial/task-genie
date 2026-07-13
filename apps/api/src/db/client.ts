import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema/index.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "taskgenie-api",
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error", error);
});

export const db = drizzle({ client: pool, schema });
