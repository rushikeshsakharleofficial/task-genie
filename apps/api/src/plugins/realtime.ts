import crypto from "node:crypto";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { Redis as Valkey } from "iovalkey";
import type { WebSocket } from "ws";
import { env } from "../config/env.js";
import { valkey } from "./valkey.js";

import { canReceiveRealtimeEvent, type PresenceEvent, type RealtimeEvent } from "./realtime-types.js";
export type { PresenceEvent, RealtimeEvent } from "./realtime-types.js";

type ClientConnection = {
  id: string;
  socket: WebSocket;
  workspaceId: string;
  userId: string;
  userName: string;
  taskSubscriptions: Set<string>;
  taskId?: string;
  presenceState: PresenceEvent["state"];
};

type PublishInput = Omit<RealtimeEvent, "id" | "occurredAt"> & { id?: string; occurredAt?: string };

const realtimePattern = `${env.VALKEY_KEY_PREFIX}realtime:*`;
const presencePattern = `${env.VALKEY_KEY_PREFIX}presence:*`;
const channelFor = (workspaceId: string) => `${env.VALKEY_KEY_PREFIX}realtime:${workspaceId}`;
const presenceChannelFor = (workspaceId: string) => `${env.VALKEY_KEY_PREFIX}presence:${workspaceId}`;

export class RealtimeService {
  private readonly clients = new Map<string, Set<ClientConnection>>();
  private subscriber: Valkey | null = null;
  private started = false;

  constructor(private readonly log: FastifyBaseLogger) {}

  async start(): Promise<void> {
    if (!env.REALTIME_ENABLED || this.started) return;
    this.subscriber = new Valkey(env.VALKEY_URL, {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 1,
    });
    await this.subscriber.connect();
    await this.subscriber.psubscribe(realtimePattern, presencePattern);
    this.subscriber.on("pmessage", (_pattern, channel, raw) => {
      try {
        const payload = JSON.parse(raw) as RealtimeEvent | PresenceEvent;
        if (channel.includes(":presence:")) this.broadcastPresence(payload as PresenceEvent);
        else this.broadcastEvent(payload as RealtimeEvent);
      } catch (error) {
        this.log.warn({ error, channel }, "Ignored invalid realtime pub/sub message");
      }
    });
    this.started = true;
    this.log.info("Realtime Valkey pub/sub bridge started");
  }

  async close(): Promise<void> {
    for (const connections of this.clients.values()) {
      for (const client of connections) client.socket.close(1001, "Server shutting down");
    }
    this.clients.clear();
    if (this.subscriber && this.subscriber.status !== "end") await this.subscriber.quit().catch(() => undefined);
    this.subscriber = null;
    this.started = false;
  }

  addClient(input: Omit<ClientConnection, "id" | "taskSubscriptions" | "presenceState">): ClientConnection {
    const client: ClientConnection = {
      ...input,
      id: crypto.randomUUID(),
      taskSubscriptions: new Set(),
      presenceState: "online",
    };
    const workspaceClients = this.clients.get(client.workspaceId) ?? new Set<ClientConnection>();
    workspaceClients.add(client);
    this.clients.set(client.workspaceId, workspaceClients);
    return client;
  }

  async removeClient(client: ClientConnection): Promise<void> {
    const workspaceClients = this.clients.get(client.workspaceId);
    workspaceClients?.delete(client);
    if (workspaceClients?.size === 0) this.clients.delete(client.workspaceId);
    await this.publishPresence(client, "offline", client.taskId);
  }

  subscribeTask(client: ClientConnection, taskId: string): void {
    client.taskSubscriptions.add(taskId);
  }

  unsubscribeTask(client: ClientConnection, taskId: string): void {
    client.taskSubscriptions.delete(taskId);
    if (client.taskId === taskId) delete client.taskId;
  }

  async setPresence(client: ClientConnection, state: PresenceEvent["state"], taskId?: string): Promise<void> {
    client.presenceState = state;
    if (taskId) {
      client.taskId = taskId;
      client.taskSubscriptions.add(taskId);
    } else {
      delete client.taskId;
    }
    await this.publishPresence(client, state, taskId);
  }

  async publish(input: PublishInput): Promise<RealtimeEvent> {
    const event: RealtimeEvent = {
      ...input,
      id: input.id ?? crypto.randomUUID(),
      occurredAt: input.occurredAt ?? new Date().toISOString(),
    };
    if (!env.REALTIME_ENABLED) return event;
    try {
      await valkey.publish(channelFor(event.workspaceId), JSON.stringify(event));
    } catch (error) {
      this.log.warn({ error, eventId: event.id }, "Valkey realtime publish failed; using local broadcast");
      this.broadcastEvent(event);
    }
    return event;
  }

  private async publishPresence(client: ClientConnection, state: PresenceEvent["state"], taskId?: string): Promise<void> {
    if (!env.REALTIME_ENABLED) return;
    const event: PresenceEvent = {
      type: "presence",
      workspaceId: client.workspaceId,
      userId: client.userId,
      userName: client.userName,
      connectionId: client.id,
      ...(taskId ? { taskId } : {}),
      state,
      occurredAt: new Date().toISOString(),
    };
    try {
      await valkey.publish(presenceChannelFor(client.workspaceId), JSON.stringify(event));
    } catch (error) {
      this.log.warn({ error, connectionId: client.id }, "Valkey presence publish failed; using local broadcast");
      this.broadcastPresence(event);
    }
  }

  private broadcastEvent(event: RealtimeEvent): void {
    const message = JSON.stringify({ type: "event", event });
    const clients = this.clients.get(event.workspaceId) ?? [];
    for (const client of clients) {
      if (client.socket.readyState !== 1) continue;
      if (!canReceiveRealtimeEvent(event, client.taskSubscriptions)) continue;
      client.socket.send(message);
    }
    if (event.visibility === "task_subscribers") {
      const refreshEvent: RealtimeEvent = {
        id: `${event.id}-refresh`,
        workspaceId: event.workspaceId,
        entityType: "workspace",
        entityId: event.workspaceId,
        action: "updated",
        occurredAt: event.occurredAt,
        payload: { reason: "collaboration_changed" },
        visibility: "workspace",
      };
      const refreshMessage = JSON.stringify({ type: "event", event: refreshEvent });
      for (const client of clients) {
        if (client.socket.readyState === 1) client.socket.send(refreshMessage);
      }
    }
  }

  private broadcastPresence(event: PresenceEvent): void {
    const message = JSON.stringify(event);
    for (const client of this.clients.get(event.workspaceId) ?? []) {
      if (client.socket.readyState !== 1) continue;
      if (event.taskId && !client.taskSubscriptions.has(event.taskId)) continue;
      client.socket.send(message);
    }
  }
}

declare module "fastify" {
  interface FastifyInstance {
    realtime: RealtimeService;
  }
}

export async function registerRealtimeService(app: FastifyInstance): Promise<void> {
  const service = new RealtimeService(app.log);
  app.decorate("realtime", service);
  app.addHook("onClose", async () => service.close());
}
