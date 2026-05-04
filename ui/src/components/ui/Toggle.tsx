type Props = {
  on: boolean;
  onToggle: () => void;
  label?: string;
  /** When true, render label + toggle as a row (default). When false, only the toggle. */
  withLabel?: boolean;
  /** Optional aria-label when no visual label is shown. */
  ariaLabel?: string;
};

/**
 * Toggle pill — track stays neutral, the knob carries the on/off color.
 * Used in the Tweaks panel and elsewhere we need a clear binary switch.
 */
export function Toggle({ on, onToggle, label, withLabel = true, ariaLabel }: Props) {
  const knob = (
    <span
      className="relative h-[18px] w-[32px] rounded-full shrink-0 transition-colors"
      style={{
        background: "var(--surface-2)",
        border: "0.5px solid var(--hairline)",
      }}
    >
      <span
        className="absolute top-[1px] h-[14px] w-[14px] rounded-full transition-all"
        style={{
          left: on ? "calc(100% - 16px)" : "1px",
          background: on ? "var(--acc)" : "var(--ink-mute)",
          boxShadow: on ? "0 0 6px var(--acc-soft)" : undefined,
        }}
      />
    </span>
  );

  if (!withLabel || !label) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label={ariaLabel ?? label}
        aria-pressed={on}
        className="inline-flex items-center focus-ring rounded"
      >
        {knob}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="flex items-center justify-between w-full py-1 focus-ring rounded"
    >
      <span className="text-[12.5px] text-ink-soft">{label}</span>
      {knob}
    </button>
  );
}
