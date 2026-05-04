import { useMemo } from "react";

type Props = {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  /** show smooth bezier curve (default) vs straight polyline */
  smooth?: boolean;
  /** stroke width */
  strokeWidth?: number;
  /** show filled area below line */
  area?: boolean;
  /** opacity of filled area */
  areaOpacity?: number;
  /** optional reference line */
  target?: number;
  /**
   * When provided, the line is drawn as N-1 colored segments. The function
   * returns the color for the segment ending at the right point.
   * Disables `smooth` and the area fill (drawn as colored dots instead).
   */
  colorAt?: (value: number, index: number) => string;
  /** Render a colored dot at each point (uses colorAt if set, else color). */
  showDots?: boolean;
};

function buildPath(points: { x: number; y: number }[], smooth: boolean): string {
  if (points.length === 0) return "";
  if (!smooth || points.length < 3) {
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");
  }
  // Catmull-Rom-ish smoothing converted to cubic Bezier
  const out = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    out.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
  }
  return out.join(" ");
}

export function Sparkline({
  values,
  width = 120,
  height = 28,
  color = "currentColor",
  smooth = true,
  strokeWidth = 1.4,
  area = true,
  areaOpacity = 0.12,
  target,
  colorAt,
  showDots = false,
}: Props) {
  const { points, linePath, areaPath, refY } = useMemo(() => {
    if (values.length === 0) return { points: [] as { x: number; y: number }[], linePath: "", areaPath: "", refY: null as number | null };
    const max = Math.max(...values, target ?? -Infinity);
    const min = Math.min(...values, target ?? Infinity);
    const range = Math.max(1e-6, max - min);
    const dx = values.length > 1 ? width / (values.length - 1) : width;
    const pad = 1;
    const dy = (v: number) => height - pad - ((v - min) / range) * (height - 2 * pad);
    const pts = values.map((v, i) => ({ x: i * dx, y: dy(v) }));
    // when colorAt is set, force straight segments (no smoothing)
    const linePath = buildPath(pts, smooth && !colorAt);
    const areaPath =
      pts.length > 0
        ? `${linePath} L ${pts[pts.length - 1].x} ${height} L ${pts[0].x} ${height} Z`
        : "";
    const refY = target !== undefined ? dy(target) : null;
    return { points: pts, linePath, areaPath, refY };
  }, [values, width, height, smooth, target, colorAt]);

  if (values.length === 0) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      style={{ color }}
      aria-hidden
    >
      {area && !colorAt && (
        <path d={areaPath} fill={color} fillOpacity={areaOpacity} stroke="none" />
      )}
      {area && colorAt && points.slice(1).map((p, i) => {
        const prev = points[i];
        const segColor = colorAt(values[i + 1], i + 1);
        const d = `M ${prev.x} ${prev.y} L ${p.x} ${p.y} L ${p.x} ${height} L ${prev.x} ${height} Z`;
        return (
          <path
            key={`area-${i}`}
            d={d}
            fill={segColor}
            fillOpacity={areaOpacity}
            stroke="none"
          />
        );
      })}
      {refY !== null && (
        <line
          x1={0} x2={width} y1={refY} y2={refY}
          stroke="var(--ink-mute)"
          strokeDasharray="2 2"
          strokeOpacity={0.4}
        />
      )}
      {colorAt ? (
        <>
          {/* Subtle base line for continuity */}
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeOpacity={0.25}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.slice(1).map((p, i) => {
            const prev = points[i];
            const segColor = colorAt(values[i + 1], i + 1);
            return (
              <line
                key={i}
                x1={prev.x} y1={prev.y} x2={p.x} y2={p.y}
                stroke={segColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
            );
          })}
        </>
      ) : (
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {showDots && points.map((p, i) => {
        const dotColor = colorAt ? colorAt(values[i], i) : color;
        return (
          <circle key={i} cx={p.x} cy={p.y} r={2} fill={dotColor} />
        );
      })}
    </svg>
  );
}
