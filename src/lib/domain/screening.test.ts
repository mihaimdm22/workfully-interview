import { describe, it, expect } from "vitest";
import { z } from "zod";
import { screeningResultSchema } from "./screening";

/**
 * Provider-portability regression tests.
 *
 * Anthropic's structured-output API (called via OpenRouter) rejects requests
 * whose JSON schema carries `minimum`/`maximum` on `integer`/`number` types
 * with `"output_config.format.schema: For 'integer' type, properties maximum,
 * minimum are not supported"`. OpenAI/Azure strict mode rejects the same
 * keywords plus `minLength`/`maxLength` and `minItems`/`maxItems`.
 *
 * The screening schema therefore must not emit those keywords. The `score`
 * field in particular cannot use `z.number().int()` because Zod 4 silently
 * injects `Number.MIN_SAFE_INTEGER` / `Number.MAX_SAFE_INTEGER` bounds for
 * any integer type — which is the exact reproducer that took down prod after
 * the haiku-4.5 default landed (logged at ~6s as `AI_APICallError` but
 * surfaced to users 120s later as the FSM timeout).
 *
 * If you find yourself wanting to add a `min`/`max` to this schema, push the
 * constraint into `.describe()` text and the SYSTEM_PROMPT rubric instead.
 */
describe("screeningResultSchema JSON schema is provider-portable", () => {
  const jsonSchema = JSON.parse(
    JSON.stringify(z.toJSONSchema(screeningResultSchema)),
  ) as {
    properties: Record<string, { type?: string }>;
  };
  const flat = JSON.stringify(jsonSchema);

  it("does not include any forbidden bounds keywords anywhere in the schema", () => {
    for (const forbidden of [
      "minimum",
      "maximum",
      "exclusiveMinimum",
      "exclusiveMaximum",
      "minLength",
      "maxLength",
      "minItems",
      "maxItems",
    ]) {
      expect(
        flat,
        `Forbidden keyword "${forbidden}" leaked into the JSON schema`,
      ).not.toContain(`"${forbidden}"`);
    }
  });

  it("emits score as type:number (not integer — Zod 4 auto-injects min/max for integers)", () => {
    expect(jsonSchema.properties.score?.type).toBe("number");
  });
});
