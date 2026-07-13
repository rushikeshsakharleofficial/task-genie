import net from "node:net";
import { env } from "../config/env.js";

import { parseClamAvResponse, type ClamAvScanResult } from "./clamav-protocol.js";

function writeChunk(socket: net.Socket, chunk: Buffer): void {
  const size = Buffer.allocUnsafe(4);
  size.writeUInt32BE(chunk.length, 0);
  socket.write(size);
  socket.write(chunk);
}

export async function scanBufferWithClamAv(buffer: Buffer): Promise<ClamAvScanResult> {
  if (!env.CLAMAV_ENABLED) return { status: "clean", raw: "ClamAV disabled" };
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: env.CLAMAV_HOST, port: env.CLAMAV_PORT });
    let settled = false;
    let response = "";
    const finish = (result: ClamAvScanResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(env.CLAMAV_TIMEOUT_MS);
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < buffer.length; offset += env.CLAMAV_CHUNK_BYTES) {
        writeChunk(socket, buffer.subarray(offset, Math.min(offset + env.CLAMAV_CHUNK_BYTES, buffer.length)));
      }
      const end = Buffer.alloc(4);
      socket.write(end);
    });
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (!response.includes("\0") && !response.includes("\n")) return;
      finish(parseClamAvResponse(response));
    });
    socket.on("timeout", () => finish({ status: "error", message: `ClamAV scan timed out after ${env.CLAMAV_TIMEOUT_MS}ms` }));
    socket.on("error", (error) => finish({ status: "error", message: error.message }));
    socket.on("end", () => {
      if (!settled) finish({ status: "error", message: `ClamAV closed the connection before a valid result: ${response.trim()}` });
    });
  });
}

export async function pingClamAv(): Promise<boolean> {
  if (!env.CLAMAV_ENABLED) return true;
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: env.CLAMAV_HOST, port: env.CLAMAV_PORT });
    let settled = false;
    let response = "";
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(Math.min(env.CLAMAV_TIMEOUT_MS, 5_000));
    socket.on("connect", () => socket.write("zPING\0"));
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (response.includes("PONG")) finish(true);
    });
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
    socket.on("end", () => finish(response.includes("PONG")));
  });
}
