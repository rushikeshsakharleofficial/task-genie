"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./providers";

export type RealtimeEvent = {
  id: string;
  workspaceId: string;
  taskId?: string;
  entityType: "workspace" | "member" | "project" | "task" | "comment" | "checklist" | "checklist_item" | "attachment" | "notification" | "content";
  entityId: string;
  action: "created" | "updated" | "deleted" | "archived" | "restored" | "scheduled" | "read";
  actorId?: string;
  occurredAt: string;
  payload?: Record<string, unknown>;
};

export type Presence = {
  userId: string;
  userName: string;
  connectionId: string;
  taskId?: string;
  state: "online" | "viewing" | "editing" | "offline";
  occurredAt: string;
};

type Listener = (event: RealtimeEvent) => void;
type RealtimeContextValue = {
  status: "disabled" | "connecting" | "connected" | "disconnected";
  subscribeTask: (taskId: string) => () => void;
  setTaskPresence: (state: "online" | "viewing" | "editing", taskId?: string) => void;
  addEventListener: (listener: Listener) => () => void;
  taskPresence: (taskId: string) => Presence[];
};

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

function realtimeUrl(workspaceId: string): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL?.replace(/\/$/, "");
  if (explicit) return `${explicit}/api/v1/workspaces/${workspaceId}/realtime`;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const developmentHost = window.location.hostname === "localhost" && window.location.port === "3000"
    ? `${window.location.hostname}:4000`
    : window.location.host;
  return `${protocol}//${developmentHost}/api/v1/workspaces/${workspaceId}/realtime`;
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { session, workspace } = useApp();
  const sessionUserId = session?.user.id;
  const activeWorkspaceId = workspace?.id;
  const socketRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef(new Set<Listener>());
  const subscriptionsRef = useRef(new Set<string>());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const manualCloseRef = useRef(false);
  const [status, setStatus] = useState<RealtimeContextValue["status"]>("disabled");
  const [presence, setPresence] = useState<Record<string, Presence>>({});

  const send = useCallback((payload: Record<string, unknown>) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(payload));
  }, []);

  useEffect(() => {
    if (!sessionUserId || !activeWorkspaceId) {
      setStatus("disabled");
      return;
    }
    manualCloseRef.current = false;
    subscriptionsRef.current.clear();
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setStatus("connecting");
      const socket = new WebSocket(realtimeUrl(activeWorkspaceId));
      socketRef.current = socket;
      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setStatus("connected");
        for (const taskId of subscriptionsRef.current) socket.send(JSON.stringify({ type: "subscribe_task", taskId }));
      };
      socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(String(message.data)) as { type?: string; event?: RealtimeEvent } & Partial<Presence>;
          if (payload.type === "event" && payload.event) {
            for (const listener of listenersRef.current) listener(payload.event);
            return;
          }
          if (payload.type === "presence" && payload.connectionId && payload.userId && payload.userName && payload.state && payload.occurredAt) {
            const item = payload as Presence & { type: "presence" };
            setPresence((current) => {
              const next = { ...current };
              if (item.state === "offline") delete next[item.connectionId];
              else next[item.connectionId] = item;
              return next;
            });
          }
        } catch {
          // Ignore malformed server messages. The socket remains usable.
        }
      };
      socket.onclose = () => {
        socketRef.current = null;
        if (disposed || manualCloseRef.current) return;
        setStatus("disconnected");
        const attempt = Math.min(reconnectAttemptRef.current++, 6);
        const delay = Math.min(15_000, 750 * 2 ** attempt) + Math.floor(Math.random() * 350);
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      disposed = true;
      manualCloseRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      socketRef.current?.close(1000, "Workspace changed");
      socketRef.current = null;
      setPresence({});
      setStatus("disabled");
    };
  }, [sessionUserId, activeWorkspaceId]);

  const subscribeTask = useCallback((taskId: string) => {
    subscriptionsRef.current.add(taskId);
    send({ type: "subscribe_task", taskId });
    return () => {
      subscriptionsRef.current.delete(taskId);
      send({ type: "unsubscribe_task", taskId });
    };
  }, [send]);

  const setTaskPresence = useCallback((state: "online" | "viewing" | "editing", taskId?: string) => {
    send({ type: "presence", state, ...(taskId ? { taskId } : {}) });
  }, [send]);

  const addEventListener = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  const taskPresence = useCallback((taskId: string) => {
    const unique = new Map<string, Presence>();
    for (const item of Object.values(presence)) {
      if (item.taskId === taskId && item.userId !== session?.user.id) unique.set(item.userId, item);
    }
    return [...unique.values()].sort((a, b) => a.userName.localeCompare(b.userName));
  }, [presence, session?.user.id]);

  const value = useMemo<RealtimeContextValue>(() => ({ status, subscribeTask, setTaskPresence, addEventListener, taskPresence }), [status, subscribeTask, setTaskPresence, addEventListener, taskPresence]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const value = useContext(RealtimeContext);
  if (!value) throw new Error("useRealtime must be used inside RealtimeProvider");
  return value;
}

export function useRealtimeEvent(listener: Listener): void {
  const { addEventListener } = useRealtime();
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  useEffect(() => addEventListener((event) => listenerRef.current(event)), [addEventListener]);
}

export function useWorkspaceRealtimeRefresh(workspaceId: string | undefined, refresh: () => void | Promise<void>): void {
  useRealtimeEvent((event) => {
    if (!workspaceId || event.workspaceId !== workspaceId) return;
    if (event.entityType === "workspace" || ["project", "member", "notification", "content"].includes(event.entityType)) void refresh();
  });
}
