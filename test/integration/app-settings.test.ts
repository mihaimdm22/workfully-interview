import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Integration test for the singleton `app_settings` row.
 *
 * Three things to prove against a real Postgres:
 *   1. Migration 0003 seeds the singleton row with the documented defaults.
 *   2. `saveAppSettings` upserts into that single row (no second row appears).
 *   3. Concurrent saves don't corrupt the row — last write wins, no torn rows.
 *
 * Boots its own container so the test is hermetic — sharing the container
 * with `orchestrator.concurrent.test.ts` would couple the suites.
 */

let container: StartedPostgreSqlContainer | undefined;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;

  const adminClient = postgres(url, { max: 1 });
  try {
    const db = drizzle(adminClient);
    await migrate(db, { migrationsFolder: "src/lib/db/migrations" });
  } finally {
    await adminClient.end();
  }
}, 120_000);

afterAll(async () => {
  if (container) await container.stop();
});

describe("app_settings singleton", () => {
  it("migration seeds the singleton row with the documented defaults", async () => {
    const { getAppSettings } = await import("@/lib/db/repositories");
    const settings = await getAppSettings();
    expect(settings.model).toBe("anthropic/claude-haiku-4.5");
    expect(settings.timeoutMs).toBe(120_000);
    expect(settings.maxRetries).toBe(0);
    expect(settings.temperature).toBeCloseTo(0.2, 5);
  });

  it("saveAppSettings upserts the singleton row (no second row appears)", async () => {
    const { saveAppSettings, getAppSettings } =
      await import("@/lib/db/repositories");
    const { appSettings } = await import("@/lib/db/schema");
    const { getDb } = await import("@/lib/db/client");

    const next = {
      model: "anthropic/claude-sonnet-4.6",
      timeoutMs: 90_000,
      maxRetries: 1,
      temperature: 0.5,
    };

    const written = await saveAppSettings(next);
    expect(written.model).toBe(next.model);
    expect(written.timeoutMs).toBe(next.timeoutMs);
    expect(written.maxRetries).toBe(next.maxRetries);
    expect(written.temperature).toBeCloseTo(next.temperature, 5);

    const read = await getAppSettings();
    expect(read).toMatchObject(next);

    const all = await getDb().select().from(appSettings);
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe("singleton");
  });

  it("concurrent saves leave a single coherent row (last write wins)", async () => {
    const { saveAppSettings, getAppSettings } =
      await import("@/lib/db/repositories");
    const { appSettings } = await import("@/lib/db/schema");
    const { getDb } = await import("@/lib/db/client");

    const a = {
      model: "openai/gpt-5",
      timeoutMs: 75_000,
      maxRetries: 2,
      temperature: 0.3,
    };
    const b = {
      model: "google/gemini-2.5-pro",
      timeoutMs: 120_000,
      maxRetries: 0,
      temperature: 0.7,
    };

    await Promise.all([saveAppSettings(a), saveAppSettings(b)]);

    const all = await getDb().select().from(appSettings);
    expect(all).toHaveLength(1);

    const final = await getAppSettings();
    // Either A or B won — both are valid outcomes. The invariant is that the
    // row is a coherent copy of one of them, not a Frankenstein mix.
    const isCoherentlyA =
      final.model === a.model &&
      final.timeoutMs === a.timeoutMs &&
      final.maxRetries === a.maxRetries &&
      Math.abs(final.temperature - a.temperature) < 1e-5;
    const isCoherentlyB =
      final.model === b.model &&
      final.timeoutMs === b.timeoutMs &&
      final.maxRetries === b.maxRetries &&
      Math.abs(final.temperature - b.temperature) < 1e-5;
    expect(isCoherentlyA || isCoherentlyB).toBe(true);
  });
});
