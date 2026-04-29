"use client";

import { useState } from "react";
import { IconButton } from "@/components/ui/icon-button";

type Theme = "light" | "dark";

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return "light";
}

export function ThemeToggle() {
  // Lazy initializer reads data-theme set by the head script during SSR. This
  // keeps the initial render in sync with the actual painted theme without an
  // effect. The initializer runs on the client only.
  const [theme, setTheme] = useState<Theme>(readTheme);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* localStorage may be blocked; keep working in-memory */
    }
  }

  const label =
    theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  // The icon swap depends on a value (`data-theme` from the inline script)
  // that the server doesn't see. Suppress the hydration warning on the SVG
  // wrapper — the button shape and aria-label stay stable, only the icon
  // path differs between SSR (light default) and client (actual theme).
  return (
    <IconButton aria-label={label} onClick={toggle} title={label}>
      <span suppressHydrationWarning className="contents">
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </span>
    </IconButton>
  );
}

function MoonIcon() {
  return (
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
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
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
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
