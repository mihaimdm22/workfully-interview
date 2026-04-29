import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Extract plain text from a PDF buffer.
 *
 * `unpdf` is a serverless-friendly fork of pdfjs that works in Node and edge
 * runtimes without native deps. We don't currently OCR scanned PDFs — those
 * come back empty and the caller surfaces "Couldn't read this PDF, please paste".
 */
export async function extractPdfText(
  buffer: ArrayBuffer | Uint8Array,
): Promise<string> {
  // Always materialize a fresh Uint8Array — Node `Buffer` is a Uint8Array
  // subclass but unpdf (pdfjs under the hood) rejects it. `new Uint8Array(x)`
  // copies the bytes into a clean instance.
  const bytes = new Uint8Array(
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer),
  );
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n") : text;
  return merged.trim();
}
