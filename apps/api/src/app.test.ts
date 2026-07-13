import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://taskgenie:test@127.0.0.1:5432/taskgenie";
  process.env.VALKEY_URL = "redis://:test@127.0.0.1:6379/0";
  process.env.BETTER_AUTH_SECRET = "test-secret-that-is-longer-than-thirty-two-bytes";
  process.env.BETTER_AUTH_URL = "http://localhost:4000";
  process.env.CORS_ORIGINS = "http://localhost:3000";
  process.env.CLAMAV_ENABLED = "false";
  process.env.REALTIME_ENABLED = "false";
  const module = await import("./app.js");
  app = await module.buildApp();
});
afterAll(async () => { await app.close(); });

describe("application routes", () => {
  it("exposes liveness without external dependencies", async () => {
    const response = await app.inject({ method: "GET", url: "/health/live" });
    expect(response.statusCode).toBe(200);
  });
  it("rejects protected API requests without a session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/workspaces" });
    expect(response.statusCode).toBe(401);
  });
  it("rejects state-changing requests from an untrusted browser origin", async () => {
    const response = await app.inject({ method: "POST", url: "/api/v1/workspaces", headers: { origin: "https://evil.example", "content-type": "application/json" }, payload: { name: "Bad workspace" } });
    expect(response.statusCode).toBe(403);
  });
  it("returns public application metadata", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/meta" });
    expect(response.statusCode).toBe(200);
    expect(response.json().version).toBe("0.4.0");
  });
});
