import { NextRequest } from "next/server";
import { getScreeningForShare } from "@/lib/db/repositories";
import { getBrowser } from "@/lib/pdf/browser";

export const dynamic = "force-dynamic";
// Chromium needs the headroom: a cold launch + page render typically lands
// in 3–8s on Vercel Fluid Compute. Bump max duration so a slow first-call
// doesn't 504. Memory bump (1 GB) lives in vercel.json since segment config
// can't set it.
export const maxDuration = 30;

/**
 * Server-side PDF download for a public share link.
 *
 * Flow:
 *   1. Resolve slug → screening (404 early if missing).
 *   2. Spin up a headless Chromium via the @sparticuz/chromium-or-local-Chrome
 *      helper.
 *   3. Navigate the browser to `/s/<slug>/pdf` (the printable HTML route),
 *      passing the original request's cookies and absolute origin so the
 *      headless browser hits the same dev/prod host the user did.
 *   4. `page.pdf()` with A4, ~14mm margins, `printBackground: true` so
 *      verdict-tinted backgrounds and pill colors survive into the PDF.
 *   5. Return the PDF bytes with `Content-Disposition: attachment` so the
 *      browser saves it directly. Filename = `<candidate>-<verdict>.pdf`.
 *
 * Memory + duration are configured in `vercel.ts` since Chromium needs the
 * headroom on a serverless function (1 GB / 30 s).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;

  const screening = await getScreeningForShare(slug);
  if (!screening) {
    return new Response("Verdict not found", { status: 404 });
  }

  const origin = req.nextUrl.origin;
  const url = `${origin}/s/${slug}/pdf`;
  const cookieHeader = req.headers.get("cookie") ?? "";

  const browser = await getBrowser();
  try {
    const page = await browser.newPage();

    // Forward cookies so the dev host's conversation cookie reaches the page
    // (the `/s/[slug]/pdf` route doesn't actually need it — getScreeningForShare
    // is public — but forwarding is the right default for any future scoping).
    if (cookieHeader) {
      const cookies = cookieHeader.split(";").map((c) => {
        const [name, ...rest] = c.trim().split("=");
        return {
          name: name!,
          value: rest.join("="),
          url: origin,
        };
      });
      // puppeteer types treat cookies as nominally typed — stay loose.
      await (
        page as unknown as {
          setCookie: (...c: unknown[]) => Promise<void>;
        }
      ).setCookie(...cookies);
    }

    await page.goto(url, { waitUntil: "networkidle0", timeout: 20_000 });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "14mm",
        right: "14mm",
        bottom: "14mm",
        left: "14mm",
      },
    });

    const filename = sanitizeFilename(
      `${screening.result.candidateName}-${screening.result.verdict}.pdf`,
    );

    return new Response(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // Cache the PDF for a week at the edge — same lifecycle as the OG
        // image. The verdict is immutable once created, so this is safe.
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } finally {
    await browser.close().catch(() => {
      /* best-effort cleanup */
    });
  }
}

function sanitizeFilename(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
