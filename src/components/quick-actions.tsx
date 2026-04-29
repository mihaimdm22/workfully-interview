"use client";

import { useTransition } from "react";
import { resetConversation } from "@/app/actions";

export function ResetButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => resetConversation())}
      disabled={pending}
      className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline disabled:opacity-50"
    >
      {pending ? "Resetting…" : "New conversation"}
    </button>
  );
}
