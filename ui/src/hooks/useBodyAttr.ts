import { useEffect, useState } from "react";

/** Subscribe to changes of a body data-attribute. Re-renders when value changes. */
export function useBodyAttr(name: string): string | null {
  const [value, setValue] = useState<string | null>(() => {
    if (typeof document === "undefined") return null;
    return document.body.getAttribute(name);
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => setValue(document.body.getAttribute(name));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: [name] });
    return () => observer.disconnect();
  }, [name]);

  return value;
}
