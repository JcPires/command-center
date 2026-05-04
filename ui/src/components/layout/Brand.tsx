export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="relative inline-block rounded-[8px] shrink-0"
      style={{
        width: size,
        height: size,
        backgroundImage: "var(--acc-grad)",
        boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.35), 0 4px 16px var(--acc-soft)",
      }}
      aria-hidden
    >
      <span
        className="absolute inset-0 rounded-[8px]"
        style={{
          background: "radial-gradient(120% 80% at 18% 12%, rgb(255 255 255 / 0.45), transparent 55%)",
        }}
      />
    </span>
  );
}
