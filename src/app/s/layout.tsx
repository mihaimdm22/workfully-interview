/**
 * Bare layout for /s/[slug] — public share routes deliberately bypass the
 * workspace shell so a hiring manager opening a Slack-unfurled link doesn't
 * see the candidate's sidebar or dashboard. Only the root <html><body> chrome
 * applies.
 */
export default function PublicShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh">{children}</div>;
}
