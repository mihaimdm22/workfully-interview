import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  listModels,
  isAllowlistedModel,
  __resetModelsCacheForTests,
} from "./openrouter-models";
import { MODEL_ALLOWLIST } from "@/lib/domain/settings";

const ORIGINAL_API_KEY = process.env.OPENROUTER_API_KEY;

beforeEach(() => {
  __resetModelsCacheForTests();
  process.env.OPENROUTER_API_KEY = "test-key";
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env.OPENROUTER_API_KEY = ORIGINAL_API_KEY;
});

describe("listModels", () => {
  it("intersects the OpenRouter response with the allowlist and returns 'live'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            data: [
              { id: "anthropic/claude-haiku-4.5" },
              { id: "anthropic/claude-sonnet-4.6" },
              { id: "openai/gpt-3.5-turbo" }, // not allowlisted — should be filtered out
              { id: "some/random-model" }, // not allowlisted
            ],
          }),
          { status: 200 },
        );
      }),
    );

    const result = await listModels();
    expect(result.source).toBe("live");
    const ids = result.models.map((m) => m.id);
    expect(ids).toContain("anthropic/claude-haiku-4.5");
    expect(ids).toContain("anthropic/claude-sonnet-4.6");
    expect(ids).not.toContain("openai/gpt-3.5-turbo");
    expect(ids).not.toContain("some/random-model");
  });

  it("returns the full allowlist as 'fallback' on fetch error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const result = await listModels();
    expect(result.source).toBe("fallback");
    expect(result.models.map((m) => m.id)).toEqual(
      MODEL_ALLOWLIST.map((m) => m.id),
    );
  });

  it("returns the full allowlist as 'fallback' on non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limited", { status: 429 })),
    );
    const result = await listModels();
    expect(result.source).toBe("fallback");
    expect(result.models).toHaveLength(MODEL_ALLOWLIST.length);
  });

  it("returns 'fallback' (not empty) when the live response intersects to nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({ data: [{ id: "completely/unknown-model" }] }),
          { status: 200 },
        );
      }),
    );
    const result = await listModels();
    expect(result.source).toBe("fallback");
    expect(result.models.length).toBeGreaterThan(0);
  });

  it("returns 'fallback' when OPENROUTER_API_KEY is unset", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await listModels();
    expect(result.source).toBe("fallback");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("serves the second call from cache (fetches only once)", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ id: "anthropic/claude-haiku-4.5" }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const first = await listModels();
    const second = await listModels();
    expect(first.source).toBe("live");
    expect(second.source).toBe("cache");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("isAllowlistedModel", () => {
  it("accepts an id that's in the allowlist", () => {
    expect(isAllowlistedModel("anthropic/claude-haiku-4.5")).toBe(true);
  });

  it("rejects an id that's not in the allowlist", () => {
    expect(isAllowlistedModel("anthropic/claude-2")).toBe(false);
    expect(isAllowlistedModel("")).toBe(false);
  });
});
