# Workfully — Design System

The visual contract for Workfully Screening Bot. When this file disagrees with
`src/app/globals.css`, **this file wins** — fix the CSS.

The reference mockups in `.context/mockups/` are the visual source of truth for
how these tokens compose into screens.

## Principles

1. **Subtraction default.** If a UI element doesn't earn its pixels, cut it.
2. **Restraint reads as senior.** Mono numerics, neutral surfaces, one accent.
3. **Border-1px is the default elevation.** Drop shadows only on lifted artifacts (the OG share card).
4. **Cards earn their existence.** No decorative card grids. A card has a job.
5. **Color is semantic, never decorative.** Green = strong, blue = moderate, amber = weak, red = wrong-role. The same color cascade lives in pills, tinted backgrounds, score numerics, and OG card right rails.

## Tokens

All tokens are CSS variables on `:root`. See `src/app/globals.css` for the runtime values.

### Color

| Token             | Light     | Dark      | Use                                                                     |
| ----------------- | --------- | --------- | ----------------------------------------------------------------------- |
| `--bg`            | `#fafafa` | `#0a0a0b` | Page background                                                         |
| `--bg-elevated`   | `#ffffff` | `#131316` | Cards, modals, the share-card frame                                     |
| `--fg`            | `#0b0b0c` | `#f5f5f7` | Body text, headings                                                     |
| `--fg-muted`      | `#5b5b62` | `#a1a1aa` | Secondary text (≥14px). Passes AA on `--bg`                             |
| `--fg-subtle`     | `#8a8a92` | `#71717a` | Tertiary text. **AA-large only — must be ≥18px or non-text decoration** |
| `--muted`         | `#f1f1f3` | `#18181b` | Subtle backgrounds (search input, recommendation block)                 |
| `--muted-2`       | `#e9e9ed` | `#1f1f23` | Hover-tier surface                                                      |
| `--border`        | `#e5e5e8` | `#27272a` | Default 1px border                                                      |
| `--border-strong` | `#d4d4d8` | `#3f3f46` | Hover-state border                                                      |
| `--primary`       | `#0a0a0a` | `#f5f5f7` | Solid CTAs                                                              |
| `--primary-fg`    | `#ffffff` | `#0a0a0b` | Text on solid CTAs                                                      |
| `--accent`        | `#2563eb` | `#60a5fa` | Single accent — moderate verdict, focus rings, brand dot                |
| `--success`       | `#15803d` | `#4ade80` | Strong verdict                                                          |
| `--warning`       | `#b45309` | `#facc15` | Weak verdict                                                            |
| `--danger`        | `#b91c1c` | `#f87171` | Wrong-role verdict, error states                                        |

Each semantic has a `-bg` (10% alpha) and `-ring` (30% alpha) variant for
tinted pills and rings. Example: `--success-bg: #15803d1a`, `--success-ring: #15803d4d`.

**Forbidden:** purple/violet/indigo as primary or accent. system-ui as the
display or body font. Decorative gradients on flat surfaces. Drop shadows on
default cards.

### Type

| Token            | Size     | Line height | Use                                              |
| ---------------- | -------- | ----------- | ------------------------------------------------ |
| `--text-xs`      | 11px     | 1.35        | UPPERCASE LABELS, kbd hints                      |
| `--text-sm`      | 12px     | 1.35        | Meta, footer, mono score in sidebar              |
| `--text-base`    | 13px     | 1.5         | Body small, card meta                            |
| `--text-md`      | 14px     | 1.5         | Body — default                                   |
| `--text-lg`      | 15–16px  | 1.4         | Body large, card titles                          |
| `--text-xl`      | 18px     | 1.3         | Section headings                                 |
| `--text-2xl`     | 22px     | 1.2         | Page titles                                      |
| `--text-display` | 28px     | 1.0         | Score numerics on cards                          |
| `--text-hero`    | 36px     | 1.0         | Verdict score on detail page                     |
| (OG)             | 56–160px | 1.0         | OG card name + score (rendered via `@vercel/og`) |

**Fonts:** `Geist` for UI, `Geist Mono` for numerics, score, kbd, URL hints,
state pills. Tabular-nums on every number. Font-feature-settings: `"ss01", "cv11"` for stylistic alternates.

