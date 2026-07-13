import { describe, expect, it } from "vitest";
import { parseClamAvResponse } from "./clamav-protocol.js";

describe("ClamAV response parser", () => {
  it("recognizes a clean stream", () => {
    expect(parseClamAvResponse("stream: OK\0")).toEqual({ status: "clean", raw: "stream: OK" });
  });

  it("extracts the malware signature", () => {
    expect(parseClamAvResponse("stream: Eicar-Signature FOUND\0")).toEqual({
      status: "infected",
      signature: "Eicar-Signature",
      raw: "stream: Eicar-Signature FOUND",
    });
  });

  it("fails safely on an unknown response", () => {
    const result = parseClamAvResponse("stream: size limit exceeded ERROR\0");
    expect(result.status).toBe("error");
  });
});
