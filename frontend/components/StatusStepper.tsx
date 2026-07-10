export const STATUS_STAGES = [
  { key: 'saved', label: 'Saved' },
  { key: 'applied', label: 'Applied' },
  { key: 'interviewing', label: 'Interviewing' },
  { key: 'offer', label: 'Offer' },
] as const;

export type TrackedStatus = (typeof STATUS_STAGES)[number]['key'] | 'rejected';

export const STATUS_COLORS: Record<TrackedStatus, string> = {
  saved: '#8FA379',
  applied: '#9D6638',
  interviewing: '#C08A3E',
  offer: '#5E7F4C',
  rejected: '#A34B3F',
};

const INACTIVE = '#E4D8C3';

export function statusLabel(status: TrackedStatus | null) {
  if (!status) return 'Not tracked';
  if (status === 'rejected') return 'Rejected';
  return STATUS_STAGES.find((s) => s.key === status)?.label ?? 'Not tracked';
}

export default function StatusStepper({
  status,
  onSetStatus,
  size = 'md',
}: {
  status: TrackedStatus | null;
  onSetStatus: (status: (typeof STATUS_STAGES)[number]['key']) => void;
  size?: 'sm' | 'md';
}) {
  const idx = status && status !== 'rejected' ? STATUS_STAGES.findIndex((s) => s.key === status) : -1;
  const dotSize = size === 'sm' ? 'h-[11px] w-[11px]' : 'h-[13px] w-[13px]';
  const lineSize = size === 'sm' ? 'w-3' : 'w-4';

  return (
    <div className="flex items-center">
      {STATUS_STAGES.map((stage, i) => (
        <div key={stage.key} className="flex items-center">
          <button
            type="button"
            title={stage.label}
            onClick={() => onSetStatus(stage.key)}
            className={`${dotSize} cursor-pointer rounded-full border-none p-0`}
            style={{ background: status === 'rejected' ? INACTIVE : i <= idx ? STATUS_COLORS[stage.key] : INACTIVE }}
          />
          {i < STATUS_STAGES.length - 1 && (
            <div className={`${lineSize} h-0.5 bg-[rgba(78,34,15,0.15)]`} />
          )}
        </div>
      ))}
    </div>
  );
}
