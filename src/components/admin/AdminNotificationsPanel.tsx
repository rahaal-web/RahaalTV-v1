import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  BellRing,
  Bug,
  CheckCheck,
  CheckCircle2,
  Database,
  Eye,
  Info,
  Link2,
  MessageSquarePlus,
  Send,
  ServerCrash,
  ShieldAlert,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  AdminNotificationItem,
  loadAdminNotifications,
  loadClientErrorLogs,
  saveAdminNotifications,
} from '../../lib/adminPreferences';
import { runCatalogContentAudit } from '../../lib/contentAudit';
import { loadCrawlTasks, subscribeCrawlTasks } from '../../lib/crawlTasksDb';
import { sanitizeInternalRouteUrl } from '../../lib/router';
import {
  type AdminPushSendResponse,
  type AdminPushStats,
  fetchAdminPushStats,
  getPushApiBaseUrl,
  inspectWebPushStatus,
  sendAdminBroadcastPush,
  sendAdminTestPush,
  setPushApiBaseUrl,
  subscribeDeviceToWebPush,
} from '../../lib/webPushClient';
import { MediaItem, VisitorRequest } from '../../types/media';
import type { AdminTab } from './adminNavigation';
import { EmptyState } from './AdminSharedUi';

interface AdminNotificationsPanelProps {
  user: User | null;
  catalog: MediaItem[];
  requests: VisitorRequest[];
  isOwner: boolean;
  isFirestoreSeeded: boolean;
  onNavigateTab: (tab: AdminTab) => void;
  onNotify: (msg: string) => void;
}

interface ComputedSystemAlert {
  id: string;
  level: 'warning' | 'error' | 'info';
  title: string;
  detail: string;
  targetTab?: AdminTab;
  actionLabel?: string;
}

