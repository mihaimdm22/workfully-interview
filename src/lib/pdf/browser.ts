import "server-only";
import puppeteer, { type Browser } from "puppeteer-core";

/**
 * Launches a headless Chromium for server-side PDF rendering.
 *
 * Two execution paths:
 *   - **Vercel / Linux serverless** — uses `@sparticuz/chromium`, which
 *     ships a Linux x64 chromium binary tuned for serverless function
 *     bundles (~50MB compressed). Activated whenever `process.env.VERCEL`
 *     is set, or as the fallback when no local Chrome is detectable.
 *   - **Local dev (macOS / Linux desktop)** — uses the system Chrome
 *     binary at the conventional paths. No need to ship a 50MB binary
 *     in the dev bundle.
 *
 * The two are kept behind a single helper so the route handler stays
 * platform-agnostic.
 */

const LOCAL_CHROME_PATHS = [
  // macOS
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  // Linux desktop
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

async function findLocalChrome(): Promise<string | null> {
  // Use stat instead of fs.access so this works in any Node environment.
  const { stat } = await import("node:fs/promises");
  for (const p of LOCAL_CHROME_PATHS) {
    try {
      await stat(p);
      return p;
    } catch {
      /* not this one */
    }
  }
  return null;
}

export async function getBrowser(): Promise<Browser> {
  const isVercel = !!process.env.VERCEL;

  if (!isVercel) {
    const local = await findLocalChrome();
    if (local) {
      return puppeteer.launch({
        executablePath: local,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }
    // Fall through to the bundled chromium below if no local Chrome found.
  }

  // Lazy import keeps the heavy dep out of the dev bundle when not needed.
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}
