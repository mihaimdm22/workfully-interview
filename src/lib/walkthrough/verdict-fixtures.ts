import type { ScreeningResult } from "@/lib/domain/screening";

/**
 * Three sample verdicts used by the /walkthrough verdict gallery.
 *
 * These intentionally mirror the shape of the fixtures CI runs against
 * (`fixtures/cv-strong-match.pdf` etc.) so the gallery shows verdicts a
 * recruiter would actually see in the running app, not synthetic test data.
 *
 * Hardcoded (rather than DB-backed) so /walkthrough has zero data deps —
 * the page is shareable and renderable on any deploy.
 */
export const WALKTHROUGH_VERDICTS: ScreeningResult[] = [
  {
    candidateName: "Priya Bhattacharya",
    role: "Senior Backend Engineer",
    verdict: "strong",
    score: 92,
    summary:
      "Eight years building Postgres-heavy distributed systems and a track record of leading API platform work — directly aligned with what the role asks for.",
    mustHaves: [
      {
        requirement: "5+ years backend engineering",
        matched: true,
        evidence:
          "8 years at Stripe and Shopify, both backend-focused roles per the CV.",
      },
      {
        requirement: "Production Postgres experience",
        matched: true,
        evidence:
          "Owned the merchant-payouts Postgres cluster for 3 years; led one major migration.",
      },
      {
        requirement: "Strong async / distributed systems",
        matched: true,
        evidence: "Designed the order-fulfillment saga for ~$3B/yr GMV.",
      },
      {
        requirement: "Mentorship of mid-level engineers",
        matched: true,
        evidence: "Tech lead for a 6-person backend team at Shopify.",
      },
    ],
    niceToHaves: [
      {
        requirement: "Open source contributions",
        matched: true,
        evidence: "Maintainer of `pg-bulk-loader`, 1.2k stars.",
      },
      {
        requirement: "Public speaking",
        matched: false,
      },
    ],
    strengths: [
      "Owned a multi-billion-dollar payments codepath end to end",
      "Comfortable with both DB internals and developer-API design",
      "Has shipped production migrations under time pressure",
    ],
    gaps: [
      "No explicit Kafka or queue experience listed; we use Kafka heavily",
      "Most recent role was IC; we want a tech-lead presence on day one",
    ],
    recommendation:
      "Strong yes for a final round. Frame the Kafka gap as a calibration question, not a blocker — the systems thinking transfers cleanly.",
  },
  {
    candidateName: "Marco Lindholm",
    role: "Senior Backend Engineer",
    verdict: "moderate",
    score: 68,
    summary:
      "Solid backend fundamentals and clear ownership of one production system, but the experience is heavier on Node.js services than the Postgres-centric work the role calls for.",
    mustHaves: [
      {
        requirement: "5+ years backend engineering",
        matched: true,
        evidence: "6 years across two companies, both backend-focused.",
      },
      {
        requirement: "Production Postgres experience",
        matched: true,
        evidence:
          "Used Postgres at both companies, but most recent role moved to DynamoDB.",
      },
      {
        requirement: "Strong async / distributed systems",
        matched: false,
        evidence:
          "Async work limited to per-request background jobs; no saga or queue-based architecture mentioned.",
      },
      {
        requirement: "Mentorship of mid-level engineers",
        matched: true,
        evidence: "Mentored two junior engineers as a senior at last role.",
      },
    ],
    niceToHaves: [],
    strengths: [
      "Strong CRUD + REST API delivery track record",
      "Has worked across the full request path including auth and observability",
    ],
    gaps: [
      "Light on distributed systems; this is core to the role",
      "No tech-lead title yet, even informally",
    ],
    recommendation:
      "Moderate — worth a technical screen focused on distributed systems judgment. If they handle a saga design well, advance.",
  },
  {
    candidateName: "Júlia Almeida",
    role: "Senior Backend Engineer",
    verdict: "wrong_role",
    score: 18,
    summary:
      "Strong product designer with 7 years of experience leading design systems work — interesting profile, but not what this role is for.",
    mustHaves: [
      {
        requirement: "5+ years backend engineering",
        matched: false,
        evidence: "All listed experience is in product/UX design.",
      },
      {
        requirement: "Production Postgres experience",
        matched: false,
      },
    ],
    niceToHaves: [],
    strengths: [
      "Strong design-systems work at two B2B SaaS companies",
      "Has shipped customer-facing features end to end",
    ],
    gaps: ["No backend engineering experience on the CV"],
    recommendation:
      "Wrong role for this opening. Worth keeping in the network if a Senior Product Designer slot opens — strong portfolio.",
  },
];
