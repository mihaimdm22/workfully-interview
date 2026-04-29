/**
 * Intent classifier.
 *
 * Maps free-form user text to FSM events. Pure function, no AI call — the FSM is the
 * source of truth for what's allowed, this just translates English/slash-commands into
 * machine vocabulary. If we later wanted an LLM router, the FSM contract wouldn't change.
 */

type Intent =
  | { kind: "startScreening" }
  | { kind: "startJobBuilder" }
  | { kind: "cancel" }
  | { kind: "reset" }
  | { kind: "content"; text: string };

const SCREEN_PATTERNS = [
  /^\s*\/screen\b/i,
  /screen(?:ing)?\s+(?:a\s+)?candidate/i,
  /evaluate\s+(?:a\s+)?candidate/i,
  /^\s*screen\b/i,
];

const JOB_PATTERNS = [
  /^\s*\/newjob\b/i,
  /create\s+(?:a\s+)?job(?:\s+description)?/i,
  /build\s+(?:a\s+)?(?:job|jd)/i,
  /^\s*new\s+job\b/i,
];

const CANCEL_PATTERNS = [
  /^\s*\/cancel\b/i,
  /^\s*cancel\s*$/i,
  /^\s*stop\s*$/i,
  /^\s*abort\s*$/i,
];

const RESET_PATTERNS = [
  /^\s*\/reset\b/i,
  /^\s*\/done\b/i,
  /^\s*start\s+over\s*$/i,
];

export function classifyIntent(input: string): Intent {
  const text = input.trim();
  if (!text) return { kind: "content", text: "" };

  if (CANCEL_PATTERNS.some((re) => re.test(text))) return { kind: "cancel" };
  if (RESET_PATTERNS.some((re) => re.test(text))) return { kind: "reset" };
  if (SCREEN_PATTERNS.some((re) => re.test(text)))
    return { kind: "startScreening" };
  if (JOB_PATTERNS.some((re) => re.test(text)))
    return { kind: "startJobBuilder" };

  return { kind: "content", text };
}
