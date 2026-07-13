import crypto from "node:crypto";
import path from "node:path";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { attachments } from "../../db/schema/index.js";
import { requireTaskPermission } from "../../lib/task-access.js";
import { scanBufferWithClamAv } from "../../lib/clamav.js";

const params = z.object({ workspaceId: z.string().uuid(), taskId: z.string().uuid() });
const attachmentParams = params.extend({ attachmentId: z.string().uuid() });
const allowed = new Map<string, Set<string>>([
  ["application/pdf", new Set([".pdf"])],
  ["image/png", new Set([".png"])],
  ["image/jpeg", new Set([".jpg", ".jpeg"])],
  ["text/plain", new Set([".txt", ".md", ".csv"])],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", new Set([".docx"])],
]);

function absoluteStoragePath(storageKey: string): string {
  const root = path.resolve(env.UPLOAD_DIR);
  const resolved = path.resolve(root, storageKey);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error("Unsafe storage path");
  return resolved;
}

export async function registerAttachmentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspaces/:workspaceId/tasks/:taskId/attachments", async (request) => {
    const { workspaceId, taskId } = params.parse(request.params);
    await requireTaskPermission(request, workspaceId, taskId, "task:read");
    return db.select({
      id: attachments.id,
      originalName: attachments.originalName,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      sha256: attachments.sha256,
      createdAt: attachments.createdAt,
      uploadedBy: attachments.uploadedBy,
      scanStatus: attachments.scanStatus,
      scanResult: attachments.scanResult,
      scannedAt: attachments.scannedAt,
    }).from(attachments).where(and(eq(attachments.workspaceId, workspaceId), eq(attachments.taskId, taskId), eq(attachments.quarantined, false), inArray(attachments.scanStatus, ["clean", "scan_error_accepted"])));
  });

  app.post("/api/v1/workspaces/:workspaceId/tasks/:taskId/attachments", async (request, reply) => {
    const { workspaceId, taskId } = params.parse(request.params);
    const { userId } = await requireTaskPermission(request, workspaceId, taskId, "task:update");
    const file = await request.file({ limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1 } });
    if (!file) throw app.httpErrors.badRequest("A file is required");
    const extension = path.extname(file.filename).toLowerCase();
    const validExtensions = allowed.get(file.mimetype);
    if (!validExtensions?.has(extension)) throw app.httpErrors.unsupportedMediaType("File type is not allowed");
    const buffer = await file.toBuffer();
    if (!buffer.length) throw app.httpErrors.badRequest("Empty files are not allowed");
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const scan = await scanBufferWithClamAv(buffer);
    if (scan.status === "infected") {
      request.log.warn({ workspaceId, taskId, userId, sha256, signature: scan.signature }, "Rejected malware upload");
      throw app.httpErrors.unprocessableEntity(`Upload rejected by ClamAV: ${scan.signature}`);
    }
    if (scan.status === "error" && !env.CLAMAV_FAIL_OPEN) {
      request.log.error({ workspaceId, taskId, userId, sha256, scanError: scan.message }, "ClamAV scan failed closed");
      throw app.httpErrors.serviceUnavailable("Upload scanning is temporarily unavailable");
    }
    const key = `${workspaceId}/${taskId}/${crypto.randomUUID()}${extension}`;
    const target = absoluteStoragePath(key);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o750 });
    await writeFile(target, buffer, { mode: 0o640, flag: "wx" });
    const [created] = await db.insert(attachments).values({
      workspaceId,
      taskId,
      uploadedBy: userId,
      originalName: path.basename(file.filename),
      storageKey: key,
      mimeType: file.mimetype,
      sizeBytes: buffer.length,
      sha256,
      quarantined: false,
      scanStatus: scan.status === "clean" ? "clean" : "scan_error_accepted",
      scanResult: scan.status === "clean" ? scan.raw.slice(0, 255) : scan.message.slice(0, 255),
      scannedAt: new Date(),
    }).returning();
    if (!created) throw new Error("Attachment insert returned no row");
    await app.realtime.publish({ workspaceId, taskId, entityType: "attachment", entityId: created.id, action: "created", visibility: "task_subscribers", actorId: userId, payload: { originalName: created.originalName, sizeBytes: created.sizeBytes, scanStatus: created.scanStatus } });
    return reply.status(201).send(created);
  });

  app.get("/api/v1/workspaces/:workspaceId/tasks/:taskId/attachments/:attachmentId/download", async (request, reply) => {
    const { workspaceId, taskId, attachmentId } = attachmentParams.parse(request.params);
    await requireTaskPermission(request, workspaceId, taskId, "task:read");
    const [attachment] = await db.select().from(attachments).where(and(eq(attachments.id, attachmentId), eq(attachments.workspaceId, workspaceId), eq(attachments.taskId, taskId), eq(attachments.quarantined, false), inArray(attachments.scanStatus, ["clean", "scan_error_accepted"]))).limit(1);
    if (!attachment) throw app.httpErrors.notFound("Attachment not found");
    const target = absoluteStoragePath(attachment.storageKey);
    await stat(target).catch(() => { throw app.httpErrors.notFound("Attachment file is missing"); });
    reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`);
    reply.type(attachment.mimeType);
    return reply.send(createReadStream(target));
  });

  app.delete("/api/v1/workspaces/:workspaceId/tasks/:taskId/attachments/:attachmentId", async (request, reply) => {
    const { workspaceId, taskId, attachmentId } = attachmentParams.parse(request.params);
    await requireTaskPermission(request, workspaceId, taskId, "task:update");
    const [attachment] = await db.delete(attachments).where(and(eq(attachments.id, attachmentId), eq(attachments.workspaceId, workspaceId), eq(attachments.taskId, taskId))).returning();
    if (!attachment) throw app.httpErrors.notFound("Attachment not found");
    await unlink(absoluteStoragePath(attachment.storageKey)).catch(() => undefined);
    await app.realtime.publish({ workspaceId, taskId, entityType: "attachment", entityId: attachmentId, action: "deleted", visibility: "task_subscribers" });
    return reply.status(204).send();
  });
}
