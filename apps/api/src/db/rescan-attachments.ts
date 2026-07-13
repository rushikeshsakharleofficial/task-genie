import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { eq, ne } from "drizzle-orm";
import { env } from "../config/env.js";
import { scanBufferWithClamAv } from "../lib/clamav.js";
import { db, pool } from "./client.js";
import { attachments } from "./schema/index.js";

function absoluteStoragePath(storageKey: string): string {
  const root = path.resolve(env.UPLOAD_DIR);
  const resolved = path.resolve(root, storageKey);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe storage path: ${storageKey}`);
  return resolved;
}

if (!env.CLAMAV_ENABLED) {
  console.error("CLAMAV_ENABLED must be true to rescan legacy attachments");
  process.exitCode = 1;
} else {
  let clean = 0;
  let infected = 0;
  let errors = 0;
  try {
    const pending = await db.select().from(attachments).where(ne(attachments.scanStatus, "clean"));
    console.log(`Scanning ${pending.length} attachment(s)`);
    for (const attachment of pending) {
      try {
        const target = absoluteStoragePath(attachment.storageKey);
        const buffer = await readFile(target);
        const result = await scanBufferWithClamAv(buffer);
        if (result.status === "clean") {
          await db.update(attachments).set({
            quarantined: false,
            scanStatus: "clean",
            scanResult: result.raw.slice(0, 255),
            scannedAt: new Date(),
          }).where(eq(attachments.id, attachment.id));
          clean += 1;
          console.log(`CLEAN ${attachment.id} ${attachment.originalName}`);
          continue;
        }
        if (result.status === "infected") {
          await unlink(target).catch(() => undefined);
          await db.update(attachments).set({
            quarantined: true,
            scanStatus: "infected",
            scanResult: result.signature.slice(0, 255),
            scannedAt: new Date(),
          }).where(eq(attachments.id, attachment.id));
          infected += 1;
          console.warn(`INFECTED ${attachment.id} ${attachment.originalName}: ${result.signature}`);
          continue;
        }
        await db.update(attachments).set({
          quarantined: true,
          scanStatus: "scan_error",
          scanResult: result.message.slice(0, 255),
          scannedAt: new Date(),
        }).where(eq(attachments.id, attachment.id));
        errors += 1;
        console.error(`ERROR ${attachment.id} ${attachment.originalName}: ${result.message}`);
      } catch (error) {
        errors += 1;
        const message = error instanceof Error ? error.message : String(error);
        await db.update(attachments).set({
          quarantined: true,
          scanStatus: "scan_error",
          scanResult: message.slice(0, 255),
          scannedAt: new Date(),
        }).where(eq(attachments.id, attachment.id));
        console.error(`ERROR ${attachment.id} ${attachment.originalName}: ${message}`);
      }
    }
    console.log(JSON.stringify({ clean, infected, errors }));
    if (infected > 0 || errors > 0) process.exitCode = 2;
  } finally {
    await pool.end();
  }
}
