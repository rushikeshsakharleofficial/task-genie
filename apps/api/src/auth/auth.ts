import { hash, verify } from "@node-rs/argon2";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type SecondaryStorage } from "better-auth";
import { db } from "../db/client.js";
import { accounts, sessions, users, verifications } from "../db/schema/index.js";
import { env } from "../config/env.js";
import { valkey } from "../plugins/valkey.js";

const secondaryStorage: SecondaryStorage = {
  async get(key) {
    return valkey.get(`auth:${key}`);
  },
  async set(key, value, ttl) {
    if (ttl) {
      await valkey.set(`auth:${key}`, value, "EX", ttl);
      return;
    }
    await valkey.set(`auth:${key}`, value);
  },
  async delete(key) {
    await valkey.del(`auth:${key}`);
  },
};

export const auth = betterAuth({
  appName: "Task Genie",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.CORS_ORIGINS,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  secondaryStorage,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    password: {
      hash: async (password) =>
        hash(password, {
          algorithm: 2,
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1,
          outputLen: 32,
        }),
      verify: async ({ hash: passwordHash, password }) => verify(passwordHash, password),
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60,
      strategy: "compact",
    },
  },
  advanced: {
    useSecureCookies: env.COOKIE_SECURE,
    cookiePrefix: "taskgenie",
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
});
