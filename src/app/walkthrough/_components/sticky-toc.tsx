"use client";

import { useEffect, useState } from "react";

interface StickyTocProps {
  sections: ReadonlyArray<{ id: string; label: string }>;
}

/**
 * Right-rail TOC on desktop (>=1024px). Below 1024px, collapses to a
 * <details> element pinned at the top of the page (DESIGN.md's laptop
 * breakpoint where the workspace sidebar normally appears).
 *
 * Scroll-spy via IntersectionObserver, threshold 0 with negative top margin
 * so the active section is the one whose heading just crossed the header.
 */
export function StickyToc({ sections }: StickyTocProps) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the first section whose top crossed the viewport top.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        // Trigger when section heading reaches the top 30% of the viewport.
        rootMargin: "0px 0px -70% 0px",
        threshold: 0,
      },
    );

    const elements = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <>
      {/* Mobile: collapsed pinned summary */}
      <details className="border-border bg-bg-elevated sticky top-3 z-10 mb-6 rounded-lg border p-3 lg:hidden">
        <summary className="text-fg flex cursor-pointer items-center justify-between text-[13px] font-medium">
          On this page
          <span aria-hidden className="text-fg-subtle">
            ▾
          </span>
        </summary>
        <ul className="mt-3 flex flex-col gap-1">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-fg-muted hover:text-fg block py-1.5 text-[13px] transition-colors"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </details>

      {/* Desktop: right-rail sticky list */}
      <aside aria-label="On this page" className="hidden lg:block">
        <nav
          className="sticky top-12"
          style={{ maxHeight: "calc(100vh - 64px)" }}
        >
          <div className="text-fg-subtle mb-3 text-[11px] font-medium tracking-[0.06em] uppercase">
            On this page
          </div>
          <ul className="flex flex-col">
            {sections.map((s) => {
              const isActive = activeId === s.id;
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={isActive ? "location" : undefined}
                    className={`block border-l-2 py-1.5 pl-3 text-[13px] transition-colors ${
                      isActive
                        ? "border-l-accent text-fg font-medium"
                        : "text-fg-muted hover:text-fg border-l-transparent"
                    }`}
                  >
                    {s.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}
