import type { Message } from "@/lib/db/schema";

/**
 * Lightweight markdown-ish renderer for bot replies.
 * Bot prompts are short and authored by us, so we render `**bold**` and `\`code\``
 * inline without pulling a full markdown lib. User messages render as plain text.
 */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function MessageBubble({
  message,
  children,
}: {
  message: Message;
  children?: React.ReactNode;
}) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(70ch,100%)] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "border-border bg-muted/60 rounded-bl-md border"
        }`}
        data-role={message.role}
      >
        <div className="break-words whitespace-pre-wrap">
          {renderInline(message.content)}
        </div>
        {message.attachmentName && (
          <div
            className={`mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
              isUser ? "bg-primary-foreground/15" : "bg-muted-foreground/10"
            }`}
          >
            <span aria-hidden>📎</span>
            <span className="font-mono">{message.attachmentName}</span>
            {message.attachmentBytes != null && (
              <span className="opacity-70">
                {(message.attachmentBytes / 1024).toFixed(0)} KB
              </span>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