### Spacing — 4px base

`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64`. Tokens: `--s-1` through `--s-16`.

### Radii

| Token      | Value | Use                                    |
| ---------- | ----- | -------------------------------------- |
| `--r-sm`   | 6px   | kbd, pill-dot containers               |
| `--r-md`   | 8px   | Inputs, sidebar rows, icon-buttons     |
| `--r-lg`   | 12px  | Buttons, search input, share-row       |
| `--r-xl`   | 16px  | Cards, recommendation block, log block |
| `--r-2xl`  | 20px  | Share-card outer frame                 |
| `--r-pill` | 999px | Pills, avatars, dots                   |

### Layout

| Token           | Value                                                            |
| --------------- | ---------------------------------------------------------------- |
| `--sidebar-w`   | 256px                                                            |
| `--header-h`    | 56px                                                             |
| `--content-max` | 1200px (dashboard), 920px (screening detail), 720px (share page) |

### Shadow (sparingly)

`--shadow-pop: 0 1px 2px rgb(0 0 0 / 4%), 0 4px 16px rgb(0 0 0 / 6%)`. Used
**only** on the OG share-card frame. Default cards = 1px border, no shadow.

## Components

| Component                           | Token primitives                          | Where it lives                                                                 |
| ----------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| `<Pill verdict>`                    | `-bg`, `-ring`, semantic color            | sidebar dot, dashboard card, screening header, OG card                         |
| `<ScoreDisplay value size verdict>` | mono, tabular-nums, semantic color        | sidebar row (sm), dashboard card (md), screening header (hero), OG card (hero) |
| `<RequirementList>`                 | `--success-bg`, `--danger-bg`, mono check | screening detail, share page                                                   |
| `<BulletBlock tone>`                | semantic color on `::before` bullet       | screening detail, share page                                                   |
| `<Recommendation>`                  | `--muted`, `--border`                     | screening detail (writeable), share page (read-only)                           |
| `<ShareRow>`                        | `--border`, `--font-mono`                 | screening detail only                                                          |
| `<Sidebar>`                         | layout tokens, `--font-sans`              | workspace shell                                                                |
| `<Topbar>`                          | layout tokens, `--muted` (search)         | workspace shell, screening detail                                              |
| `<ThemeToggle>`                     | `--border`, `--fg-muted`                  | topbar                                                                         |

## Responsive breakpoints

- `< 640px` — phone. Sidebar disappears, top-bar shows brand + hamburger + avatar. Dashboard grid 1 col. Touch targets ≥ 40px.
- `640–1024px` — tablet. Sidebar slides over content as overlay (toggle). Grid 1 col.
- `1024–1280px` — laptop. Sidebar visible (256px). Grid 2 cols.
- `> 1280px` — desktop. Grid 3 cols.

## A11y rules (non-negotiable)

- Every interactive element is `<button>` or `<a>`.
- `aria-current="page"` on active sidebar row.
- `aria-live="polite"` on the verdict region; `aria-busy="true"` while evaluating.
- Color-coded info always has a non-color signifier (the word "Strong match" beside the green dot; ✓/✕ beside the green/red ring on requirements).
- Touch targets ≥ 40px on mobile.
- `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }` — never `outline: none` without a replacement.
- `--fg-subtle` is **not allowed** on text < 18px.
- Visited links must keep a different color (`a:visited`) — do not flatten.
- Headings are visually closer to the section they introduce than to the preceding section.

## Motion

- Default transitions: 120ms `ease`. Hover/focus.
- Verdict-landed celebration: 250ms scale-in (`scale(0.96) → scale(1)`) + a single tint flash. Pure CSS.
- Streaming verdict row reveals: 250ms fade-in (`@keyframes`).
- **Forbidden:** `framer-motion` or any motion library. Pure CSS.
- Respect `prefers-reduced-motion: reduce` — disable transforms, keep opacity transitions.

## Theme

- Default: `prefers-color-scheme`.
- Manual override via `<ThemeToggle>`, persisted in `localStorage.theme = "light" | "dark"`.
- CSS switches off `[data-theme="dark"]` set on `<html>` so the toggle wins.
