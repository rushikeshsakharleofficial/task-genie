import { describe, expect, it } from "vitest";
import { toSlug } from "../slug.js";

describe("toSlug", () => {
  it("creates a stable URL-safe slug", () => {
    expect(toSlug("  Task Genie Product Team  ")).toBe("task-genie-product-team");
  });

  it("removes unsupported characters", () => {
    expect(toSlug("Task Genie @ Mumbai! #1")).toBe("task-genie-mumbai-1");
  });
});
