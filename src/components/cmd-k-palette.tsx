"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rankMatches } from "@/lib/domain/fuzzy-match";
import { VerdictDot } from "@/components/ui/pill";
import type { Verdict } from "@/lib/domain/verdict-style";

export interface SearchItem {
  id: string;
  candidateName: string;
  role: string;
  summary: string;
  verdict: Verdict;
  score: number;
}

interface CmdKPaletteProps {
  items: SearchItem[];
}

export function CmdKPalette({ items }: CmdKPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function openPalette() {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function closePalette() {
    setOpen(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK =
        (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !e.shiftKey;
      if (isCmdK) {
        e.preventDefault();
        if (document.querySelector("[data-cmdk-open]")) {
          closePalette();
        } else {
          openPalette();
        }
      } else if (e.key === "Escape") {
        closePalette();
      }
    }
    function onClickStub(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("[data-cmdk-input]")) {
        e.preventDefault();
        openPalette();
      }
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickStub);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickStub);
    };
  }, []);

  const matches = useMemo(() => {
    if (!query.trim()) {
      return items.map((item) => ({ item, score: 100 }));
    }
    return rankMatches(query, items, (i) => ({
      primary: i.candidateName,
      secondary: `${i.role} ${i.summary}`,
    }));
  }, [query, items]);

  const safeActive = Math.min(activeIndex, Math.max(0, matches.length - 1));

  function onQueryChange(v: string) {
    setQuery(v);
    setActiveIndex(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = matches[safeActive];
      if (m) {
        router.push(`/screening/${m.item.id}`);
        closePalette();
      }
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search screenings"
      data-cmdk-open
      onClick={(e) => {
        if (e.target === e.currentTarget) closePalette();
      }}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24"
    >
      <div className="border-border bg-bg-elevated shadow-pop w-full max-w-[560px] overflow-hidden rounded-xl border">
        <div className="border-border flex items-center gap-2 border-b px-4 py-3">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
            className="text-fg-subtle"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search candidates, roles, summaries…"
            className="text-fg flex-1 border-0 bg-transparent text-[14px] outline-none"
          />
        </div>
        <ul
          className="max-h-[60vh] list-none overflow-y-auto p-1"
          role="listbox"
        >
          {matches.length === 0 ? (
            <li className="text-fg-subtle px-3 py-4 text-center text-[13px]">
              {items.length === 0 ? (
                <>
                  No screenings yet.{" "}
                  <Link
                    href="/screening/new"
                    className="text-fg-muted underline"
                    onClick={closePalette}
                  >
                    Start one
                  </Link>
                  .
                </>
              ) : (
                <>No matches for &ldquo;{query}&rdquo;.</>
              )}
            </li>
          ) : (
            matches.map(({ item }, i) => (
              <li
                key={item.id}
                role="option"
                aria-selected={i === safeActive}
                data-active={i === safeActive ? "" : undefined}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => {
                  router.push(`/screening/${item.id}`);
                  closePalette();
                }}
                className="data-[active]:bg-muted grid cursor-pointer grid-cols-[12px_1fr_auto] items-center gap-3 rounded-md px-3 py-2"
              >
                <VerdictDot verdict={item.verdict} />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">
                    {item.candidateName}
                  </div>
                  <div className="text-fg-muted truncate text-[12px]">
                    {item.role}
                  </div>
                </div>
                <div className="text-fg-muted font-mono text-[12px] tabular-nums">
                  {item.score}
                </div>
              </li>
            ))
          )}
        </ul>
        <div className="border-border text-fg-subtle flex items-center justify-between border-t px-4 py-2 text-[11px]">
          <span>
            <kbd className="font-mono">↑↓</kbd> navigate ·{" "}
            <kbd className="font-mono">↵</kbd> open ·{" "}
            <kbd className="font-mono">esc</kbd> close
          </span>
          <span>{matches.length} results</span>
        </div>
      </div>
    </div>
  );
}
