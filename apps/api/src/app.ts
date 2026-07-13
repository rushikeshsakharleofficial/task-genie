import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { registerAuthHandler } from "./auth/handler.js";
import { env } from "./config/env.js";
import { registerAnalyticsRoutes } from "./modules/analytics/routes.js";
import { registerAttachmentRoutes } from "./modules/attachments/routes.js";
import { registerCollaborationRoutes } from "./modules/collaboration/routes.js";
import { registerContentRoutes } from "./modules/content/routes.js";
import { registerRealtimeRoutes } from "./modules/realtime/routes.js";
import { registerMemberRoutes } from "./modules/members/routes.js";
import { registerProjectRoutes } from "./modules/projects/routes.js";
import { registerTaskRoutes } from "./modules/tasks/routes.js";
import { registerWorkspaceRoutes } from "./modules/workspaces/routes.js";
import { registerAuthContext } from "./plugins/auth-context.js";
import { registerRealtimeService } from "./plugins/realtime.js";
import { registerHealthRoutes } from "./routes/health.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: true,
    logger: env.NODE_ENV === "test" ? false : {
      level: env.LOG_LEVEL,
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie", "password", "token"],
        censor: "[REDACTED]",
      },
    },
    requestIdHeader: "x-request-id",
    bodyLimit: Math.max(env.MAX_UPLOAD_BYTES, 1_048_576),
  });

  await app.register(websocket, { options: { maxPayload: env.REALTIME_MAX_PAYLOAD_BYTES, perMessageDeflate: false } });
  await app.register(sensible);
  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } });
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "x-request-id", "x-csrf-token"],
    maxAge: 86_400,
  });
  await app.register(rateLimit, { global: true, max: env.RATE_LIMIT_MAX, timeWindow: env.RATE_LIMIT_WINDOW });
  await app.register(multipart, { limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1, fields: 10 } });

  app.addHook("onRequest", async (request) => {
    if (!request.url.startsWith("/api/v1") || ["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin && !env.CORS_ORIGINS.includes(origin)) {
      throw app.httpErrors.forbidden("Cross-origin mutation denied");
    }
  });

  await registerRealtimeService(app);
  await registerAuthContext(app);
  await registerHealthRoutes(app);
  await registerAuthHandler(app);
  await registerWorkspaceRoutes(app);
  await registerMemberRoutes(app);
  await registerProjectRoutes(app);
  await registerTaskRoutes(app);
  await registerCollaborationRoutes(app);
  await registerAttachmentRoutes(app);
  await registerAnalyticsRoutes(app);
  await registerContentRoutes(app);
  await registerRealtimeRoutes(app);

  app.get("/api/v1/me", async (request) => {
    if (!request.authSession) throw app.httpErrors.unauthorized("Authentication required");
    return request.authSession;
  });

  app.get("/api/v1/meta", async () => ({
    name: "Task Genie",
    version: "0.4.0",
    features: ["auth", "workspaces", "members", "projects", "tasks", "comments", "checklists", "attachments", "clamav", "notifications", "analytics", "content", "websockets", "presence"],
  }));

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "Request validation failed", details: error.issues, requestId: request.id });
    }
    const normalizedError = error instanceof Error ? error : new Error("Unknown error");
    const errorRecord = typeof error === "object" && error !== null ? (error as { statusCode?: number; code?: string }) : {};
    const statusCode = typeof errorRecord.statusCode === "number" && errorRecord.statusCode >= 400 ? errorRecord.statusCode : 500;
    if (statusCode >= 500) request.log.error({ err: normalizedError }, "Unhandled request error");
    return reply.status(statusCode).send({ error: statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : errorRecord.code ?? "REQUEST_ERROR", message: statusCode >= 500 ? "Internal server error" : normalizedError.message, requestId: request.id });
  });

  return app;
}
