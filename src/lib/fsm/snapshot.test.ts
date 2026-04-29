import { describe, it, expect } from "vitest";
import { isPersistedSnapshot } from "./snapshot";

describe("isPersistedSnapshot", () => {
  it("accepts a valid active snapshot", () => {
    expect(
      isPersistedSnapshot({
        status: "active",
        value: "idle",
        context: { conversationId: "abc" },
      }),
    ).toBe(true);
  });

  it("accepts done / error / stopped statuses", () => {
    for (const status of ["done", "error", "stopped"] as const) {
      expect(
        isPersistedSnapshot({
          status,
          value: "idle",
          context: {},
        }),
      ).toBe(true);
    }
  });

  it("rejects an unknown status", () => {
    expect(
      isPersistedSnapshot({
        status: "running",
        value: "idle",
        context: {},
      }),
    ).toBe(false);
  });

  it("rejects null / undefined / strings", () => {
    expect(isPersistedSnapshot(null)).toBe(false);
    expect(isPersistedSnapshot(undefined)).toBe(false);
    expect(isPersistedSnapshot("active")).toBe(false);
  });

  it("rejects objects without a recognised status", () => {
    // The schema is intentionally permissive about value/context shape (XState
    // owns those types) but `status` is the canary for a malformed row.
    expect(isPersistedSnapshot({ value: "idle", context: {} })).toBe(false);
    expect(isPersistedSnapshot({ status: "running" })).toBe(false);
  });
});
