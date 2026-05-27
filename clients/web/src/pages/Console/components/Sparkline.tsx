// Minimal SVG sparkline. Stretches to fill its container width; draws a
// stroked line + soft fill underneath. Returns null on empty input so callers
// can use `<Sparkline values={…} />` unconditionally.

type SparklineProps = {
  values: ReadonlyArray<number>;
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  className?: string;
};

export function Sparkline({
  values,
  width = 240,
  height = 56,
  stroke = "var(--color-mint)",
  fill = "rgba(166,225,207,0.12)",
  className,
}: SparklineProps) {
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;

  // Map each value to a point. Y is flipped (0 at top), with a 4px inset so
  // the stroke isn't clipped at the SVG edges.
  const inset = 4;
  const usableH = height - inset * 2;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = inset + (1 - (v - min) / span) * usableH;
    return [x, y] as const;
  });

  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const last = points[points.length - 1]!;
  const first = points[0]!;
  const area = `${path} L ${last[0].toFixed(2)} ${height} L ${first[0].toFixed(2)} ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      className={className}
      aria-hidden="true"
    >
      <path d={area} fill={fill} />
      <path
        d={path}
        stroke={stroke}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={stroke} />
    </svg>
  );
}
