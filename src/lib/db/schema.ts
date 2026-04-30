import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
  varchar,
  integer,
  real,
} from "drizzle-orm/pg-core";
import type { ScreeningResult } from "@/lib/domain/screening";
import type { PersistedSnapshot } from "@/lib/fsm/snapshot";

/**
 * Schema design notes (see docs/adr/0003-database.md for the full rationale).
 *
 * - `conversations` owns the FSM snapshot. One actor instance per row.
 * - `messages` is append-only; the chat transcript is the audit log.
 * - `screenings` is denormalized — once a verdict is produced we copy the JD/CV
 *   text in. Users can later edit a JD without invalidating prior screenings.
 *
 * Text columns hold parsed plain-text (PDFs are parsed at the edge). We don't
 * store the original PDF bytes in v1 — adding object storage is a TODO if the
 * recruiter needs to re-download what the candidate uploaded.
 */

export const messageRoleEnum = pgEnum("message_role", [
  "user",
  "bot",
  "system",
]);

export const conversations = pgTable(
  "conversations",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    fsmSnapshot: jsonb("fsm_snapshot").$type<PersistedSnapshot>().notNull(),
    // Optimistic-concurrency token. Every write must compare-and-swap on
    // this; a bumped version means another request wrote the conversation
    // first and the caller has to refetch. See ADR 0006.
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [index("conversations_updated_at_idx").on(table.updatedAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    conversationId: varchar("conversation_id", { length: 32 })
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    attachmentName: text("attachment_name"),
    attachmentBytes: integer("attachment_bytes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("messages_conversation_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export const screenings = pgTable(
  "screenings",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    conversationId: varchar("conversation_id", { length: 32 })
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    jobDescription: text("job_description").notNull(),
    cv: text("cv").notNull(),
    result: jsonb("result").$type<ScreeningResult>().notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    latencyMs: integer("latency_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [index("screenings_conversation_idx").on(table.conversationId)],
);

/**
 * Public share links. One row per shared screening (UNIQUE on screeningId).
 * Slug is base32 of 16 random bytes — 128 bits, unguessable. Cascade delete
 * means a deleted screening drops its share link too — no dangling slugs.
 */
export const shareLinks = pgTable("share_links", {
  slug: varchar("slug", { length: 32 }).primaryKey(),
  screeningId: varchar("screening_id", { length: 32 })
    .notNull()
    .unique()
    .references(() => screenings.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

/**
 * Singleton settings row. The whole app reads `app_settings.id = 'singleton'`
 * for runtime AI knobs (model, timeout, retries, temperature). Migration
 * 0003 seeds the row with safe defaults so the app boots before anyone opens
 * the settings modal. Single-tenant by design — see CHANGELOG and README.
 */
export const appSettings = pgTable("app_settings", {
  id: varchar("id", { length: 16 }).primaryKey(),
  model: varchar("model", { length: 128 }).notNull(),
  timeoutMs: integer("timeout_ms").notNull(),
  maxRetries: integer("max_retries").notNull(),
  temperature: real("temperature").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Screening = typeof screenings.$inferSelect;
export type NewScreening = typeof screenings.$inferInsert;
export type ShareLink = typeof shareLinks.$inferSelect;
export type NewShareLink = typeof shareLinks.$inferInsert;
export type AppSettings = typeof appSettings.$inferSelect;
export type NewAppSettings = typeof appSettings.$inferInsert;
