import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireTaskPermission } from "../../lib/task-access.js";
import { requireWorkspacePermission } from "../../lib/authorization.js";
import { requireSession } from "../../plugins/auth-context.js";
import { env } from "../../config/env.js";

const paramsSchema = z.object({ workspaceId: z.string().uuid() });
const messageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("subscribe_task"), taskId: z.string().uuid() }),
  z.object({ type: z.literal("unsubscribe_task"), taskId: z.string().uuid() }),
  z.object({ type: z.literal("presence"), taskId: z.string().uuid().optional(), state: z.enum(["online", "viewing", "editing"]) }),
]);

export async function registerRealtimeRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/workspaces/:workspaceId/realtime",
    {
      websocket: true,
      preValidation: async (request) => {
        const { workspaceId } = paramsSchema.parse(request.params);
        const origin = request.headers.origin;
        if (origin && !env.CORS_ORIGINS.includes(origin)) throw app.httpErrors.forbidden("WebSocket origin denied");
        await requireWorkspacePermission(request, workspaceId, "workspace:read");
      },
    },
    (socket, request) => {
      const { workspaceId } = paramsSchema.parse(request.params);
      const session = requireSession(request);
      const client = app.realtime.addClient({
        socket,
        workspaceId,
        userId: session.user.id,
        userName: session.user.name,
      });

      let alive = true;
      let messages = 0;
      let messageWindowStartedAt = Date.now();
      socket.on("pong", () => { alive = true; });
      const heartbeat = setInterval(() => {
        if (!alive) return socket.terminate();
        alive = false;
        socket.ping();
      }, env.REALTIME_HEARTBEAT_MS);

      socket.send(JSON.stringify({
        type: "ready",
        connectionId: client.id,
        workspaceId,
        user: { id: session.user.id, name: session.user.name },
      }));
      void app.realtime.setPresence(client, "online");

      socket.on("message", async (raw) => {
        try {
          const now = Date.now();
          if (now - messageWindowStartedAt >= 60_000) {
            messages = 0;
            messageWindowStartedAt = now;
          }
          messages += 1;
          if (messages > env.REALTIME_MESSAGES_PER_MINUTE) {
            socket.close(1008, "Realtime message rate exceeded");
            return;
          }
          const parsed = messageSchema.parse(JSON.parse(raw.toString()));
          if (parsed.type === "ping") {
            socket.send(JSON.stringify({ type: "pong", occurredAt: new Date().toISOString() }));
            return;
          }
          if (parsed.type === "subscribe_task") {
            await requireTaskPermission(request, workspaceId, parsed.taskId, "task:read");
            app.realtime.subscribeTask(client, parsed.taskId);
            socket.send(JSON.stringify({ type: "subscribed", taskId: parsed.taskId }));
            return;
          }
          if (parsed.type === "unsubscribe_task") {
            app.realtime.unsubscribeTask(client, parsed.taskId);
            return;
          }
          if (parsed.taskId) await requireTaskPermission(request, workspaceId, parsed.taskId, "task:read");
          await app.realtime.setPresence(client, parsed.state, parsed.taskId);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid realtime message";
          socket.send(JSON.stringify({ type: "error", message }));
        }
      });

      socket.on("close", () => {
        clearInterval(heartbeat);
        void app.realtime.removeClient(client);
      });
      socket.on("error", () => {
        clearInterval(heartbeat);
      });
    },
  );
}
