export function BulletBlock({
  title,
  tone,
  bullets,
}: {
  title: string;
  tone: "success" | "danger";
  bullets: string[];
}) {
  if (bullets.length === 0) return null;
  const toneClass = tone === "success" ? "text-success" : "text-danger";
  return (
    <div>
      <div
        className={`mb-3 text-[11px] font-medium tracking-[0.06em] uppercase ${toneClass}`}
      >
        {title}
      </div>
      <ul className="flex flex-col gap-2">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-[14px]">
            <span aria-hidden className={`-mt-px ${toneClass}`}>
              •
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
