import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveScreenConfig } from "./resolve-config";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";

const ORIGINAL_ENV_MODEL = process.env.OPENROUTER_MODEL;

vi.mock("@/lib/db/repositories", () => ({
  getAppSettings: vi.fn(),
}));

import { getAppSettings } from "@/lib/db/repositories";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENROUTER_MODEL;
});

afterEach(() => {
  if (ORIGINAL_ENV_MODEL === undefined) {
    delete process.env.OPENROUTER_MODEL;
  } else {
    process.env.OPENROUTER_MODEL = ORIGINAL_ENV_MODEL;
  }
});

describe("resolveScreenConfig precedence", () => {
  it("returns DB values when env var is unset", async () => {
    vi.mocked(getAppSettings).mockResolvedValueOnce({
      model: "anthropic/claude-sonnet-4.6",
      timeoutMs: 90_000,
      maxRetries: 1,
      temperature: 0.4,
    });

    const cfg = await resolveScreenConfig();
    expect(cfg.model).toBe("anthropic/claude-sonnet-4.6");
    expect(cfg.timeoutMs).toBe(90_000);
    expect(cfg.maxRetries).toBe(1);
    expect(cfg.temperature).toBeCloseTo(0.4, 5);
    expect(cfg.source.model).toBe("db");
    expect(cfg.source.rest).toBe("db");
  });

  it("env var wins for model only — DB still drives timeout/retries/temp", async () => {
    process.env.OPENROUTER_MODEL = "openai/gpt-5";
    vi.mocked(getAppSettings).mockResolvedValueOnce({
      model: "anthropic/claude-haiku-4.5",
      timeoutMs: 75_000,
      maxRetries: 2,
      temperature: 0.6,
    });

    const cfg = await resolveScreenConfig();
    expect(cfg.model).toBe("openai/gpt-5");
    expect(cfg.timeoutMs).toBe(75_000);
    expect(cfg.maxRetries).toBe(2);
    expect(cfg.temperature).toBeCloseTo(0.6, 5);
    expect(cfg.source.model).toBe("env");
    expect(cfg.source.rest).toBe("db");
  });

  it("treats empty/whitespace OPENROUTER_MODEL as unset", async () => {
    process.env.OPENROUTER_MODEL = "   ";
    vi.mocked(getAppSettings).mockResolvedValueOnce({
      model: "anthropic/claude-haiku-4.5",
      timeoutMs: 60_000,
      maxRetries: 0,
      temperature: 0.2,
    });

    const cfg = await resolveScreenConfig();
    expect(cfg.model).toBe("anthropic/claude-haiku-4.5");
    expect(cfg.source.model).toBe("db");
  });

  it("falls back to DEFAULT_SETTINGS when DB read throws", async () => {
    vi.mocked(getAppSettings).mockRejectedValueOnce(new Error("db down"));

    const cfg = await resolveScreenConfig();
    expect(cfg.model).toBe(DEFAULT_SETTINGS.model);
    expect(cfg.timeoutMs).toBe(DEFAULT_SETTINGS.timeoutMs);
    expect(cfg.maxRetries).toBe(DEFAULT_SETTINGS.maxRetries);
    expect(cfg.temperature).toBeCloseTo(DEFAULT_SETTINGS.temperature, 5);
    expect(cfg.source.model).toBe("default");
    expect(cfg.source.rest).toBe("default");
  });

  it("env var still wins when DB is down", async () => {
    process.env.OPENROUTER_MODEL = "google/gemini-2.5-pro";
    vi.mocked(getAppSettings).mockRejectedValueOnce(new Error("db down"));

    const cfg = await resolveScreenConfig();
    expect(cfg.model).toBe("google/gemini-2.5-pro");
    expect(cfg.source.model).toBe("env");
    expect(cfg.source.rest).toBe("default");
  });
});
