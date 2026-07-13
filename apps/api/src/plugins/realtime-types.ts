export type RealtimeEntityType =
  | "workspace"
  | "member"
  | "project"
  | "task"
  | "comment"
  | "checklist"
  | "checklist_item"
  | "attachment"
  | "notification"
  | "content";

export type RealtimeEvent = {
  id: string;
  workspaceId: string;
  taskId?: string;
  entityType: RealtimeEntityType;
  entityId: string;
  action: "created" | "updated" | "deleted" | "archived" | "restored" | "scheduled" | "read";
  actorId?: string;
  occurredAt: string;
  payload?: Record<string, unknown>;
  visibility?: "workspace" | "task_subscribers";
};

export type PresenceEvent = {
  type: "presence";
  workspaceId: string;
  userId: string;
  userName: string;
  connectionId: string;
  taskId?: string;
  state: "online" | "viewing" | "editing" | "offline";
  occurredAt: string;
};

export function canReceiveRealtimeEvent(event: RealtimeEvent, taskSubscriptions: ReadonlySet<string>): boolean {
  return event.visibility !== "task_subscribers" || !event.taskId || taskSubscriptions.has(event.taskId);
}
