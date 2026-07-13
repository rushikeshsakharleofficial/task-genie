import { Redis as Valkey } from "iovalkey";
import { env } from "../config/env.js";

export const valkey = new Valkey(env.VALKEY_URL, {
  lazyConnect: true,
  enableReadyCheck: true,
  maxRetriesPerRequest: 1,
  keyPrefix: env.VALKEY_KEY_PREFIX,
});

export async function connectValkey(): Promise<void> {
  if (valkey.status === "wait") {
    await valkey.connect();
  }
}

export async function closeValkey(): Promise<void> {
  if (valkey.status !== "end") {
    await valkey.quit();
  }
}
