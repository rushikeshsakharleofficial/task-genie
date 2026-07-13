import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/client.js";
import { closeValkey, connectValkey } from "./plugins/valkey.js";

const app = await buildApp();

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Shutting down Task Genie API");
  await app.close();
  await closeValkey();
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await connectValkey();
  await app.realtime.start();
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.fatal({ error }, "Task Genie API failed to start");
  await closeValkey().catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(1);
}
