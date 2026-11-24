import { ArrowUp } from 'lucide-react';
import { WebsiteBrandingConfig } from '../types/media';
import { Logo } from './Logo';

export type FooterTopic = 'terms' | 'privacy' | 'community' | 'requests';

interface FooterProps {
  tagline?: string;
  branding?: WebsiteBrandingConfig;
  siteName?: string;
  onOpenTopic: (topic: FooterTopic) => void;
  onNavigateHome: () => void;
}

export function Footer({ tagline, branding, siteName, onOpenTopic, onNavigateHome }: FooterProps) {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const resolvedBrandName = branding?.siteName || siteName || 'RahaL TV';
  const isLogoHidden = branding?.logoMode === 'hidden';
  const legacyRemovedTagline =
    'افلام ومسلسلات بجودة عالية بدون تقطيع ، تحميل ومشاهدة افلام اجنبية بروابط مباشرة ، مسلسلات اجنبية ، مسلسلات رمضان 2026 وعروض المصارعة الحرة المترجمة.';
  const cleanTagline =
    tagline && tagline.trim() !== legacyRemovedTagline ? tagline.trim() : '';

  return (
    <footer className="relative mt-12 sm:mt-16 bg-[#141414] border-t border-white/[0.08] pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] sm:pb-10 pt-10 sm:pt-12">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          {!isLogoHidden && (
            <button
              type="button"
              onClick={onNavigateHome}
              className="mb-4 cursor-pointer focus:outline-none"
              aria-label={`العودة إلى الرئيسية - ${resolvedBrandName}`}
            >
              <Logo size="lg" showSubtitle branding={branding} fallbackSiteName={resolvedBrandName} />
            </button>
          )}

          {cleanTagline && (
            <p className="max-w-2xl text-xs sm:text-sm font-medium leading-relaxed text-[#a3a3a3]">
              {cleanTagline}
            </p>
          )}

          <nav className="mt-5 sm:mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:gap-6" aria-label="روابط الفوتر">
            <button
              type="button"
              onClick={() => onOpenTopic('terms')}
              className="min-h-[40px] sm:min-h-0 px-1.5 text-xs sm:text-sm font-bold text-[#d4d4d4] hover:text-white transition-colors cursor-pointer"
            >
              سياسة الاستخدام
            </button>
            <span className="text-white/20" aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => onOpenTopic('privacy')}
              className="min-h-[40px] sm:min-h-0 px-1.5 text-xs sm:text-sm font-bold text-[#d4d4d4] hover:text-white transition-colors cursor-pointer"
            >
              سياسة الخصوصية
            </button>
            <span className="text-white/20" aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => onOpenTopic('community')}
              className="min-h-[40px] sm:min-h-0 px-1.5 text-xs sm:text-sm font-bold text-[#d4d4d4] hover:text-white transition-colors cursor-pointer"
            >
              مجتمعنا
            </button>
            <span className="text-white/20" aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => onOpenTopic('requests')}
              className="min-h-[40px] sm:min-h-0 px-1.5 text-xs sm:text-sm font-bold text-[#4CAF50] hover:text-white transition-colors cursor-pointer"
            >
              اتصل بنا وطلبات الزوار
            </button>
          </nav>

          <div className="mt-6 sm:mt-8 flex w-full flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/[0.07] pt-6">
            <p className="text-xs font-medium text-[#a3a3a3]">
              جميع الحقوق محفوظة لموقع <span className="font-bold text-white">{resolvedBrandName}</span>
            </p>

            <button
              type="button"
              onClick={scrollToTop}
              className="inline-flex w-full sm:w-auto min-h-[44px] sm:min-h-0 items-center justify-center gap-2 rounded-xl bg-[#202020] hover:bg-[#E50914] border border-white/10 px-4 py-2.5 sm:py-2 text-xs font-bold text-white transition-colors cursor-pointer"
            >
              <span>عودة للأعلى</span>
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
