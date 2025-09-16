import { clsx } from 'clsx';

import type { FocusState } from '../types/session';

interface StatusChipProps {
  label: string;
  tone: FocusState;
  active: boolean;
}

const toneStyles: Record<FocusState, string> = {
  focused: 'bg-focus-success/10 text-focus-success border-focus-success/40',
  warning: 'bg-focus-warning/10 text-focus-warning border-focus-warning/40',
  alert: 'bg-focus-danger/10 text-focus-danger border-focus-danger/40',
};

export const StatusChip = ({ label, tone, active }: StatusChipProps) => (
  <span
    className={clsx(
      'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors',
      toneStyles[tone],
      !active && 'opacity-40',
    )}
    aria-current={active || undefined}
    role="status"
  >
    {label}
  </span>
);

