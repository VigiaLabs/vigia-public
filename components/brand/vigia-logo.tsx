import { cn } from '@/lib/utils';

type Props = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const containerSizes = {
  sm: 'h-9 w-9 rounded-[10px]',
  md: 'h-10 w-10 rounded-[11px]',
  lg: 'h-12 w-12 rounded-[13px]',
};

const iconSizes = {
  sm: 'h-[18px] w-[18px]',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

export function VigiaLogo({ size = 'md', className }: Props) {
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center bg-[#0a0a0a] shadow-[0_1px_2px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-black/20',
        containerSizes[size],
        className
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={iconSizes[size]}
      >
        <path
          d="M7.5 8L12 17.5L16.5 8"
          stroke="white"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9 8H15"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <circle
          cx="12"
          cy="12"
          r="8.5"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="0.75"
        />
      </svg>
    </div>
  );
}
