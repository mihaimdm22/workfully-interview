import { forwardRef } from "react";

interface IconButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  children: React.ReactNode;
  /** Required — there's no visible label so screen readers need this. */
  "aria-label": string;
}

/**
 * 32px square button on desktop, 40px on mobile (touch target). Icon goes in
 * children. Always pass an aria-label.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ children, className = "", ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={`border-border bg-bg text-fg-muted hover:bg-muted inline-flex size-10 items-center justify-center rounded-md border transition-colors sm:size-8 ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
