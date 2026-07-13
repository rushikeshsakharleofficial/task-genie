import type { FastifyInstance, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth/auth.js";

export type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

declare module "fastify" {
  interface FastifyRequest {
    authSession: AuthSession | null;
  }
}

export async function registerAuthContext(app: FastifyInstance): Promise<void> {
  app.decorateRequest("authSession", null);

  app.addHook("onRequest", async (request) => {
    if (!request.url.startsWith("/api/v1")) {
      return;
    }

    request.authSession = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
  });
}

export function requireSession(request: FastifyRequest): AuthSession {
  if (!request.authSession) {
    throw request.server.httpErrors.unauthorized("Authentication required");
  }
  return request.authSession;
}
