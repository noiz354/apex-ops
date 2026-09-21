import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-[5px] h-[22px] px-2 rounded-pill text-[11px] font-semibold whitespace-nowrap',
  {
    variants: {
      variant: {
        pass: 'bg-pass-bg text-pass-ink',
        warn: 'bg-warn-bg text-warn-ink',
        fail: 'bg-fail-bg text-fail-ink',
        hold: 'bg-hold-bg text-hold-ink',
        info: 'bg-cobalt-tint text-cobalt-deep',
      },
    },
    defaultVariants: { variant: 'hold' },
  }
);

const dot: Record<string, string> = {
  pass: 'bg-pass-dot',
  warn: 'bg-warn-dot',
  fail: 'bg-fail-dot',
  hold: 'bg-hold-dot',
  info: 'bg-cobalt',
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  pulse?: boolean;
}

export function Badge({ className, variant = 'hold', pulse, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      <span className={cn('w-1.5 h-1.5 rounded-full', dot[variant ?? 'hold'], pulse && 'animate-pulse')} />
      {children}
    </span>
  );
}
