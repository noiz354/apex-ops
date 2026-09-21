import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded text-[13px] font-semibold h-9 px-4 transition-colors focus-visible:outline-2 focus-visible:outline-cobalt focus-visible:outline-offset-2 disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-cobalt text-white hover:bg-cobalt-deep shadow-card',
        secondary: 'bg-card text-body border border-border-strong hover:bg-surface',
        destructive: 'bg-fail-bg text-fail border border-[#FECACA] hover:bg-fail hover:text-white',
        ghost: 'hover:bg-surface-subtle text-body',
        field: 'bg-slate900 text-white rounded min-h-[48px] text-base font-bold active:scale-[0.99]',
        pass: 'bg-pass text-white rounded min-h-[56px] text-lg font-bold active:scale-95',
        fail: 'bg-fail text-white rounded min-h-[56px] text-lg font-bold active:scale-95',
      },
    },
    defaultVariants: { variant: 'primary' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant }), className)} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { buttonVariants };
