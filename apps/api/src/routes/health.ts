import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { valkey } from "../plugins/valkey.js";
import { pingClamAv } from "../lib/clamav.js";
import { env } from "../config/env.js";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health/live", async () => ({ status: "ok" }));

  app.get("/health/ready", async (_request, reply) => {
    const checks = {
      postgres: false,
      valkey: false,
      clamav: !env.CLAMAV_ENABLED,
    };

    try {
      await db.execute(sql`select 1`);
      checks.postgres = true;
    } catch (error) {
      app.log.error({ error }, "PostgreSQL readiness check failed");
    }

    try {
      checks.valkey = (await valkey.ping()) === "PONG";
    } catch (error) {
      app.log.error({ error }, "Valkey readiness check failed");
    }

    try {
      checks.clamav = await pingClamAv();
    } catch (error) {
      app.log.error({ error }, "ClamAV readiness check failed");
    }

    const ready = Object.values(checks).every(Boolean);
    return reply.status(ready ? 200 : 503).send({ status: ready ? "ready" : "not_ready", checks });
  });
}
