import { describe, expect, it } from "vitest";
import { canReceiveRealtimeEvent, type RealtimeEvent } from "./realtime-types.js";

const base: RealtimeEvent = {
  id: "event-1",
  workspaceId: "workspace-1",
  taskId: "task-1",
  entityType: "task",
  entityId: "task-1",
  action: "updated",
  occurredAt: new Date(0).toISOString(),
};

describe("realtime event privacy", () => {
  it("delivers workspace events without a task subscription", () => {
    expect(canReceiveRealtimeEvent({ ...base, visibility: "workspace" }, new Set())).toBe(true);
  });

  it("delivers task details only to subscribed clients", () => {
    expect(canReceiveRealtimeEvent({ ...base, visibility: "task_subscribers" }, new Set())).toBe(false);
    expect(canReceiveRealtimeEvent({ ...base, visibility: "task_subscribers" }, new Set(["task-1"]))).toBe(true);
  });
});
