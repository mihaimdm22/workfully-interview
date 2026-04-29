import { ensureConversation } from "./actions";
import { listMessages, listScreenings } from "@/lib/db/repositories";
import { loadConversation } from "@/lib/fsm/orchestrator";
import { pairScreeningsToMessages } from "@/lib/fsm/pair-screenings";
import { MessageBubble } from "@/components/message-bubble";
import { ScreeningResultCard } from "@/components/screening-result-card";
import { StatePill } from "@/components/state-pill";
import { Composer } from "@/components/composer";
import { ResetButton } from "@/components/quick-actions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const conversationId = await ensureConversation();
  const [messages, screenings, loaded] = await Promise.all([
    listMessages(conversationId),
    listScreenings(conversationId),
    loadConversation(conversationId),
  ]);
  const stateValue = loaded?.state ?? "idle";
  const stateContext = loaded?.context;
  const resultByMessageId = pairScreeningsToMessages(messages, screenings);

  return (
    <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col">
      <header className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h1 className="font-semibold tracking-tight">
            Workfully Screening Bot
          </h1>
          <p className="text-muted-foreground text-xs">
            FSM-driven candidate screening · XState 5 · Claude Sonnet
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatePill value={stateValue} context={stateContext} />
          <ResetButton />
        </div>
      </header>

      <section
        className="flex-1 space-y-3 overflow-y-auto px-4 py-6"
        aria-live="polite"
        aria-label="Chat transcript"
      >
        {messages.length === 0 ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          messages.map((m) => {
            const result = resultByMessageId.get(m.id);
            return (
              <MessageBubble key={m.id} message={m}>
                {result && (
                  <div className="mt-3">
                    <ScreeningResultCard result={result} />
                  </div>
                )}
              </MessageBubble>
            );
          })
        )}
      </section>

      <Composer />
    </main>
  );
}
