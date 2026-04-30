import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { randomBytes } from "node:crypto";
import { getDb } from "./client";
import {
  appSettings,
  conversations,
  messages,
  screenings,
  shareLinks,
  type Conversation,
  type Message,
  type NewMessage,
  type NewScreening,
  type Screening,
  type ShareLink,
} from "./schema";
import type { PersistedSnapshot } from "@/lib/fsm/snapshot";
import type { ScreeningResult } from "@/lib/domain/screening";
import {
  DEFAULT_SETTINGS,
  SETTINGS_SINGLETON_ID,
  type AppSettingsValue,
} from "@/lib/domain/settings";

/**
 * Thrown when an optimistic-concurrency compare-and-swap fails: the row's
 * `version` no longer matches what the caller read, meaning another request
 * wrote the conversation in between. The action layer translates this to a
 * product error string ("This conversation changed in another tab — refresh
 * to continue.") so users see something they can act on, not the class name.
 */
export class ConcurrentModificationError extends Error {
  readonly conversationId: string;
  readonly expectedVersion: number;
  constructor(conversationId: string, expectedVersion: number) {
    super(
      `Conversation ${conversationId} was modified concurrently (expected version ${expectedVersion})`,
    );
    this.name = "ConcurrentModificationError";
    this.conversationId = conversationId;
    this.expectedVersion = expectedVersion;
  }
}

/**
 * Thin repository layer.
 *
 * Server actions and route handlers should call these — never the Drizzle
 * client directly. That keeps SQL co-located with its model, and makes it
 * trivial to swap a call site to a fake in tests.
 */

function newId(): string {
  return nanoid(24);
}

export async function createConversation(
  snapshot: PersistedSnapshot,
  id?: string,
): Promise<Conversation> {
  const db = getDb();
  const [row] = await db
    .insert(conversations)
    .values({ id: id ?? newId(), fsmSnapshot: snapshot })
    .returning();
  if (!row) throw new Error("Failed to create conversation");
  return row;
}

export async function getConversation(
  id: string,
): Promise<Conversation | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Compare-and-swap update. Updates the conversation's snapshot only if the
 * current `version` still matches `expectedVersion`; otherwise throws
 * `ConcurrentModificationError`. Returns the new version on success.
 *
 * The tx is short — just one UPDATE — and runs OUTSIDE any AI call. The
 * orchestrator reads the version, calls the LLM (no DB connection held),
 * and only then attempts the CAS write.
 */
