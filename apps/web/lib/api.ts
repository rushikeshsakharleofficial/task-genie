export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "include", cache: "no-store" });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  if (!response.ok) {
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    throw new ApiError(response.status, typeof record.message === "string" ? record.message : `Request failed (${response.status})`, record.details);
  }
  return payload as T;
}

export type User = { id: string; name: string; email: string; image?: string | null };
export type SessionData = { user: User; session: { id: string; expiresAt: string } };
export type Workspace = { id: string; name: string; slug: string; logoUrl?: string | null; role: "owner" | "admin" | "member" | "guest"; settings?: Record<string, unknown> };
export type Member = { userId: string; name: string; email: string; image?: string | null; role: string; status: string; joinedAt: string };
export type Project = { id: string; workspaceId: string; name: string; key: string; description?: string | null; color?: string | null; visibility: string; archivedAt?: string | null; taskCount?: number; completedTaskCount?: number };
export type Status = { id: string; name: string; category: string; color: string; position: number; isDefault?: boolean };
export type Label = { id: string; name: string; color: string };
export type Assignee = { userId: string; name: string; email: string; image?: string | null };
export type Task = {
  id: string; workspaceId: string; projectId: string; parentTaskId?: string | null; statusId?: string | null; number: number; title: string;
  description?: { text?: string } | null; type: string; priority: "urgent" | "high" | "normal" | "low" | "none"; estimateMinutes?: number | null;
  startAt?: string | null; dueAt?: string | null; completedAt?: string | null; createdAt: string; updatedAt: string; version: number;
  projectName?: string; projectKey?: string; projectColor?: string | null; statusName?: string | null; statusCategory?: string | null; statusColor?: string | null;
  assignees?: Assignee[]; labels?: Label[];
};
export type TaskList = { items: Task[]; total: number; limit: number; offset: number };
export type Comment = { id: string; body: { text?: string }; authorId: string; authorName: string; authorImage?: string | null; createdAt: string };
export type ChecklistItem = { id: string; content: string; isCompleted: boolean; position: number };
export type Checklist = { id: string; title: string; items: ChecklistItem[] };
export type Attachment = { id: string; originalName: string; mimeType: string; sizeBytes: number; createdAt: string; scanStatus?: string; scanResult?: string | null; scannedAt?: string | null };
export type Notification = { id: string; type: string; payload: Record<string, unknown>; taskId?: string | null; readAt?: string | null; createdAt: string };
export type ContentItem = { id: string; taskId?: string | null; type: "email" | "social" | "announcement"; title: string; subject?: string | null; body: string; audience: Record<string, unknown>; status: "draft" | "scheduled" | "sent" | "failed"; scheduledAt?: string | null; sentAt?: string | null; updatedAt: string };
export type DashboardData = { metrics: { total: number; assignedToMe: number; overdue: number; completedThisWeek: number }; tasks: Task[]; upcoming: Task[]; recentActivity: Array<{ id: string; action: string; entityType: string; metadata: Record<string, unknown>; createdAt: string }> };
export type AnalyticsData = { metrics: { total: number; completed: number; overdue: number; inProgress: number }; completedByDay: Array<{ date: string; count: number }>; byStatus: Array<{ name: string; count: number }>; workload: Array<{ name: string; count: number }>; tasks: Task[] };

export function initials(name?: string | null): string {
  return (name ?? "User").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}
export function formatDate(value?: string | null): string {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}
export function descriptionText(task?: Task | null): string {
  return task?.description?.text ?? "No description yet.";
}
