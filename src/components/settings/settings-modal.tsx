"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import {
  TIMEOUT_MS_MIN,
  TIMEOUT_MS_MAX,
  MAX_RETRIES_MIN,
  MAX_RETRIES_MAX,
  TEMPERATURE_MIN,
  TEMPERATURE_MAX,
  type AppSettingsValue,
  type ModelOption,
} from "@/lib/domain/settings";
import type { ListModelsSource } from "@/lib/ai/openrouter-models";

interface ModelsPayload {
  models: ModelOption[];
  source: ListModelsSource;
}

interface SettingsModalProps {
  initialSettings: AppSettingsValue;
  onClose: () => void;
  loadModels: () => Promise<ModelsPayload>;
  saveSettings: (
    next: AppSettingsValue,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}

/**
 * Settings modal — model picker + timeout / retries / temperature sliders.
 *
 * Mounted only when open (the launcher conditionally renders it), so draft
 * state resets on every open via the `useState` initializer. No
 * setState-in-effect dance. Loads the OpenRouter model list lazily on first
 * mount via the server action so page renders don't pay for the external
 * fetch. Keeps the form ephemeral — Save is the single commit point.
 * Mobile collapses to a bottom sheet, matching DESIGN.md's responsive
 * contract.
 */
export function SettingsModal({
  initialSettings,
  onClose,
  loadModels,
  saveSettings,
}: SettingsModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<AppSettingsValue>(initialSettings);
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [modelsSource, setModelsSource] = useState<ListModelsSource | null>(
    null,
  );
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  // Lazy-load the model list on mount. Fire-and-forget; the form is usable
  // for the other three knobs even if the fetch is slow.
  useEffect(() => {
    let cancelled = false;
    loadModels()
      .then((payload) => {
        if (cancelled) return;
        setModels(payload.models);
        setModelsSource(payload.source);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setModelsError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [loadModels]);

  // Focus the dialog on mount and trap escape to close.
  useEffect(() => {
    dialogRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    startSave(async () => {
      const result = await saveSettings(draft);
      if (result.ok) {
        onClose();
      } else {
        setSaveError(result.error);
      }
    });
  }

  const modelList = models ?? [];
  const isModelKnown = modelList.some((m) => m.id === draft.model);

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:pt-24"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="border-border bg-bg-elevated shadow-pop w-full max-w-[520px] overflow-hidden rounded-t-2xl border outline-none sm:rounded-xl"
      >
        <header className="border-border flex items-center justify-between border-b px-5 py-4">
          <h2 id={titleId} className="text-fg text-[15px] font-medium">
            AI settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="text-fg-muted hover:text-fg -mr-1 inline-flex size-8 items-center justify-center rounded-md transition-colors"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <form onSubmit={onSubmit}>
          <div className="flex flex-col gap-5 px-5 py-5">
            <Field
              label="Model"
              hint={
                modelsError
                  ? "Live list unavailable, showing curated set"
                  : modelsSource === "fallback"
                    ? "Showing curated fallback list"
                    : modelsSource === "live"
                      ? "Live from OpenRouter"
                      : modelsSource === "cache"
                        ? "Cached from OpenRouter"
                        : null
              }
            >
              {models === null && !modelsError ? (
                <div
                  aria-busy="true"
                  className="border-border bg-muted h-[36px] w-full animate-pulse rounded-md border"
                />
              ) : (
                <select
                  value={draft.model}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, model: e.target.value }))
                  }
                  className="border-border bg-bg text-fg h-[36px] w-full rounded-md border px-2 text-[14px] outline-none focus:border-[var(--accent)]"
                >
                  {!isModelKnown ? (
                    <option value={draft.model}>{draft.model} (current)</option>
                  ) : null}
                  {modelList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} — {m.hint}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Slider
              label="Timeout"
              value={draft.timeoutMs}
              min={TIMEOUT_MS_MIN}
              max={TIMEOUT_MS_MAX}
              step={5_000}
              format={(v) => `${Math.round(v / 1000)}s`}
              onChange={(v) => setDraft((d) => ({ ...d, timeoutMs: v }))}
            />

            <Slider
              label="Max retries"
              value={draft.maxRetries}
              min={MAX_RETRIES_MIN}
              max={MAX_RETRIES_MAX}
              step={1}
              format={(v) => `${v}`}
              onChange={(v) => setDraft((d) => ({ ...d, maxRetries: v }))}
            />

            <Slider
              label="Temperature"
              value={draft.temperature}
              min={TEMPERATURE_MIN}
              max={TEMPERATURE_MAX}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(v) => setDraft((d) => ({ ...d, temperature: v }))}
            />
          </div>

          {saveError ? (
            <div
              role="alert"
              className="text-danger border-border bg-danger-bg border-t px-5 py-3 text-[13px]"
            >
              {saveError}
            </div>
          ) : null}

          <footer className="border-border bg-muted flex items-center justify-end gap-2 border-t px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="border-border text-fg-muted hover:text-fg hover:border-border-strong h-9 rounded-md border bg-transparent px-3 text-[13px] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="bg-primary text-primary-fg h-9 rounded-md px-4 text-[13px] disabled:opacity-60"
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-fg text-[13px] font-medium">{label}</span>
        {hint ? (
          <span className="text-fg-subtle text-[11px]">{hint}</span>
        ) : null}
      </div>
      {children}
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
          className="bg-muted h-1 flex-1 cursor-pointer appearance-none rounded-full accent-[var(--accent)]"
        />
        <span className="text-fg w-14 text-right font-mono text-[12px] tabular-nums">
          {format(value)}
        </span>
      </div>
    </Field>
  );
}
