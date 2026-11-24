import { useEffect, useState } from 'react';
import { Download, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'drawer';
  onAfterClick?: () => void;
  guideOpen?: boolean;
  onOpenGuide?: () => void;
  onCloseGuide?: () => void;
}

export function PWAInstallButton({
  variant = 'header',
  onAfterClick,
  guideOpen: controlledGuideOpen,
  onOpenGuide,
  onCloseGuide,
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [internalShowIOSGuide, setInternalShowIOSGuide] = useState(false);

  const showIOSGuide =
    typeof controlledGuideOpen === 'boolean' ? controlledGuideOpen : internalShowIOSGuide;

  const openIOSGuide = () => {
    if (onOpenGuide) {
      onOpenGuide();
    } else {
      setInternalShowIOSGuide(true);
    }
  };

  const closeIOSGuide = () => {
    if (onCloseGuide) {
      onCloseGuide();
    } else {
      setInternalShowIOSGuide(false);
    }
  };

  useEffect(() => {
    if (!showIOSGuide) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (onCloseGuide) {
          onCloseGuide();
        } else {
          setInternalShowIOSGuide(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showIOSGuide, onCloseGuide]);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    await install();
    onAfterClick?.();
  };

  if (isInstallable) {
    if (variant === 'drawer') {
      return (
        <button
          type="button"
          onClick={handleInstallClick}
          className="mb-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#4CAF50]/15 border border-[#4CAF50]/45 px-4 text-xs font-extrabold text-[#4CAF50] hover:bg-[#4CAF50] hover:text-white transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>تثبيت تطبيق RahaL TV</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={handleInstallClick}
        aria-label="تثبيت التطبيق"
        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#181818] border border-[#4CAF50]/45 px-3 text-xs sm:text-sm font-bold text-[#4CAF50] hover:bg-[#4CAF50] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
      >
        <Download className="w-4 h-4" />
        <span className="hidden xl:inline">تثبيت التطبيق</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        {variant === 'drawer' ? (
          <button
            type="button"
            onClick={openIOSGuide}
            className="mb-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1c1c1c] border border-white/15 px-4 text-xs font-extrabold text-white hover:border-[#4CAF50] transition-colors cursor-pointer"
          >
            <Smartphone className="w-4 h-4 text-[#4CAF50]" />
            <span>تثبيت التطبيق على iOS</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={openIOSGuide}
            aria-label="تثبيت التطبيق على iOS"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#181818] border border-white/15 px-3 text-xs font-bold text-white hover:border-[#4CAF50] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Smartphone className="w-4 h-4 text-[#4CAF50]" />
            <span className="hidden xl:inline">تثبيت على iOS</span>
          </button>
        )}

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="تثبيت RahaL TV على iPhone / iPad"
            data-rtv-focus-trap="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeIOSGuide();
            }}
          >
            <div className="w-full max-w-sm rounded-2xl bg-[#181818] border border-white/10 p-6 shadow-2xl text-right">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-base font-extrabold text-white">
                  تثبيت RahaL TV على iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={closeIOSGuide}
                  aria-label="إغلاق"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white/80 hover:bg-[#E50914] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2.5 text-xs sm:text-sm text-[#d4d4d4] leading-relaxed">
                <li className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E50914] text-[11px] font-black text-white">
                    1
                  </span>
                  <span>
                    اضغط على زر <strong className="text-white inline-flex items-center gap-1">المشاركة <Share className="w-3.5 h-3.5 inline" /></strong> في شريط متصفح Safari.
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E50914] text-[11px] font-black text-white">
                    2
                  </span>
                  <span>
                    مرر للأسفل واختر <strong className="text-white">إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={closeIOSGuide}
                className="mt-5 w-full min-h-[44px] rounded-xl bg-[#E50914] hover:bg-[#f40612] py-2.5 text-xs font-extrabold text-white transition-colors cursor-pointer"
              >
                حسنًا
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 inset-x-4 sm:inset-x-auto sm:bottom-6 sm:left-6 z-50 inline-flex items-center justify-center sm:justify-start gap-2 rounded-2xl bg-[#f9c400] px-4 py-2.5 text-xs font-black text-[#0f0f0f] shadow-2xl border border-black/15"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>وضع عدم الاتصال — يتم عرض البيانات المخزنة مؤقتًا</span>
    </div>
  );
}
