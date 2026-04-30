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
  const html = await codeToHtml(code, {
    lang,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });

  return (
    <figure className="my-5">
      {label ? (
        <figcaption className="text-fg-subtle mb-2 font-mono text-[12px]">
          {label}
        </figcaption>
      ) : null}
      <div
        // The Shiki output is structured HTML. Background + padding overridden
        // via the `walkthrough-shiki` class in globals.css to match design tokens.
        className="walkthrough-shiki border-border overflow-x-auto rounded-lg border"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </figure>
  );
}
