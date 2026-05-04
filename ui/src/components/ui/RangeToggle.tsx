import { useTranslation } from "react-i18next";
import type { Range } from "@/lib/api";
import { Segmented } from "./Segmented";

export function RangeToggle({ value, onChange }: { value: Range; onChange: (v: Range) => void }) {
  const { t } = useTranslation();
  return (
    <Segmented<Range>
      value={value}
      onChange={onChange}
      options={[
        { value: "today", label: t("Today") },
        { value: "7d",    label: t("7d") },
        { value: "30d",   label: t("30d") },
      ]}
      variant="primary"
      size="sm"
    />
  );
}
