import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid ? true : undefined}
      className={cn(
        'h-9 px-3 bg-card border rounded text-[13px] text-body outline-none transition-all',
        'focus:border-cobalt focus:ring-1 focus:ring-cobalt',
        invalid ? 'border-fail' : 'border-border-strong',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold text-fail">{children}</p>;
}
