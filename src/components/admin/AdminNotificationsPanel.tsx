import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Bug,
  CheckCheck,
  Database,
  MessageSquarePlus,
  ServerCrash,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import {
  AdminNotificationItem,
  loadAdminNotifications,
  loadClientErrorLogs,
  saveAdminNotifications,
} from '../../lib/adminPreferences';
import { runCatalogContentAudit } from '../../lib/contentAudit';
import { loadCrawlTasks, subscribeCrawlTasks } from '../../lib/crawlTasksDb';
import { MediaItem, VisitorRequest } from '../../types/media';
import type { AdminTab } from './adminNavigation';
import { EmptyState } from './AdminSharedUi';

interface AdminNotificationsPanelProps {
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

  return (
    <div className="space-y-6">
      {/* Operational Alerts Center */}
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

