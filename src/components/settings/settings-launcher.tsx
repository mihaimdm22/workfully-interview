"use client";

import { useState } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { SettingsModal } from "./settings-modal";
import { loadModelsAction, saveSettingsAction } from "@/app/actions";
import type { AppSettingsValue } from "@/lib/domain/settings";

interface SettingsLauncherProps {
  initialSettings: AppSettingsValue;
}

/**
 * Topbar entry point for the settings modal. Server side fetches the current
 * settings (cheap — one row lookup) and hands them in; the modal lazy-loads
 * the OpenRouter model list only when the user actually opens it.
 */
export function SettingsLauncher({ initialSettings }: SettingsLauncherProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton
        aria-label="Open AI settings"
        title="AI settings"
        onClick={() => setOpen(true)}
      >
        <GearIcon />
      </IconButton>
      {open ? (
        <SettingsModal
          initialSettings={initialSettings}
          onClose={() => setOpen(false)}
          loadModels={loadModelsAction}
          saveSettings={saveSettingsAction}
        />
      ) : null}
    </>
  );
}

function GearIcon() {
  return (
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
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
