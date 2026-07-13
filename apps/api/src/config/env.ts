import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(2).max(50).default(10),

  VALKEY_URL: z.string().min(1),
  VALKEY_KEY_PREFIX: z.string().default("taskgenie:"),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  COOKIE_SECURE: booleanFromString.default(false),
  REQUIRE_EMAIL_VERIFICATION: booleanFromString.default(false),

  RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(10000).default(200),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  UPLOAD_DIR: z.string().default("./uploads"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).max(104857600).default(10485760),

  CLAMAV_ENABLED: booleanFromString.default(true),
  CLAMAV_HOST: z.string().default("clamav"),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  CLAMAV_CHUNK_BYTES: z.coerce.number().int().min(1024).max(1048576).default(65536),
  CLAMAV_FAIL_OPEN: booleanFromString.default(false),

  REALTIME_ENABLED: booleanFromString.default(true),
  REALTIME_MAX_PAYLOAD_BYTES: z.coerce.number().int().min(1024).max(1048576).default(65536),
  REALTIME_HEARTBEAT_MS: z.coerce.number().int().min(5000).max(120000).default(30000),
  REALTIME_MESSAGES_PER_MINUTE: z.coerce.number().int().min(10).max(10000).default(120),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration", z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  CORS_ORIGINS: parsed.data.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
