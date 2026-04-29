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
  const [messages, screenings, loaded] = await Promise.all([
    listMessages(conversationId),
    listScreenings(conversationId),
    loadConversation(conversationId),
  ]);
  const stateValue = loaded?.state ?? "idle";
  const stateContext = loaded?.context;
  const resultByMessageId = pairScreeningsToMessages(messages, screenings);

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
