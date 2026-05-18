interface Props {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  className?: string;
  /** 'area' (default) shows gradient fill; 'line' is bare stroke for editorial style */
  variant?: "area" | "line";
}

export function Sparkline({
  data,
  color = "hsl(var(--primary))",
  width = 80,
  height = 24,
  className,
  variant = "area",
}: Props) {
  if (!data?.length) return <div style={{ width, height }} className={className} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  });
  const path = `M${points.join(" L")}`;
  const area = `${path} L${width},${height} L0,${height} Z`;
  const gradId = `spark-${Math.random().toString(36).slice(2, 8)}`;
  const lastPoint = points[points.length - 1]?.split(",");
  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {variant === "area" && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradId})`} />
        </>
      )}
      <path d={path} fill="none" stroke={color} strokeWidth={variant === "line" ? 1.75 : 1.5} strokeLinejoin="round" strokeLinecap="round" />
      {variant === "line" && lastPoint && (
        <circle cx={lastPoint[0]} cy={lastPoint[1]} r="2" fill={color} />
      )}
    </svg>
  );
}
