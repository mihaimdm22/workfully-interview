/**
 * Bare layout for /walkthrough — the architecture walkthrough lives outside the
 * workspace shell so it reads as a portfolio piece rather than in-product help.
 * Mirrors `src/app/s/layout.tsx`. Fonts, theme, and globals.css come from the
 * root layout.
 */
export default function WalkthroughLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh">{children}</div>;
}
