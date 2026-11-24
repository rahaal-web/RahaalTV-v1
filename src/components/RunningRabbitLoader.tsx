import type { CSSProperties } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

export interface RunningRabbitLoaderProps {
  variant?: 'fullscreen' | 'section' | 'inline';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  sublabel?: string;
  delayMs?: number;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

const SPINNER_SIZE_MAP: Record<NonNullable<RunningRabbitLoaderProps['size']>, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-9 w-9 border-[3px]',
  lg: 'h-11 w-11 border-[3px]',
};

export function RunningRabbitLoader({
  variant = 'section',
  size,
  label = 'جاري التحميل...',
  sublabel,
  delayMs = 120,
  error = null,
  onRetry,
  className = '',
}: RunningRabbitLoaderProps) {
  const resolvedSize: NonNullable<RunningRabbitLoaderProps['size']> =
    size || (variant === 'inline' ? 'sm' : variant === 'fullscreen' ? 'lg' : 'md');
  const spinnerSizeClass = SPINNER_SIZE_MAP[resolvedSize];

  if (error) {
    const errorBox = (
      <div
        role="alert"
        className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-[#E50914]/35 bg-[#181818]/95 px-5 py-6 text-center shadow-xl ${
          variant === 'inline' ? 'py-3 px-4' : 'max-w-md mx-auto'
        } ${className}`}
      >
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#E50914]/15 border border-[#E50914]/40 text-[#ff8a88]">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <p className="font-display text-sm sm:text-base font-extrabold text-white">تعذر إتمام التحميل</p>
          <p className="text-xs text-[#b7c9ef] leading-relaxed">{error}</p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-[#E50914] hover:bg-[#f40612] px-5 py-2 text-xs font-extrabold text-white transition-colors cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>إعادة المحاولة</span>
          </button>
        )}
      </div>
    );

    if (variant === 'fullscreen') {
      return (
        <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-4 text-white">
          {errorBox}
        </div>
      );
    }

    return errorBox;
  }

  const revealClass = delayMs > 0 ? 'rtv-loader-delayed' : 'rtv-loader-delayed-immediate';
  const revealStyle =
    delayMs > 0 ? ({ '--rtv-loader-delay': `${delayMs}ms` } as CSSProperties) : undefined;

  const spinnerGraphic = (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full border-white/15 border-t-[#E50914] animate-spin rtv-spinner-ring ${spinnerSizeClass}`}
    />
  );

  if (variant === 'inline') {
    return (
      <span
        role="status"
        aria-live="polite"
        data-rtv-loader="spinner"
        style={revealStyle}
        className={`inline-flex items-center gap-2 ${revealClass} ${className}`}
      >
        <span className="sr-only">جاري التحميل</span>
        {spinnerGraphic}
        {label && <span className="text-xs font-bold text-[#e5e5e5]">{label}</span>}
      </span>
    );
  }

  const content = (
    <div
      role="status"
      aria-live="polite"
      data-rtv-loader="spinner"
      style={revealStyle}
      className={`flex flex-col items-center justify-center gap-3 text-center select-none ${revealClass} ${
        variant === 'section' ? 'py-10 px-4' : 'px-6 py-8'
      } ${className}`}
    >
      <span className="sr-only">جاري التحميل</span>
      <div className="relative flex items-center justify-center rounded-2xl bg-[#181818]/75 border border-white/[0.08] p-5 shadow-[0_14px_38px_rgba(0,0,0,0.45)]">
        {spinnerGraphic}
      </div>
      {label && (
        <p className="font-display text-sm sm:text-base font-extrabold text-white">{label}</p>
      )}
      {sublabel && <p className="text-xs text-[#b7c9ef] max-w-sm">{sublabel}</p>}
    </div>
  );

  if (variant === 'fullscreen') {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center text-white">
        {content}
      </div>
    );
  }

  return content;
}
