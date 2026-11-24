import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BellOff,
  BellRing,
  CheckCircle2,
  Info,
  Share,
  Smartphone,
} from 'lucide-react';
import {
  inspectWebPushStatus,
  subscribeDeviceToWebPush,
  unsubscribeDeviceFromWebPush,
  type WebPushStatusResult,
} from '../lib/webPushClient';

interface PushPermissionCardProps {
  compact?: boolean;
  onStatusChange?: (subscribed: boolean) => void;
  onNotify?: (msg: string) => void;
}

export function PushPermissionCard({
  compact = false,
  onStatusChange,
  onNotify,
}: PushPermissionCardProps) {
  const [status, setStatus] = useState<WebPushStatusResult | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    const next = await inspectWebPushStatus();
    setStatus(next);
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleSubscribeClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await subscribeDeviceToWebPush();
      await refreshStatus();
      onStatusChange?.(res.subscribed);
      onNotify?.(res.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUnsubscribeClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await unsubscribeDeviceFromWebPush();
      await refreshStatus();
      onStatusChange?.(false);
      onNotify?.(res.message);
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;
  const { capabilities, subscribed } = status;

  return (
    <div
      className={`rounded-2xl border border-white/10 bg-[#15222d] text-right ${
        compact ? 'p-3.5 space-y-2.5' : 'p-4 space-y-3'
      }`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
              subscribed
                ? 'bg-[#4CAF50]/20 border-[#4CAF50]/50 text-[#4CAF50]'
                : 'bg-[#E50914]/15 border-[#E50914]/40 text-[#f9c400]'
            }`}
          >
            {subscribed ? <CheckCircle2 className="w-4 h-4" /> : <BellRing className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-xs sm:text-sm font-extrabold text-white">
              تنبيهات الإصدارات الجديدة الفورية
            </h3>
            <p className="text-[11px] text-[#b7c9ef] mt-0.5 leading-relaxed">
              تصل إليك الإشعارات فور نزول الأفلام أو الحلقات الجديدة والتحديثات المهمة، حتى عند إغلاق الصفحة، ويمكنك إيقافها في أي وقت.
            </p>
          </div>
        </div>
      </div>

      {/* Apple iOS/iPadOS Non-Standalone Requirement */}
      {capabilities.requiresHomeScreenInstall ? (
        <div className="rounded-xl bg-[#0c1821] border border-[#f9c400]/30 p-3 space-y-2 text-[11px] text-[#d4d4d4] leading-relaxed">
          <p className="font-extrabold text-[#f9c400] flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            <span>متطلب أجهزة Apple (iPhone / iPad)</span>
          </p>
          <p>
            لتفعيل إشعارات الدفع على نظام iOS 16.4 أو أحدث، أضف الموقع إلى الشاشة الرئيسية عبر زر{' '}
            <strong className="text-white inline-flex items-center gap-0.5">
              المشاركة <Share className="w-3 h-3 inline" />
            </strong>{' '}
            ثم اختر <strong className="text-white">«إضافة إلى الشاشة الرئيسية»</strong>، وبعدها افتح التطبيق من أيقونته واضغط على «فعّل الإشعارات».
          </p>
        </div>
      ) : !capabilities.isSupported ? (
        <div className="rounded-xl bg-[#0c1821] border border-white/10 p-3 text-[11px] text-[#b7c9ef] flex items-start gap-2 leading-relaxed">
          <Info className="w-4 h-4 text-[#f9c400] shrink-0 mt-0.5" />
          <span>{capabilities.unsupportedReason}</span>
        </div>
      ) : capabilities.permission === 'denied' ? (
        <div className="rounded-xl bg-[#D92321]/10 border border-[#D92321]/35 p-3 space-y-1.5 text-[11px] text-[#ffd6d5] leading-relaxed">
          <p className="font-extrabold text-white flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-[#ff8a88] shrink-0" />
            <span>إذن الإشعارات محظور في المتصفح حالياً</span>
          </p>
          <p>
            لن نكرر طلب الإذن تلقائياً. إذا أردت تفعيلها لاحقاً: افتح أيقونة القفل/الإعدادات بجانب عنوان الموقع في المتصفح ← «الإشعارات (Notifications)» ← اختر «السماح (Allow)»، ثم حدّث الصفحة.
          </p>
        </div>
      ) : subscribed ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#0c1821] border border-[#4CAF50]/35 px-3 py-2.5">
          <span className="text-xs font-extrabold text-[#4CAF50] inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>الإشعارات مفعّلة على هذا الجهاز</span>
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleUnsubscribeClick()}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-white/5 hover:bg-[#D92321] border border-white/15 px-3 py-1.5 text-[11px] font-extrabold text-white transition-colors cursor-pointer disabled:opacity-60"
          >
            <BellOff className="w-3.5 h-3.5" />
            <span>{busy ? 'جاري الإلغاء...' : 'إلغاء الاشتراك'}</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <span className="text-[11px] text-[#b7c9ef]">
            {capabilities.permission === 'granted'
              ? 'الإذن متاح — اضغط لربط هذا الجهاز باستلام الإشعارات.'
              : 'لن يطلب المتصفح الإذن إلا بعد ضغطك على الزر.'}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSubscribeClick()}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-[#E50914] hover:bg-[#f40612] px-4 py-2 text-xs font-extrabold text-white shadow-md transition-colors cursor-pointer disabled:opacity-60"
          >
            <BellRing className="w-4 h-4 shrink-0" />
            <span>{busy ? 'جاري التفعيل...' : 'فعّل الإشعارات'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
