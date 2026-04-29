import "server-only";
import { eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "./client";
import {
  conversations,
  messages,
  screenings,
  type Conversation,
  type Message,
  type NewMessage,
  type NewScreening,
  type Screening,
} from "./schema";
import type { PersistedSnapshot } from "@/lib/fsm/snapshot";

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

export async function updateConversationSnapshot(
  id: string,
  snapshot: PersistedSnapshot,
): Promise<void> {
  const db = getDb();
  await db
    .update(conversations)
    .set({ fsmSnapshot: snapshot, updatedAt: new Date() })
    .where(eq(conversations.id, id));
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
): Promise<void> {
  const db = getDb();
  await db.insert(screenings).values({ id: newId(), ...screening });
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
