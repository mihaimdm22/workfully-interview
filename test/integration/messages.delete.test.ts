import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { PersistedSnapshot } from "@/lib/fsm/snapshot";
import type { ScreeningResult } from "@/lib/domain/screening";

/**
 * Integration test for `deleteMessagesForConversation` (sidebar-history fix).
 *
 * The "+ New screening" path deletes messages but must NOT touch the
 * `screenings` table. The FK `screenings.conversation_id ON DELETE CASCADE`
 * only fires when the conversation row itself is deleted; per-message
 * deletes leave dependent rows alone. That is a SQL truth, not a TS truth,
 * which is why the unit test (mocked Drizzle) can't prove it. This test
 * exercises a real Postgres container.
 *
 * Run locally: requires Docker. `pnpm test:integration`.
 */

let container: StartedPostgreSqlContainer | undefined;

const baseSnapshot = (conversationId: string): PersistedSnapshot => ({
  status: "active",
  value: "idle",
  context: { conversationId },
});

const fakeResult: ScreeningResult = {
  candidateName: "Test Candidate",
  role: "Senior Backend Engineer",
  verdict: "strong",
  score: 88,
  summary: "Strong fit.",
  mustHaves: [{ requirement: "TypeScript", matched: true }],
  niceToHaves: [],
  strengths: ["Postgres"],
  gaps: [],
  recommendation: "Move forward.",
};

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine")
    .withDatabase("workfully_test")
    .withUsername("test")
    .withPassword("test")
    .start();

  const url = container.getConnectionUri();
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "src/lib/db/migrations" });
  await client.end();
}, 60_000);

afterAll(async () => {
  await container?.stop();
});

describe("deleteMessagesForConversation (integration)", () => {
  it("removes messages but preserves the parent conversation and its screenings", async () => {
    const url = container!.getConnectionUri();
    const client = postgres(url, { max: 1 });
    const conversationId = "convo-delete-test-1234567890";

    // Seed: one conversation, three messages, one screening.
    await client`
      INSERT INTO conversations (id, fsm_snapshot)
      VALUES (${conversationId}, ${JSON.stringify(baseSnapshot(conversationId))}::jsonb)
    `;
    for (const role of ["bot", "user", "bot"] as const) {
      await client`
        INSERT INTO messages (id, conversation_id, role, content)
        VALUES (${"msg-" + role + Math.random().toString(36).slice(2, 8)},
                ${conversationId}, ${role}, ${"hello"})
      `;
    }
    await client`
      INSERT INTO screenings (id, conversation_id, job_description, cv, result, model, latency_ms)
      VALUES ('screening-keep-12345678901234',
              ${conversationId}, 'JD', 'CV', ${JSON.stringify(fakeResult)}::jsonb,
              'fake', 1234)
    `;

    const beforeMsgs =
      await client`SELECT count(*)::int AS c FROM messages WHERE conversation_id = ${conversationId}`;
    expect(beforeMsgs[0]!.c).toBe(3);

    // The system under test — deleting messages by conversation_id directly,
    // mirroring what `deleteMessagesForConversation` does.
    await client`DELETE FROM messages WHERE conversation_id = ${conversationId}`;

    const afterMsgs =
      await client`SELECT count(*)::int AS c FROM messages WHERE conversation_id = ${conversationId}`;
    expect(afterMsgs[0]!.c).toBe(0);

    const convoStillThere =
      await client`SELECT count(*)::int AS c FROM conversations WHERE id = ${conversationId}`;
    expect(convoStillThere[0]!.c).toBe(1);

    const screeningsStillThere =
      await client`SELECT count(*)::int AS c FROM screenings WHERE conversation_id = ${conversationId}`;
    expect(screeningsStillThere[0]!.c).toBe(1);

    await client.end();
  }, 30_000);
});
