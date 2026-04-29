import { ensureConversation } from "./actions";
import { listMessages } from "@/lib/db/repositories";
import { loadConversation } from "@/lib/fsm/orchestrator";
import { MessageBubble } from "@/components/message-bubble";
import { ScreeningResultCard } from "@/components/screening-result-card";
import { StatePill } from "@/components/state-pill";
import { Composer } from "@/components/composer";
import { ResetButton } from "@/components/quick-actions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const conversationId = await ensureConversation();
  const [messages, loaded] = await Promise.all([
    listMessages(conversationId),
    loadConversation(conversationId),
  ]);
  const stateValue = loaded?.state ?? "idle";
  const result = loaded?.context.result;

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
          <StatePill value={stateValue} />
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
          messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            const showResult =
              isLast && m.role === "bot" && result !== undefined;
            return (
              <MessageBubble key={m.id} message={m}>
                {showResult && (
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
