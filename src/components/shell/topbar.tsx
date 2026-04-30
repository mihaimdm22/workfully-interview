import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

interface Crumb {
  label: string;
  href?: string;
}

interface TopbarProps {
  crumbs: Crumb[];
  /** Right-side trailing slot — typically actions like Share / + New screening. */
  trailing?: React.ReactNode;
  /** When true, renders a centered command-K search input. Defaults to true on the dashboard. */
  showSearch?: boolean;
}

export function Topbar({ crumbs, trailing, showSearch = true }: TopbarProps) {
  return (
    <header
      data-search={showSearch ? "" : undefined}
      className="h-header border-border bg-bg sticky top-0 z-10 grid grid-cols-[1fr_auto] items-center gap-4 border-b px-6 data-[search]:grid-cols-[1fr_minmax(280px,480px)_1fr]"
    >
      <Breadcrumbs crumbs={crumbs} />
      {showSearch ? <CommandKInput /> : null}
      <div className="flex items-center justify-end gap-2">
        {trailing}
        <AboutLink />
        <ThemeToggle />
      </div>
    </header>
  );
}

function AboutLink() {
  return (
    <Link
      href="/walkthrough"
      className="text-fg-muted hover:text-fg hover:bg-muted hidden h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] whitespace-nowrap transition-colors lg:inline-flex"
      aria-label="Read the architecture walkthrough"
    >
      <span aria-hidden className="bg-accent size-1.5 rounded-[2px]" />
      About this project
    </Link>
  );
}

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="text-fg-muted flex min-w-0 items-center gap-2 truncate text-[14px]"
    >
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="flex items-center gap-2">
            {i > 0 && (
              <span aria-hidden className="text-fg-subtle">
                /
              </span>
            )}
            {c.href && !isLast ? (
              <Link href={c.href} className="hover:text-fg transition-colors">
                {c.label}
              </Link>
            ) : (
              <span
                className={isLast ? "text-fg truncate font-medium" : undefined}
              >
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function CommandKInput() {
  // Static placeholder — the real CmdKPalette mounts in the workspace layout
  // and intercepts mousedown / ⌘K.
  return (
    <label className="border-border bg-muted text-fg-muted flex h-[34px] items-center gap-2 rounded-xl border px-3 text-[14px]">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="text-fg-subtle"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="search"
        placeholder="Search screenings, candidates, roles…"
        className="text-fg flex-1 border-0 bg-transparent text-[14px] outline-none"
        data-cmdk-input
      />
      <kbd className="border-border bg-bg text-fg-muted rounded border px-1.5 py-0.5 font-mono text-[11px]">
        ⌘K
      </kbd>
    </label>
  );
}
