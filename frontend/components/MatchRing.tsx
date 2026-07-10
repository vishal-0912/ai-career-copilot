const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function matchInfo(pct: number) {
  const dash = `${((CIRCUMFERENCE * pct) / 100).toFixed(1)} ${CIRCUMFERENCE.toFixed(1)}`;
  let color = '#9D6638';
  let label = 'Good match';
  if (pct >= 80) {
    color = '#5E7F4C';
    label = 'Strong match';
  } else if (pct < 60) {
    color = '#8A7A5E';
    label = 'Fair match';
  }
  return { dash, color, label };
}

export default function MatchRing({ percentage }: { percentage: number }) {
  const rounded = Math.round(percentage);
  const { dash, color, label } = matchInfo(percentage);

  return (
    <div className="flex shrink-0 flex-col items-center">
      <div className="relative h-16 w-16">
        <svg width="64" height="64" viewBox="0 0 64 64" className="absolute left-0 top-0 -rotate-90">
          <circle cx="32" cy="32" r={RADIUS} fill="none" stroke="#E4D8C3" strokeWidth="6" />
          <circle
            cx="32"
            cy="32"
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={dash}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[13px] font-semibold text-[#4E220F]">{rounded}%</span>
        </div>
      </div>
      <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.05em] text-[#8A7A5E]">
        {label}
      </p>
    </div>
  );
}
