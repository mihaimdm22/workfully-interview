import { ImageResponse } from "next/og";
import { getScreeningForShare } from "@/lib/db/repositories";
import { styleFor } from "@/lib/domain/verdict-style";

export const runtime = "nodejs";
export const alt = "Workfully screening verdict";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Geist hosted on Vercel's CDN. Fetched once per warm function instance and
 * cached for the lifetime of the request. Falls back to system fonts if the
 * fetch fails — uglier but still readable.
 */
const FONT_URLS = {
  geist:
    "https://fonts.gstatic.com/s/geist/v3/gyByhwUxId8gMEwYGFU2YYdIFDxX3kU.woff2",
  geistMono:
    "https://fonts.gstatic.com/s/geistmono/v3/or3sQ6P-2sBFQ7m43Up-bBT6PEEC.woff2",
} as const;

async function loadFont(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function ScreeningOg({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const screening = await getScreeningForShare(slug);
  if (!screening) {
    return new ImageResponse(
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "#fafafa",
          color: "#5b5b62",
          fontSize: 32,
        }}
      >
        Verdict not found
      </div>,
      size,
    );
  }

  const { result } = screening;
  const s = styleFor(result.verdict);
  const matched = result.mustHaves.filter((m) => m.matched).length;
  const total = result.mustHaves.length;
  const niceMatched = result.niceToHaves.filter((m) => m.matched).length;
  const niceTotal = result.niceToHaves.length;

  const [geist, geistMono] = await Promise.all([
    loadFont(FONT_URLS.geist),
    loadFont(FONT_URLS.geistMono),
  ]);

  const fonts = [
    ...(geist
      ? [
          {
            name: "Geist",
            data: geist,
            weight: 600 as const,
            style: "normal" as const,
          },
        ]
      : []),
    ...(geistMono
      ? [
          {
            name: "Geist Mono",
            data: geistMono,
            weight: 500 as const,
            style: "normal" as const,
          },
        ]
      : []),
  ];

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "#ffffff",
        fontFamily: "Geist, system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 32px",
          height: 56,
          borderBottom: "1px solid #e5e5e8",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontWeight: 700,
            fontSize: 18,
            color: "#0b0b0c",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 10,
              height: 10,
              background: "#2563eb",
              borderRadius: 3,
            }}
          />
          <span>Workfully · Screening verdict</span>
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Geist Mono, monospace",
            fontSize: 13,
            color: "#8a8a92",
          }}
        >
          workfully.app/s/{slug}
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: 1 }}>
        {/* Left: text */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            padding: "48px 56px",
            flex: 1,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: 999,
              background: s.bg,
              color: s.color,
              fontSize: 14,
              fontWeight: 500,
              border: `1px solid ${s.ring}`,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 6,
                height: 6,
                borderRadius: 999,
                background: s.color,
              }}
            />
            <span>
              {s.label} · {matched} / {total} must-haves
            </span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 56,
              fontWeight: 600,
              letterSpacing: "-0.025em",
              lineHeight: 1.04,
              color: "#0b0b0c",
            }}
          >
            {result.candidateName}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              color: "#5b5b62",
              lineHeight: 1.3,
            }}
          >
            {result.role}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 18,
              color: "#0b0b0c",
              lineHeight: 1.5,
              borderLeft: `3px solid ${s.color}`,
              paddingLeft: 16,
              maxWidth: 560,
            }}
          >
            {result.summary.slice(0, 220)}
          </div>
        </div>

        {/* Right: score */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: 320,
            background: `linear-gradient(135deg, ${s.bg}, transparent 65%), #f1f1f3`,
            borderLeft: "1px solid #e5e5e8",
            gap: 8,
            padding: 32,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 12,
              color: "#8a8a92",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 500,
            }}
          >
            Fit score
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Geist Mono, monospace",
              fontWeight: 600,
              fontSize: 160,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              color: s.color,
            }}
          >
            {result.score}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Geist Mono, monospace",
              fontSize: 22,
              color: "#8a8a92",
            }}
          >
            / 100
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 56px",
          borderTop: "1px solid #e5e5e8",
          fontSize: 14,
          color: "#5b5b62",
          background: "#fafafa",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "#0b0b0c", fontWeight: 500 }}>
            {matched}/{total}
          </span>
          <span>must-haves</span>
          <span style={{ color: "#8a8a92" }}>·</span>
          <span style={{ color: "#0b0b0c", fontWeight: 500 }}>
            {niceMatched}/{niceTotal}
          </span>
          <span>nice-to-haves</span>
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Geist Mono, monospace",
            fontSize: 13,
            color: "#8a8a92",
          }}
        >
          {screening.model} · workfully.app
        </div>
      </div>
    </div>,
    {
      ...size,
      ...(fonts.length > 0 ? { fonts } : {}),
    },
  );
}
