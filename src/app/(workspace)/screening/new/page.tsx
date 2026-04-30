import Link from "next/link";
import { ensureConversation } from "@/app/actions";
import { listMessages, listScreenings } from "@/lib/db/repositories";
import { loadConversation } from "@/lib/fsm/orchestrator";
import { pairScreeningsToMessages } from "@/lib/fsm/pair-screenings";
import { StatePill } from "@/components/state-pill";
import { ChatStream } from "@/components/chat-stream";
import { Topbar } from "@/components/shell/topbar";

export const dynamic = "force-dynamic";

export default async function NewScreening() {
  const conversationId = await ensureConversation();
  const [messages, allScreenings, loaded] = await Promise.all([
    listMessages(conversationId),
    listScreenings(conversationId),
    loadConversation(conversationId),
  ]);
  const stateValue = loaded?.state ?? "idle";
  const stateContext = loaded?.context;
  // After "+ New screening" wipes the transcript, prior screenings still
  // exist on the conversation but predate every message in the new session.
  // Without this filter pairScreeningsToMessages would stamp the OLD verdict
  // card onto the freshly-appended bot greeting because it walks scrIdx
  // forward from the start. Scope to verdicts produced at-or-after the first
  // message in the current transcript so historical cards stay in the
  // sidebar (where they belong) and out of the active chat.
  const sessionStart = messages[0]?.createdAt;
  const sessionScreenings = sessionStart
    ? allScreenings.filter((s) => s.createdAt >= sessionStart)
    : allScreenings;
  const resultByMessageId = pairScreeningsToMessages(
    messages,
    sessionScreenings,
  );

  // Plain object for the client component (Map isn't serializable across the
  // server/client boundary in a clean way for our purposes).
  const initialResultByMessageId: Record<
    string,
    NonNullable<ReturnType<typeof resultByMessageId.get>>
  > = {};
  for (const [id, result] of resultByMessageId) {
    initialResultByMessageId[id] = result;
  }

  return (
    <>
      <Topbar
        crumbs={[
          { label: "Screenings", href: "/" },
          { label: "New screening" },
        ]}
        showSearch={false}
        trailing={
          <>
            <StatePill value={stateValue} context={stateContext} />
            <Link
              href="/"
              className="text-fg-muted text-[13px] underline-offset-2 hover:underline"
            >
              Back to dashboard
            </Link>
          </>
        }
      />
      <ChatStream
        initialMessages={messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          attachmentName: m.attachmentName,
          attachmentBytes: m.attachmentBytes,
        }))}
        initialResultByMessageId={initialResultByMessageId}
      />
    </>
  );
}
