import { and, eq, isNotNull, lte } from "drizzle-orm";
import { env } from "./config/env.js";
import { db, pool } from "./db/client.js";
import { contentItems } from "./db/schema/index.js";
import { closeValkey, connectValkey, valkey } from "./plugins/valkey.js";

let stopping = false;
async function processScheduledContent(): Promise<void> {
  const lockKey = "worker:content-scheduler";
  const locked = await valkey.set(lockKey, String(process.pid), "EX", 50, "NX");
  if (!locked) return;
  try {
    const due = await db.select().from(contentItems).where(and(eq(contentItems.status, "scheduled"), isNotNull(contentItems.scheduledAt), lte(contentItems.scheduledAt, new Date()))).limit(100);
    for (const item of due) {
      await db.update(contentItems).set({ status: "sent", sentAt: new Date(), updatedAt: new Date(), lastError: null }).where(and(eq(contentItems.id, item.id), eq(contentItems.status, "scheduled")));
      console.log(JSON.stringify({ event: "content.sent", contentId: item.id, mode: "simulated" }));
    }
  } finally {
    await valkey.del(lockKey);
  }
}
async function shutdown(): Promise<void> {
  stopping = true;
  await closeValkey();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
await connectValkey();
console.log(`Task Genie worker started (${env.NODE_ENV})`);
while (!stopping) {
  await processScheduledContent().catch((error) => console.error("Worker iteration failed", error));
  await new Promise((resolve) => setTimeout(resolve, 30_000));
}
