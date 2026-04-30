import "server-only";
import { codeToHtml } from "shiki";

interface CodeBlockProps {
  code: string;
  lang: "ts" | "tsx" | "bash" | "json" | "sql";
  /** Small label rendered above the block — usually the file path. */
  label?: string;
}

/**
 * Server-rendered Shiki code block. Themed against design tokens — both
 * github-light and github-dark are emitted; CSS swaps via [data-theme="dark"].
 *
 * Background overridden to `var(--muted)` to match the inline-code surface
 * defined in DESIGN.md.
 */
export async function CodeBlock({ code, lang, label }: CodeBlockProps) {
  // Shiki throws on unknown lang or rare parse errors; fall back to a plain
  // <pre> so a future bad snippet doesn't break the entire /walkthrough build.
  // The `code` prop must be developer-authored — never user input — because
  // dangerouslySetInnerHTML below trusts Shiki's escaping.
  let html: string | null = null;
  try {
    html = await codeToHtml(code, {
      lang,
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
    });
  } catch {
    html = null;
  }

  return (
    <figure className="my-5">
      {label ? (
        <figcaption className="text-fg-subtle mb-2 font-mono text-[12px]">
          {label}
        </figcaption>
      ) : null}
      {html ? (
        <div
          className="walkthrough-shiki border-border overflow-x-auto rounded-lg border"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="bg-muted border-border text-fg overflow-x-auto rounded-lg border p-4 font-mono text-[13px] leading-[1.55]">
          {code}
        </pre>
      )}
    </figure>
  );
}
