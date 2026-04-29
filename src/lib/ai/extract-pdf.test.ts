import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractPdfText } from "./extract-pdf";

const FIXTURES = path.resolve(__dirname, "../../../fixtures");

describe("extractPdfText", () => {
  it("extracts text from a real PDF fixture", async () => {
    const buf = await readFile(path.join(FIXTURES, "job-description.pdf"));
    const text = await extractPdfText(buf);
    expect(text.length).toBeGreaterThan(100);
    // Sanity: this fixture is the Senior Backend Engineer JD.
    expect(text.toLowerCase()).toMatch(/backend|node\.?js|postgres/);
  });

  it("trims surrounding whitespace from extracted text", async () => {
    const buf = await readFile(path.join(FIXTURES, "cv-strong-match.pdf"));
    const text = await extractPdfText(buf);
    expect(text).toBe(text.trim());
  });

  it("accepts both ArrayBuffer and Uint8Array inputs", async () => {
    const buf = await readFile(path.join(FIXTURES, "cv-strong-match.pdf"));
    const fromUint8 = await extractPdfText(new Uint8Array(buf));
    const fromArrayBuffer = await extractPdfText(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );
    expect(fromUint8).toBe(fromArrayBuffer);
  });
});
