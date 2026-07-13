import type { FastifyInstance } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";

export async function registerAuthHandler(app: FastifyInstance): Promise<void> {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    config: {
      rateLimit: {
        max: 30,
        timeWindow: "1 minute",
      },
    },
    async handler(request, reply) {
      const host = request.headers.host ?? "localhost";
      const protocol = request.headers["x-forwarded-proto"] ?? "http";
      const url = new URL(request.raw.url ?? request.url, `${protocol}://${host}`);
      const headers = fromNodeHeaders(request.headers);

      const authRequest = new Request(url, {
        method: request.method,
        headers,
        ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
      });

      const response = await auth.handler(authRequest);
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));

      if (!response.body) {
        return reply.send();
      }

      return reply.send(await response.text());
    },
  });
}
