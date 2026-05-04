import { type ComponentType, type SVGProps, type ReactNode } from "react";

export function EmptyState({
  icon: Icon, title, description, action,
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 gap-3">
      {Icon && (
        <div
          className="h-12 w-12 grid place-items-center rounded-[14px] border-[0.5px] border-hairline-strong"
          style={{
            backgroundImage: "linear-gradient(135deg, var(--acc-soft), transparent 70%)",
            color: "var(--acc)",
          }}
        >
          <Icon width={20} height={20} strokeWidth={1.6} />
        </div>
      )}
      <div className="max-w-[360px]">
        <h4 className="font-display font-medium text-[15px] text-ink m-0">{title}</h4>
        {description && <p className="text-[12.5px] text-ink-mute mt-1.5 leading-relaxed">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
