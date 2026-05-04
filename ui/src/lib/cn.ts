// Tiny classname concatenator. Filters out falsy values; no clsx dep needed.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