export async function updateConversationSnapshotIfVersion(
  id: string,
  snapshot: PersistedSnapshot,
  expectedVersion: number,
): Promise<number> {
  const db = getDb();
  const rows = await db
    .update(conversations)
    .set({
      fsmSnapshot: snapshot,
      version: sql`${conversations.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(eq(conversations.id, id), eq(conversations.version, expectedVersion)),
    )
    .returning({ version: conversations.version });
  const row = rows[0];
  if (!row) {
    throw new ConcurrentModificationError(id, expectedVersion);
  }
  return row.version;
}

export async function appendMessage(
  message: Omit<NewMessage, "id" | "createdAt">,
): Promise<Message> {
  const db = getDb();
  const [row] = await db
    .insert(messages)
    .values({ id: newId(), ...message })
    .returning();
  if (!row) throw new Error("Failed to insert message");
  return row;
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  const db = getDb();
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
}

export async function recordScreening(
  screening: Omit<NewScreening, "id" | "createdAt">,
): Promise<string> {
  const db = getDb();
  const id = newId();
  await db.insert(screenings).values({ id, ...screening });
  return id;
}

export async function listScreenings(
  conversationId: string,
): Promise<Screening[]> {
  const db = getDb();
  return db
    .select()
    .from(screenings)
    .where(eq(screenings.conversationId, conversationId))
    .orderBy(asc(screenings.createdAt));
}

/**
 * The full private shape — includes JD, CV, and the conversation transcript.
 * Returned by `getScreeningById` for the cookie owner only. The detail page
 * inside the workspace renders this.
 */
interface PrivateScreening {
  id: string;
  conversationId: string;
  jobDescription: string;
  cv: string;
  result: ScreeningResult;
  model: string;
  latencyMs: number;
  createdAt: Date;
}

/**
 * The narrowed public shape — same screening, but stripped of JD/CV text and
 * any fields a public viewer shouldn't see. Returned by `getScreeningForShare`
 * for the public /s/[slug] route. TypeScript enforces that callers can never
 * accidentally render JD or CV text on the share page.
 */
interface PublicScreening {
  id: string;
  result: ScreeningResult;
  model: string;
  latencyMs: number;
  createdAt: Date;
}

/**
 * Auth-gated read. Returns null if the screening doesn't exist OR if it
 * belongs to a different conversation than the calling cookie's. The double
 * check keeps URL-bashing from leaking another cookie's verdict.
 */
export async function getScreeningById(
  id: string,
  conversationId: string,
): Promise<PrivateScreening | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(screenings)
    .where(
      and(eq(screenings.id, id), eq(screenings.conversationId, conversationId)),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversationId,
    jobDescription: row.jobDescription,
    cv: row.cv,
    result: row.result,
    model: row.model,
    latencyMs: row.latencyMs,
    createdAt: row.createdAt,
  };
}

/**
 * Sidebar/dashboard fuel. Returns up to `limit` screenings for one
 * conversation, newest first. Result is the full ScreeningResult — callers
 * pluck candidateName / role / verdict / score from it.
 */
export async function listRecentScreenings(
  conversationId: string,
  limit = 50,
): Promise<PrivateScreening[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(screenings)
    .where(eq(screenings.conversationId, conversationId))
    .orderBy(desc(screenings.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    jobDescription: row.jobDescription,
    cv: row.cv,
    result: row.result,
    model: row.model,
    latencyMs: row.latencyMs,
    createdAt: row.createdAt,
  }));
}

/**
 * 16 random bytes encoded as URL-safe base32 (~26 chars). 128 bits of entropy
 * means a slug is unguessable in any reasonable adversary model.
 */
function newSlug(): string {
  const buf = randomBytes(16);
  // Crockford-style base32 (no padding, no ambiguous chars)
  const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits > 0) {
    out += alphabet[(value << (5 - bits)) & 31];
  }
  return out;
}

/**
 * Idempotent — if a share link already exists for this screening, returns it
 * unchanged. Otherwise creates a new one with a fresh slug.
 *
 * The UNIQUE constraint on screening_id (see schema.ts) makes the create
 * branch safe under concurrent calls: the second call's INSERT fails the
 * constraint and we fall through to read the row that won.
 */
export async function getOrCreateShareLink(
  screeningId: string,
): Promise<ShareLink> {
  const db = getDb();
  const existing = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.screeningId, screeningId))
    .limit(1);
  if (existing[0]) return existing[0];

  try {
    const [row] = await db
      .insert(shareLinks)
      .values({ slug: newSlug(), screeningId })
      .returning();
    if (!row) throw new Error("Failed to insert share link");
    return row;
  } catch {
    // Race lost — another request created one in between. Read it back.
    const winner = await db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.screeningId, screeningId))
      .limit(1);
    if (!winner[0]) throw new Error("Share link race lost but no row found");
    return winner[0];
  }
}

/** Read the existing share link (if any) without creating one. */
export async function getShareLinkForScreening(
  screeningId: string,
): Promise<ShareLink | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.screeningId, screeningId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Read the singleton settings row. Falls back to `DEFAULT_SETTINGS` if the
 * row is missing — that should only happen if migration 0003 didn't run, but
 * the fallback keeps the app booting in degraded mode rather than crashing.
 * The caller is `resolveScreenConfig`, which then layers env-var overrides.
 */
export async function getAppSettings(): Promise<AppSettingsValue> {
  const db = getDb();
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, SETTINGS_SINGLETON_ID))
    .limit(1);
  const row = rows[0];
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    model: row.model,
    timeoutMs: row.timeoutMs,
    maxRetries: row.maxRetries,
    temperature: row.temperature,
  };
}

/**
 * Upsert the singleton settings row. The Zod validation lives at the action
 * boundary (`saveSettingsAction`); this layer trusts its input.
 */
export async function saveAppSettings(
  next: AppSettingsValue,
): Promise<AppSettingsValue> {
  const db = getDb();
  const [row] = await db
    .insert(appSettings)
    .values({
      id: SETTINGS_SINGLETON_ID,
      model: next.model,
      timeoutMs: next.timeoutMs,
      maxRetries: next.maxRetries,
      temperature: next.temperature,
    })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: {
        model: next.model,
        timeoutMs: next.timeoutMs,
        maxRetries: next.maxRetries,
        temperature: next.temperature,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) throw new Error("Failed to upsert app settings");
  return {
    model: row.model,
    timeoutMs: row.timeoutMs,
    maxRetries: row.maxRetries,
    temperature: row.temperature,
  };
}

/**
 * Public read by slug — returns ONLY the narrowed PublicScreening shape. The
 * return type intentionally omits `jobDescription` and `cv` so the public
 * /s/[slug] route literally can't render them. See plan-eng-review issue 1B.
 */
export async function getScreeningForShare(
  slug: string,
): Promise<PublicScreening | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: screenings.id,
      result: screenings.result,
      model: screenings.model,
      latencyMs: screenings.latencyMs,
      createdAt: screenings.createdAt,
    })
    .from(shareLinks)
    .innerJoin(screenings, eq(shareLinks.screeningId, screenings.id))
    .where(eq(shareLinks.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}
