import { Section } from "./section";

const TOOLING: { concern: string; tool: string }[] = [
  { concern: "Formatter", tool: "Prettier 3 + prettier-plugin-tailwindcss" },
  { concern: "Linter", tool: "ESLint 9 (eslint-config-next + TS)" },
  {
    concern: "Type checker",
    tool: "TypeScript 6 strict + noUncheckedIndexedAccess",
  },
  { concern: "Dead code", tool: "Knip (unused files / exports / deps)" },
  { concern: "Pre-commit", tool: "Husky 9 → lint-staged" },
  {
    concern: "Commit-msg",
    tool: "Husky 9 → commitlint (Conventional Commits, scope-enum)",
  },
  { concern: "Security", tool: "GitHub CodeQL + pnpm audit --prod" },
  { concern: "Workflow lint", tool: "actionlint (Docker)" },
  { concern: "Stale PRs", tool: "actions/stale@v10" },
  {
    concern: "Dep upgrades",
    tool: "Dependabot (npm + actions, weekly, grouped)",
  },
  { concern: "Coverage", tool: "Vitest + @vitest/coverage-v8 (hard floors)" },
];

const CI_JOBS = [
  "lint+typecheck",
  "test+coverage",
  "build",
  "e2e (Playwright + real Postgres service container)",
  "audit (high-severity prod CVEs)",
];

export function ToolingSection({ id }: { id: string }) {
  return (
    <Section
      id={id}
      eyebrow="Tooling"
      title="Every PR runs through this gate."
      lead="Most of this is what I bring to every project I work on. It's the floor I refuse to ship below."
    >
      <div className="border-border bg-bg-elevated my-6 overflow-hidden rounded-xl border">
        <table className="w-full text-[14px]">
          <thead className="border-border bg-muted text-fg-subtle border-b">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.06em] uppercase">
                Concern
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.06em] uppercase">
                Tool
              </th>
            </tr>
          </thead>
          <tbody>
            {TOOLING.map((row) => (
              <tr
                key={row.concern}
                className="border-border border-b last:border-b-0"
              >
                <td className="text-fg-muted px-4 py-3">{row.concern}</td>
                <td className="text-fg px-4 py-3 font-mono text-[13px]">
                  {row.tool}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-fg-muted mt-6 max-w-[64ch] text-[15px] leading-relaxed">
        Five-job CI on every push:
      </p>
      <ul className="text-fg my-4 grid gap-2 text-[14px] leading-relaxed">
        {CI_JOBS.map((job) => (
          <li key={job} className="flex gap-3">
            <span aria-hidden className="text-accent">
              ✓
            </span>
            <span>{job}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
