import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { PersistedSnapshot } from "@/lib/fsm/snapshot";

/**
 * Integration test for the optimistic-concurrency CAS pattern (W19').
 *
 * The unit tests stub repositories — they prove the orchestration logic
 * does the right thing when CAS succeeds or fails. They do NOT prove the
 * SQL primitive itself works (you can't verify
 * `UPDATE ... WHERE version = ? RETURNING` semantics with a mock).
 *
 * This file boots a real Postgres container, runs Drizzle migrations,
 * and exercises the CAS function directly. Four cases:
 *   1. Fresh conversations start at version 0.
 *   2. CAS succeeds on a matching version, bumps to version+1.
 *   3. CAS throws ConcurrentModificationError on a stale version.
 *   4. Two concurrent CAS attempts on the same version: exactly one wins.
 *
 * Boot cost: ~3-5s for a fresh Postgres container. Amortised across all
 * tests in this file via beforeAll.
 *
 * Run locally: requires Docker. `pnpm test:integration`. CI runs this in a
 * dedicated job (.github/workflows/ci.yml) on every PR.
 */

let container: StartedPostgreSqlContainer | undefined;

const baseSnapshot = (conversationId: string): PersistedSnapshot => ({
  status: "active",
  value: "idle",
  context: { conversationId },
});

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

describe("optimistic concurrency CAS (W19')", () => {
  it("creates a conversation with version 0", async () => {
    const { createConversation, getConversation } =
      await import("@/lib/db/repositories");
    const id = "concurrent-test-1";
    await createConversation(baseSnapshot(id), id);
    const fetched = await getConversation(id);
    expect(fetched).not.toBeNull();
    expect(fetched!.version).toBe(0);
  });

  it("CAS succeeds when expectedVersion matches and returns the bumped value", async () => {
    const { createConversation, updateConversationSnapshotIfVersion } =
      await import("@/lib/db/repositories");
    const id = "concurrent-test-2";
    await createConversation(baseSnapshot(id), id);

    const newVersion = await updateConversationSnapshotIfVersion(
      id,
      baseSnapshot(id),
      0,
    );
    expect(newVersion).toBe(1);
  });

  it("CAS throws ConcurrentModificationError on stale version (and leaves the row unchanged)", async () => {
    const {
      createConversation,
      updateConversationSnapshotIfVersion,
      getConversation,
      ConcurrentModificationError,
    } = await import("@/lib/db/repositories");
    const id = "concurrent-test-3";
    await createConversation(baseSnapshot(id), id);

    // First write succeeds (version 0 → 1).
    await updateConversationSnapshotIfVersion(id, baseSnapshot(id), 0);

    // Stale write attempting version 0 again should fail.
    await expect(
      updateConversationSnapshotIfVersion(id, baseSnapshot(id), 0),
    ).rejects.toBeInstanceOf(ConcurrentModificationError);

    // Row should still be at version 1 — the failed CAS did not write.
    const fetched = await getConversation(id);
    expect(fetched!.version).toBe(1);
  });

  it("two concurrent CAS attempts on the same version: exactly one wins", async () => {
    const {
      createConversation,
      updateConversationSnapshotIfVersion,
      getConversation,
      ConcurrentModificationError,
    } = await import("@/lib/db/repositories");
    const id = "concurrent-test-4";
    await createConversation(baseSnapshot(id), id);

    // Two writers race for the v0 → v1 transition.
    const results = await Promise.allSettled([
      updateConversationSnapshotIfVersion(id, baseSnapshot(id), 0),
      updateConversationSnapshotIfVersion(id, baseSnapshot(id), 0),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ConcurrentModificationError,
    );

    const fetched = await getConversation(id);
    expect(fetched!.version).toBe(1);
  });
});
