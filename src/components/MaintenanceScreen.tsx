import { ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import type { WebsiteBrandingConfig } from '../types/media';
import { Logo } from './Logo';

interface MaintenanceScreenProps {
  siteName: string;
  tagline: string;
  message: string;
  branding?: WebsiteBrandingConfig;
  onOpenAdminLogin: () => void;
}

export function MaintenanceScreen({
  siteName,
  tagline,
  message,
  branding,
  onOpenAdminLogin,
}: MaintenanceScreenProps) {
  const resolvedName = branding?.siteName || siteName || 'RahaL TV';
  const showBrand = branding?.logoMode !== 'hidden';

  return (
    <div className="min-h-screen bg-[#06131c] text-white flex flex-col items-center justify-center p-3.5 sm:p-6 relative overflow-hidden">
      <div className="moov-hex-pattern absolute inset-0 opacity-60 pointer-events-none" />
      <div className="moov-spotlight absolute inset-0 pointer-events-none" />

      <div className="relative z-10 w-full max-w-2xl rounded-2xl sm:rounded-3xl bg-[#0c1821]/95 border border-white/10 p-5 sm:p-10 shadow-2xl text-center space-y-5 sm:space-y-6 backdrop-blur-md">
        {/* Brand Badge */}
        {showBrand && (
          <div className="inline-flex items-center justify-center rounded-2xl bg-[#1a242e] border border-white/10 px-4 py-2 max-w-full">
            <Logo size="sm" branding={branding} fallbackSiteName={resolvedName} />
          </div>
        )}

        {/* Animated Maintenance Icon */}
        <div className="mx-auto relative flex h-18 w-18 sm:h-20 sm:w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#D92321]/25 via-[#1a242e] to-[#f9c400]/15 border border-[#f9c400]/35 text-[#f9c400] shadow-[0_0_40px_rgba(249,196,0,0.2)]">
          <Wrench className="w-8 h-8 sm:w-9 sm:h-9 animate-pulse" />
          <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f9c400] opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-[#f9c400]" />
          </span>
        </div>

        {/* Title & Custom Admin Message */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-[#f9c400]/15 border border-[#f9c400]/35 px-3 py-1 text-xs font-extrabold text-[#f9c400]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>الموقع في وضع الصيانة حاليًا</span>
          </div>

          <h1 className="font-display text-xl sm:text-3xl font-black text-white leading-snug">
            نعمل على تحسين {siteName || 'RahaL TV'}
          </h1>

          <div className="rounded-2xl bg-[#1a242e]/85 border border-white/[0.08] p-4 sm:p-5">
            <p className="text-sm sm:text-base font-bold leading-relaxed text-[#b7c9ef] whitespace-pre-line">
              {message ||
                'نقوم حاليًا بإجراء أعمال صيانة وتحديثات تقنية لتحسين جودة السيرفرات وتجربة المشاهدة. سنعود للعمل قريبًا، شكرًا لتفهمكم.'}
            </p>
          </div>
        </div>

        {/* Tagline & Admin Sign-in Escape Hatch */}
        <div className="pt-3 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#b7c9ef]/80">
          {tagline ? (
            <p className="line-clamp-2 sm:line-clamp-1 text-center sm:text-right max-w-md">{tagline}</p>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={onOpenAdminLogin}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/5 hover:bg-[#D92321] border border-white/10 hover:border-[#D92321] px-4 py-2 text-xs font-bold text-[#b7c9ef] hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>دخول الإدارة</span>
          </button>
        </div>
      </div>
    </div>
  );
}
