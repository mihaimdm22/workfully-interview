import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveDatabaseUrl } from "./connection-string";

const KEYS = ["DATABASE_URL", "STORAGE_DATABASE_URL", "POSTGRES_URL"] as const;

describe("resolveDatabaseUrl", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("prefers DATABASE_URL when set", () => {
    process.env.DATABASE_URL = "postgres://primary";
    process.env.STORAGE_DATABASE_URL = "postgres://storage";
    process.env.POSTGRES_URL = "postgres://legacy";
    expect(resolveDatabaseUrl()).toBe("postgres://primary");
  });

  it("falls back to STORAGE_DATABASE_URL when DATABASE_URL is unset", () => {
    process.env.STORAGE_DATABASE_URL = "postgres://storage";
    process.env.POSTGRES_URL = "postgres://legacy";
    expect(resolveDatabaseUrl()).toBe("postgres://storage");
  });

  it("falls back to POSTGRES_URL last", () => {
    process.env.POSTGRES_URL = "postgres://legacy";
    expect(resolveDatabaseUrl()).toBe("postgres://legacy");
  });

  it("throws a helpful error when nothing is set", () => {
    expect(() => resolveDatabaseUrl()).toThrow(
      /DATABASE_URL.*STORAGE_DATABASE_URL.*POSTGRES_URL/,
    );
  });
});