export function AdminNotificationsPanel({
  user,
  catalog,
  requests,
  isOwner,
  isFirestoreSeeded,
  onNavigateTab,
  onNotify,
}: AdminNotificationsPanelProps) {
  const [storedNotifications, setStoredNotifications] = useState<AdminNotificationItem[]>(() =>
    loadAdminNotifications()
  );
  const [crawlTasks, setCrawlTasks] = useState(() => loadCrawlTasks());

  // Web Push Composer State
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushUrl, setPushUrl] = useState('#/');
  const [pushStats, setPushStats] = useState<AdminPushStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [confirmBroadcastOpen, setConfirmBroadcastOpen] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [lastSendResult, setLastSendResult] = useState<AdminPushSendResponse | null>(null);
  const [pushServerInput, setPushServerInput] = useState<string>(() => getPushApiBaseUrl());

  const sanitizedPreviewUrl = useMemo(() => sanitizeInternalRouteUrl(pushUrl), [pushUrl]);
  const urlValidationError =
    pushUrl.trim() && sanitizedPreviewUrl === null
      ? 'الرابط غير مسموح به: يجب أن يكون مساراً داخلياً يبدأ بـ #/ (يُمنع إدخال روابط خارجية).'
      : null;

  const loadStats = useCallback(async () => {
    if (!user) return;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const stats = await fetchAdminPushStats(user);
      setPushStats(stats);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'تعذر الاتصال بخادم الإشعارات.');
    } finally {
      setStatsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    setCrawlTasks(loadCrawlTasks());
    return subscribeCrawlTasks(() => setCrawlTasks(loadCrawlTasks()));
  }, []);

  const auditReport = useMemo(() => runCatalogContentAudit(catalog), [catalog]);
  const clientErrors = useMemo(() => loadClientErrorLogs(), []);

  const liveAlerts = useMemo<ComputedSystemAlert[]>(() => {
    const list: ComputedSystemAlert[] = [];

    if (!isFirestoreSeeded && isOwner) {
      list.push({
        id: 'seed-db',
        level: 'info',
        title: 'قاعدة بيانات Firestore غير مهيأة بالبيانات المبدئية',
        detail: 'يعتمد العرض حالياً على القائمة المبدئية؛ استورد المكتبة لـ Firestore لتفعيل التعديلات الحية.',
        targetTab: 'overview',
        actionLabel: 'الذهاب للتهيئة',
      });
    }

    const pendingRequests = requests.filter((r) => r.status === 'pending').length;
    if (pendingRequests > 0 && isOwner) {
      list.push({
        id: 'pending-requests',
        level: 'info',
        title: `يوجد ${pendingRequests} طلب زائر قيد المراجعة`,
        detail: 'طلبات أفلام ومسلسلات أرسلها الأعضاء بانتظار المراجعة أو التحديث.',
        targetTab: 'requests',
        actionLabel: 'مراجعة الطلبات',
      });
    }

    if (auditReport.countsBySeverity.critical > 0) {
      list.push({
        id: 'audit-critical',
        level: 'error',
        title: `رُصدت ${auditReport.countsBySeverity.critical} مشكلة حرجة في جودة المحتوى`,
        detail: `منها ${auditReport.countsByCategory.zero_servers} عمل بدون سيرفرات و ${auditReport.countsByCategory.suspicious_server_url} رابط سيرفر مشبوه.`,
        targetTab: 'content_audit',
        actionLabel: 'فتح فحص المحتوى',
      });
    }

    if (auditReport.countsByCategory.duplicate > 0) {
      list.push({
        id: 'audit-dup',
        level: 'warning',
        title: `تم اكتشاف ${auditReport.countsByCategory.duplicate} تكرار محتمل في الكتالوج`,
        detail: 'راجع الأعمال المتشابهة في الاسم والسنة والنوع لتجنب التكرار.',
        targetTab: 'content_audit',
        actionLabel: 'مراجعة التكرارات',
      });
    }

    const failedCrawls = crawlTasks.filter((t) => t.status === 'failed').length;
    if (failedCrawls > 0) {
      list.push({
        id: 'crawl-failed',
        level: 'warning',
        title: `يوجد ${failedCrawls} مهمة جلب لم تكتمل`,
        detail: 'تحقق من سجل مهام الجلب أو راجع حالة البروكسي / المحوّلات.',
        targetTab: 'crawl_operations',
        actionLabel: 'عرض مهام الجلب',
      });
    }

    if (clientErrors.length > 0 && isOwner) {
      list.push({
        id: 'client-errors',
        level: 'warning',
        title: `مسجّل ${clientErrors.length} خطأ عميل (Client Logs) في الجلسات الأخيرة`,
        detail: `آخر خطأ: ${clientErrors[0]?.message || 'خطأ تقني'}`,
        targetTab: 'audit_logs',
        actionLabel: 'فتح سجل الأخطاء',
      });
    }

    return list;
  }, [isFirestoreSeeded, isOwner, requests, auditReport, crawlTasks, clientErrors]);

  const unreadStoredCount = storedNotifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    const next = storedNotifications.map((n) => ({ ...n, read: true }));
    saveAdminNotifications(next);
    setStoredNotifications(next);
    onNotify('تم تحديد جميع الإشعارات كمقروءة');
  };

  const clearStored = () => {
    saveAdminNotifications([]);
    setStoredNotifications([]);
    onNotify('تم مسح سجل الإشعارات المحفوظة');
  };

  const validateComposerFields = (): string | null => {
    if (!user) return 'يجب تسجيل الدخول بحساب مدير مفوّض.';
    if (!pushTitle.trim()) return 'يرجى كتابة عنوان الإشعار.';
    if (!pushBody.trim()) return 'يرجى كتابة محتوى الإشعار.';
    if (urlValidationError || sanitizedPreviewUrl === null) {
      return urlValidationError || 'الرابط الداخلي غير صالح.';
    }
    return null;
  };

  const handleSendTestToMyDevice = async () => {
    const errMsg = validateComposerFields();
    if (errMsg || !user || !sanitizedPreviewUrl) {
      setComposerError(errMsg || 'أكمل بيانات الإشعار أولاً.');
      return;
    }
    setComposerError(null);
    setSendingTest(true);
    setLastSendResult(null);
    try {
      const status = await inspectWebPushStatus();
      let endpoint = status.endpoint;
      if (!status.subscribed || !endpoint) {
        const subRes = await subscribeDeviceToWebPush();
        if (!subRes.ok || !subRes.endpoint) {
          setComposerError(subRes.message);
          setLastSendResult({ ok: false, error: subRes.message });
          return;
        }
        endpoint = subRes.endpoint;
      }

      const res = await sendAdminTestPush({
        user,
        title: pushTitle.trim(),
        body: pushBody.trim(),
        url: sanitizedPreviewUrl,
        endpoint,
      });
      setLastSendResult(res);
      if (res.ok) {
        setComposerError(null);
        onNotify('تم إرسال إشعار تجربة لجهازك الحالي فقط (لم يُرسل لبقية المشتركين).');
        void loadStats();
      } else {
        setComposerError(res.error || 'تعذر إرسال إشعار التجربة.');
      }
    } finally {
      setSendingTest(false);
    }
  };

  const handleConfirmBroadcast = async () => {
    const errMsg = validateComposerFields();
    if (errMsg || !user || !sanitizedPreviewUrl) {
      setComposerError(errMsg || 'أكمل بيانات الإشعار أولاً.');
      setConfirmBroadcastOpen(false);
      return;
    }
    setComposerError(null);
    setSendingBroadcast(true);
    try {
      const res = await sendAdminBroadcastPush({
        user,
        title: pushTitle.trim(),
        body: pushBody.trim(),
        url: sanitizedPreviewUrl,
        confirmed: true,
      });
      setLastSendResult(res);
      setConfirmBroadcastOpen(false);
      if (res.ok) {
        setComposerError(null);
        onNotify(`تمت معالجة الإرسال إلى ${res.totalTargeted || 0} مشترك.`);
        void loadStats();
      } else {
        setComposerError(res.error || 'فشل إرسال الإشعار لجميع المشتركين.');
      }
    } finally {
      setSendingBroadcast(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Web Push Broadcast & Test Panel */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] pb-4">
          <div>
            <h2 className="font-display text-lg font-extrabold text-white flex items-center gap-2">
              <BellRing className="w-5 h-5 text-[#E50914]" />
              <span>إرسال إشعارات Web Push للمشتركين</span>
            </h2>
            <p className="text-xs text-[#b7c9ef] mt-1">
              أنشئ إشعاراً مع رابط داخلي، عاينه وجرّبه على جهازك أولاً، ثم أرسله لجميع المشتركين بعد تأكيد مستقل.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 text-xs font-extrabold text-white">
              <Users className="w-4 h-4 text-[#f9c400]" />
              <span>المشتركون النشطون:</span>
              <span className="font-latin text-[#4CAF50] tabular-nums">
                {statsLoading ? '...' : pushStats?.totalSubscribers ?? 0}
              </span>
            </span>
            {pushStats && (
              <span
                className={`rounded-xl px-2.5 py-2 text-[11px] font-bold border ${
                  pushStats.vapidConfiguredInEnv
                    ? 'bg-[#4CAF50]/10 border-[#4CAF50]/35 text-[#4CAF50]'
                    : 'bg-[#f9c400]/10 border-[#f9c400]/35 text-[#f9c400]'
                }`}
              >
                {pushStats.vapidConfiguredInEnv
                  ? 'مفاتيح VAPID مضبوطة في الخادم'
                  : 'مفتاح VAPID مولّد محلياً على الخادم'}
              </span>
            )}
          </div>
        </div>

        {statsError && (
          <div className="rounded-2xl bg-[#D92321]/10 border border-[#D92321]/35 p-3.5 text-xs font-bold text-[#ffd6d5] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span>{statsError}</span>
              <button
                type="button"
                onClick={() => void loadStats()}
                className="rounded-lg bg-white/10 px-3 py-1 text-[11px] text-white hover:bg-white/20 cursor-pointer shrink-0"
              >
                تحديث
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-1 border-t border-white/10">
              <input
                type="url"
                dir="ltr"
                value={pushServerInput}
                onChange={(e) => setPushServerInput(e.target.value)}
                placeholder="اختياري: رابط خادم الإشعارات (Node أو Worker) مثل https://your-worker.workers.dev"
                className="flex-1 min-h-[38px] rounded-xl bg-[#0c1821] border border-white/15 px-3 py-1.5 text-[11px] font-latin text-white focus:border-[#f9c400] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const saved = setPushApiBaseUrl(pushServerInput);
                  setPushServerInput(saved);
                  setComposerError(null);
                  void loadStats();
                  onNotify(saved ? 'تم حفظ رابط خادم الإشعارات' : 'تمت العودة للخادم الافتراضي على نفس النطاق');
                }}
                className="min-h-[38px] rounded-xl bg-[#f9c400] hover:bg-[#ffe066] px-3.5 py-1.5 text-[11px] font-black text-black cursor-pointer shrink-0"
              >
                حفظ وفحص
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Form Inputs */}
          <div className="lg:col-span-7 space-y-3.5">
            <div>
              <label className="block text-xs font-extrabold text-white mb-1.5">عنوان الإشعار</label>
              <input
                type="text"
                maxLength={120}
                value={pushTitle}
                onChange={(e) => setPushTitle(e.target.value)}
                placeholder="مثال: تمت إضافة الحلقة 12 من مسلسلك المفضل"
                className="w-full min-h-[44px] rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:border-[#E50914] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-extrabold text-white mb-1.5">محتوى الإشعار</label>
              <textarea
                rows={3}
                maxLength={300}
                value={pushBody}
                onChange={(e) => setPushBody(e.target.value)}
                placeholder="اكتب وصفاً مختصراً وواضحاً يظهر للمشترك..."
                className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:border-[#E50914] focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-white">
                الرابط الداخلي عند الضغط على الإشعار
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  aria-label="اختيار وجهة سريعة"
                  value={pushUrl.startsWith('#/watch/') ? pushUrl : ''}
                  onChange={(e) => {
                    if (e.target.value) setPushUrl(e.target.value);
                  }}
                  className="min-h-[42px] rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 text-xs font-bold text-white focus:border-[#E50914] focus:outline-none"
                >
                  <option value="">اختر عملاً من الكتالوج (اختياري)...</option>
                  {catalog.slice(0, 60).map((item) => (
                    <option
                      key={item.id}
                      value={`#/watch/${encodeURIComponent((item.slug || item.id).trim())}`}
                    >
                      {item.title} ({item.year})
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <Link2 className="w-4 h-4 text-[#f9c400] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    dir="ltr"
                    value={pushUrl}
                    onChange={(e) => setPushUrl(e.target.value)}
                    placeholder="#/watch/slug أو #/browse"
                    className="w-full min-h-[42px] rounded-xl bg-[#1a242e] border border-white/10 pr-9 pl-3 py-2 text-xs font-latin text-white focus:border-[#E50914] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'الرئيسية', val: '#/' },
                  { label: 'كل الأقسام', val: '#/browse' },
                  { label: 'الأفلام', val: `#/browse?cat=${encodeURIComponent('افلام')}` },
                  { label: 'المسلسلات', val: `#/browse?cat=${encodeURIComponent('مسلسلات')}` },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setPushUrl(preset.val)}
                    className="rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 px-2.5 py-1 text-[11px] font-bold text-[#b7c9ef] hover:text-white cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {urlValidationError && (
                <p className="text-[11px] font-bold text-[#ff8a88]">{urlValidationError}</p>
              )}
            </div>

              {composerError && (
                <div
                  role="alert"
                  className="rounded-xl bg-[#D92321]/12 border border-[#D92321]/45 px-3.5 py-2.5 text-xs font-bold text-[#ffd6d5] flex items-start gap-2"
                >
                  <AlertTriangle className="w-4 h-4 text-[#ff8a88] shrink-0 mt-0.5" />
                  <span>{composerError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                disabled={sendingTest || sendingBroadcast || Boolean(urlValidationError)}
                onClick={() => void handleSendTestToMyDevice()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#1a242e] hover:bg-[#23313f] border border-[#f9c400]/45 px-4 py-2.5 text-xs font-extrabold text-[#f9c400] transition-colors cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>{sendingTest ? 'جاري إرسال التجربة...' : 'إرسال إشعار تجربة لجهازي'}</span>
              </button>

              <button
                type="button"
                disabled={
                  sendingTest ||
                  sendingBroadcast ||
                  Boolean(urlValidationError) ||
                  !pushTitle.trim() ||
                  !pushBody.trim()
                }
                onClick={() => {
                  const errMsg = validateComposerFields();
                  if (errMsg) {
                    setComposerError(errMsg);
                    return;
                  }
                  setComposerError(null);
                  setConfirmBroadcastOpen(true);
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#E50914] hover:bg-[#f40612] px-5 py-2.5 text-xs font-extrabold text-white shadow-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>إرسال لجميع المشتركين</span>
              </button>
            </div>
          </div>

          {/* Live Notification Preview & Last Send Result */}
          <div className="lg:col-span-5 space-y-3.5">
            <div className="rounded-2xl bg-[#121e28] border border-white/10 p-4 space-y-2.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-[#b7c9ef]">
                <Eye className="w-3.5 h-3.5 text-[#f9c400]" />
                <span>معاينة الإشعار قبل الإرسال</span>
              </span>
              <div className="rounded-2xl bg-[#1a242e] border border-white/15 p-3.5 shadow-xl flex items-start gap-3">
                <img
                  src="/pwa-192x192.png"
                  alt="RahaL TV"
                  className="h-10 w-10 rounded-xl shrink-0 border border-white/10 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black text-[#f9c400]">RahaL TV</span>
                    <span className="text-[10px] text-[#b7c9ef]">الآن</span>
                  </div>
                  <p className="text-xs font-extrabold text-white mt-0.5 break-words">
                    {pushTitle.trim() || 'عنوان الإشعار سيظهر هنا'}
                  </p>
                  <p className="text-[11px] text-[#d4d4d4] mt-1 leading-relaxed break-words">
                    {pushBody.trim() || 'محتوى الإشعار المختصر سيظهر هنا للمشتركين.'}
                  </p>
                  <p dir="ltr" className="mt-1.5 text-[10px] font-latin text-[#4CAF50] truncate">
                    {sanitizedPreviewUrl || 'رابط غير صالح'}
                  </p>
                </div>
              </div>
            </div>

            {lastSendResult && (
              <div
                className={`rounded-2xl border p-4 space-y-2 text-xs ${
                  lastSendResult.ok
                    ? 'bg-[#4CAF50]/10 border-[#4CAF50]/35 text-white'
                    : 'bg-[#D92321]/10 border-[#D92321]/40 text-[#ffd6d5]'
                }`}
              >
                <div className="flex items-center gap-2 font-extrabold">
                  {lastSendResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-[#4CAF50] shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-[#ff8a88] shrink-0" />
                  )}
                  <span>
                    {lastSendResult.ok
                      ? lastSendResult.mode === 'test'
                        ? 'نتيجة إرسال التجربة لجهازك'
                        : 'نتيجة الإرسال الجماعي'
                      : lastSendResult.error || 'تعذر الإرسال'}
                  </span>
                </div>

                {lastSendResult.ok && (
                  <>
                    <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                      <div className="rounded-xl bg-black/25 px-3 py-2">
                        <span className="text-[#b7c9ef] block">إجمالي المستهدفين</span>
                        <strong className="font-latin text-sm text-white">
                          {lastSendResult.totalTargeted ?? 0}
                        </strong>
                      </div>
                      <div className="rounded-xl bg-black/25 px-3 py-2">
                        <span className="text-[#b7c9ef] block">قُبل الطلب من خدمة الدفع</span>
                        <strong className="font-latin text-sm text-[#4CAF50]">
                          {lastSendResult.acceptedCount ?? 0}
                        </strong>
                      </div>
                      <div className="rounded-xl bg-black/25 px-3 py-2">
                        <span className="text-[#b7c9ef] block">فشل / غير متاح</span>
                        <strong className="font-latin text-sm text-[#ff8a88]">
                          {lastSendResult.failedCount ?? 0}
                        </strong>
                      </div>
                      <div className="rounded-xl bg-black/25 px-3 py-2">
                        <span className="text-[#b7c9ef] block">اشتراكات منتهية أُزيلت</span>
                        <strong className="font-latin text-sm text-[#f9c400]">
                          {lastSendResult.cleanedExpiredCount ?? 0}
                        </strong>
                      </div>
                    </div>
                    {lastSendResult.deliveryNote && (
                      <p className="text-[11px] text-[#b7c9ef] flex items-start gap-1.5 leading-relaxed pt-1">
                        <Info className="w-3.5 h-3.5 text-[#f9c400] shrink-0 mt-0.5" />
                        <span>{lastSendResult.deliveryNote}</span>
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Recent Push Send History (aggregate counts only, zero PII/endpoints) */}
        {pushStats && pushStats.recentSends.length > 0 && (
          <div className="border-t border-white/[0.06] pt-4 space-y-2">
            <h3 className="text-xs font-extrabold text-[#b7c9ef]">آخر عمليات إرسال Web Push</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {pushStats.recentSends.slice(0, 4).map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl bg-[#1a242e]/60 border border-white/[0.06] px-3 py-2.5 text-[11px] flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <span className="font-extrabold text-white block truncate">
                      [{entry.mode === 'test' ? 'تجربة' : 'جماعي'}] {entry.title}
                    </span>
                    <span className="text-[#b7c9ef] font-latin">
                      مقبول: {entry.acceptedCount}/{entry.totalTargeted} • منتهٍ أُزيل: {entry.cleanedExpiredCount}
                    </span>
                  </div>
                  <span className="font-latin text-[10px] text-[#b7c9ef]/70 shrink-0">
                    {new Date(entry.sentAt).toLocaleDateString('ar-EG')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Explicit Confirmation Modal Before Broadcast to All Subscribers */}
      {confirmBroadcastOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد إرسال الإشعار لجميع المشتركين"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => !sendingBroadcast && setConfirmBroadcastOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-[#0c1821] border border-[#E50914]/50 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-base font-extrabold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[#f9c400]" />
                <span>تأكيد الإرسال لجميع المشتركين</span>
              </h3>
              <button
                type="button"
                disabled={sendingBroadcast}
                onClick={() => setConfirmBroadcastOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-white hover:bg-[#D92321] cursor-pointer"
                aria-label="إلغاء"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-[#1a242e] border border-white/10 p-3.5 space-y-1.5 text-xs">
              <p className="text-[#b7c9ef]">
                سيُرسل هذا الإشعار إلى{' '}
                <strong className="font-latin text-[#f9c400]">
                  {pushStats?.totalSubscribers ?? 0}
                </strong>{' '}
                مشترك مسجّل:
              </p>
              <p className="font-extrabold text-white pt-1">{pushTitle.trim()}</p>
              <p className="text-[#d4d4d4]">{pushBody.trim()}</p>
              <p dir="ltr" className="font-latin text-[11px] text-[#4CAF50]">
                {sanitizedPreviewUrl}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={sendingBroadcast}
                onClick={() => setConfirmBroadcastOpen(false)}
                className="min-h-[42px] rounded-xl bg-white/10 hover:bg-white/20 px-4 py-2 text-xs font-extrabold text-white cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={sendingBroadcast}
                onClick={() => void handleConfirmBroadcast()}
                className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[#E50914] hover:bg-[#f40612] px-5 py-2 text-xs font-extrabold text-white cursor-pointer disabled:opacity-60"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sendingBroadcast ? 'جاري الإرسال...' : 'تأكيد الإرسال للجميع'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Operational Alerts Center */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-extrabold text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-[#f9c400]" />
            <span>مركز الإشعارات والتنبيهات التشغيلية</span>
          </h2>
          <p className="text-xs text-[#b7c9ef] mt-1">
            يجمع التنبيهات الحية المحسوبة من حالة الكتالوج، السيرفرات، الطلبات، ومهام الجلب دون أي بيانات وهمية.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {unreadStoredCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-bold text-[#4CAF50] cursor-pointer whitespace-nowrap shrink-0"
            >
              <CheckCheck className="w-4 h-4" />
              <span>تحديد الكل كمقروء</span>
            </button>
          )}
          {storedNotifications.length > 0 && (
            <button
              type="button"
              onClick={clearStored}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#D92321]/15 hover:bg-[#D92321] border border-[#D92321]/40 px-3.5 py-2 text-xs font-bold text-[#ff9f9d] hover:text-white cursor-pointer whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>مسح الإشعارات المحفوظة</span>
            </button>
          )}
        </div>
      </div>

      {/* Live Computed Operational Alerts */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-extrabold text-white flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#f9c400]" />
            <span>تنبيهات النظام والمحتوى الفورية ({liveAlerts.length})</span>
          </h3>
        </div>

        {liveAlerts.length === 0 ? (
          <EmptyState
            icon={<Bell className="w-9 h-9 text-[#4CAF50]" />}
            title="كل المؤشرات سليمة حالياً"
            description="لا توجد طلبات معلّقة أو أخطاء حرجة في السيرفرات أو مهام الجلب."
          />
        ) : (
          <div className="space-y-2.5">
            {liveAlerts.map((alert) => {
              const cls =
                alert.level === 'error'
                  ? 'bg-[#D92321]/10 border-[#D92321]/40'
                  : alert.level === 'warning'
                    ? 'bg-[#f9c400]/10 border-[#f9c400]/35'
                    : 'bg-sky-500/10 border-sky-400/30';
              return (
                <div
                  key={alert.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 ${cls}`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="mt-0.5 shrink-0">
                      {alert.level === 'error' ? (
                        <ServerCrash className="w-4 h-4 text-[#ff8a88]" />
                      ) : alert.level === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-[#f9c400]" />
                      ) : alert.id === 'pending-requests' ? (
                        <MessageSquarePlus className="w-4 h-4 text-sky-300" />
                      ) : alert.id === 'client-errors' ? (
                        <Bug className="w-4 h-4 text-[#f9c400]" />
                      ) : alert.id === 'seed-db' ? (
                        <Database className="w-4 h-4 text-sky-300" />
                      ) : (
                        <Activity className="w-4 h-4 text-sky-300" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-white">{alert.title}</p>
                      <p className="text-[11px] text-[#b7c9ef] mt-0.5 leading-relaxed">
                        {alert.detail}
                      </p>
                    </div>
                  </div>

                  {alert.targetTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateTab(alert.targetTab!)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#0c1821] hover:bg-white/10 border border-white/15 px-3.5 py-2 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap shrink-0 self-end sm:self-center"
                    >
                      <span>{alert.actionLabel || 'عرض'}</span>
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stored Historical Notifications */}
      {storedNotifications.length > 0 && (
        <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 space-y-3">
          <h3 className="font-display text-sm font-extrabold text-white">
            سجل الإشعارات المحلية ({storedNotifications.length})
          </h3>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {storedNotifications.map((item) => (
              <div
                key={item.id}
                className={`flex items-start justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-xs ${
                  item.read
                    ? 'bg-[#1a242e]/40 border-white/[0.05] text-[#b7c9ef]'
                    : 'bg-[#1a242e] border-[#f9c400]/30 text-white'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-extrabold truncate">{item.title}</p>
                  <p className="text-[11px] text-[#b7c9ef] mt-0.5">{item.message}</p>
                </div>
                <span className="font-latin text-[10px] text-[#b7c9ef]/70 shrink-0 tabular-nums">
                  {new Date(item.createdAt).toLocaleTimeString('ar-EG', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

