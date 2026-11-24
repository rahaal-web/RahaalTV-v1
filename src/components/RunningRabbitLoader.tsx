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

const SIZE_MAP: Record<NonNullable<RunningRabbitLoaderProps['size']>, { w: number; h: number }> = {
  sm: { w: 46, h: 32 },
  md: { w: 84, h: 56 },
  lg: { w: 112, h: 74 },
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
  const dims = SIZE_MAP[resolvedSize];

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

  const revealClass = delayMs > 0 ? 'rtv-rabbit-delayed' : 'rtv-rabbit-delayed-immediate';
  const revealStyle =
    delayMs > 0 ? ({ '--rtv-rabbit-delay': `${delayMs}ms` } as CSSProperties) : undefined;

  const rabbitGraphic = (
    <svg
      width={dims.w}
      height={dims.h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0 overflow-visible"
    >
      {/* Ground motion streaks */}
      <line
        x1="6"
        y1="66"
        x2="28"
        y2="66"
        stroke="#E50914"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="rtv-rabbit-streak-1"
      />
      <line
        x1="14"
        y1="72"
        x2="38"
        y2="72"
        stroke="#f9c400"
        strokeWidth="2"
        strokeLinecap="round"
        className="rtv-rabbit-streak-2"
      />

      {/* Dynamic shadow */}
      <ellipse
        cx="60"
        cy="71"
        rx="28"
        ry="4.5"
        fill="rgba(0,0,0,0.65)"
        className="rtv-rabbit-shadow"
      />

      {/* Running Rabbit Group (facing left for RTL motion or dynamic forward lean) */}
      <g className="rtv-rabbit-body">
        {/* Back hind leg */}
        <path
          d="M72 48 C81 51 90 58 95 63 C97 65 94 67 90 65 C83 61 75 56 68 53 Z"
          fill="#d4d4d8"
          className="rtv-rabbit-leg-back"
        />

        {/* Fluffy tail */}
        <circle cx="88" cy="43" r="6" fill="#f4f4f5" />

        {/* Back ear */}
        <path
          d="M42 26 C46 11 54 6 58 9 C61 12 56 23 48 30 Z"
          fill="#d4d4d8"
          className="rtv-rabbit-ear rtv-rabbit-ear-back"
        />

        {/* Torso */}
        <path
          d="M36 42 C41 31 59 29 76 35 C86 38 90 46 83 51 C74 56 54 57 40 52 C34 50 34 45 36 42 Z"
          fill="#ffffff"
        />

        {/* Crimson accent scarf / collar matching RahaL TV brand */}
        <path
          d="M43 34 C48 36 52 40 50 45 C47 46 42 44 39 40 Z"
          fill="#E50914"
        />

        {/* Front hind leg (primary stride) */}
        <path
          d="M66 49 C74 54 80 62 79 66 C78 69 72 68 69 64 C66 59 61 55 58 51 Z"
          fill="#ffffff"
          className="rtv-rabbit-leg-back"
        />

        {/* Front foreleg */}
        <path
          d="M44 48 C36 53 28 60 26 64 C24 66 28 68 32 65 C37 61 43 56 49 52 Z"
          fill="#ffffff"
          className="rtv-rabbit-leg-front"
        />

        {/* Head */}
        <ellipse cx="38" cy="34" rx="13" ry="10.5" transform="rotate(-12 38 34)" fill="#ffffff" />

        {/* Front ear */}
        <path
          d="M45 25 C50 8 60 3 64 7 C68 11 60 23 50 30 Z"
          fill="#ffffff"
          className="rtv-rabbit-ear"
        />
        <path
          d="M48 24 C52 12 58 8 60 11 C62 13 57 21 51 27 Z"
          fill="#fda4af"
          className="rtv-rabbit-ear"
        />

        {/* Eye & nose */}
        <circle cx="32" cy="32" r="2" fill="#0f0f0f" />
        <circle cx="31.4" cy="31.4" r="0.65" fill="#ffffff" />
        <circle cx="25.5" cy="34.5" r="1.8" fill="#E50914" />
      </g>
    </svg>
  );

  if (variant === 'inline') {
    return (
      <span
        role="status"
        aria-live="polite"
        data-rtv-loader="running-rabbit"
        style={revealStyle}
        className={`inline-flex items-center gap-2 ${revealClass} ${className}`}
      >
        <span className="sr-only">جاري التحميل</span>
        {rabbitGraphic}
        {label && <span className="text-xs font-bold text-[#e5e5e5]">{label}</span>}
      </span>
    );
  }

  const content = (
    <div
      role="status"
      aria-live="polite"
      data-rtv-loader="running-rabbit"
      style={revealStyle}
      className={`flex flex-col items-center justify-center gap-2.5 text-center select-none ${revealClass} ${
        variant === 'section' ? 'py-10 px-4' : 'px-6 py-8'
      } ${className}`}
    >
      <span className="sr-only">جاري التحميل</span>
      <div className="relative flex items-center justify-center rounded-2xl bg-[#181818]/75 border border-white/[0.08] px-6 py-4 shadow-[0_14px_38px_rgba(0,0,0,0.45)]">
        {rabbitGraphic}
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
