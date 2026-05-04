import { useTranslation } from "react-i18next";

export function StatusBar() {
  const { t } = useTranslation();
  return (
    <footer
      className="fixed bottom-0 inset-x-0 z-20 border-t-[0.5px] border-hairline backdrop-blur-xl"
      style={{ background: "color-mix(in oklab, var(--bg) 70%, transparent)" }}
    >
      <div className="mx-auto max-w-[1480px] px-7 h-9 flex items-center gap-3 mono text-[11.5px] text-ink-mute">
        <span className="text-ink-soft">$</span>
        <span>{t("local-only · 127.0.0.1:8765")}</span>
        <span className="inline-flex items-center gap-1.5 ml-1">
          <span className="h-1.5 w-1.5 rounded-full dot-pulse" style={{ background: "var(--pos)" }} />
          <span style={{ color: "var(--pos)" }} className="uppercase tracking-[0.10em] text-[10px]">live</span>
        </span>
        <span className="ml-auto">{t("⌘K to navigate")}</span>
      </div>
    </footer>
  );
}
