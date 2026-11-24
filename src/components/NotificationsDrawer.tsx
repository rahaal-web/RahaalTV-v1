import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Settings2, Sparkles, X } from 'lucide-react';
import {
  filterNotificationsByPrefs,
  isNotificationRead,
  NOTIFICATION_CATEGORY_LABELS,
  saveNotificationPreferences,
} from '../lib/notifications';
import type {
  MediaItem,
  NotificationCategory,
  NotificationPreferences,
  UserNotificationRecord,
} from '../types/media';
import { PushPermissionCard } from './PushPermissionCard';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: UserNotificationRecord[];
  localReadIds: Set<string>;
  uid: string | null;
  preferences: NotificationPreferences;
  onUpdatePreferences: (next: NotificationPreferences) => void;
  onMarkRead: (notifId: string) => void;
  onMarkAllRead: () => void;
  catalog: MediaItem[];
  onSelectMedia: (item: MediaItem) => void;
  onNotify: (msg: string) => void;
}

type CategoryFilterTab = 'all' | 'releases' | 'episodes' | 'system';

export function NotificationsDrawer({
  isOpen,
  onClose,
  notifications,
  localReadIds,
  uid,
  preferences,
  onUpdatePreferences,
  onMarkRead,
  onMarkAllRead,
  catalog,
  onSelectMedia,
  onNotify,
}: NotificationsDrawerProps) {
  const [activeTab, setActiveTab] = useState<CategoryFilterTab>('all');
  const [showPrefs, setShowPrefs] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const prefFiltered = useMemo(
    () => filterNotificationsByPrefs(notifications, preferences),
    [notifications, preferences]
  );

  const displayed = useMemo(() => {
    return prefFiltered.filter((n) => {
      if (activeTab === 'releases') {
        return n.category === 'new_season' || n.category === 'favorite_genre';
      }
      if (activeTab === 'episodes') {
        return n.category === 'new_episode' || n.category === 'watchlist_update';
      }
      if (activeTab === 'system') {
        return n.category === 'site_update' || n.category === 'admin_notice';
      }
      return true;
    });
  }, [prefFiltered, activeTab]);

  const unreadCount = useMemo(
    () => prefFiltered.filter((n) => !isNotificationRead(n, uid, localReadIds)).length,
    [prefFiltered, uid, localReadIds]
  );

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="مركز الإشعارات"
      data-rtv-focus-trap="true"
      className="fixed inset-0 z-50 flex justify-end"
    >
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-[#0c1821] border-r border-white/10 shadow-2xl">
        <div className="flex items-center justify-between gap-3 bg-[#1a242e] px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <Bell className="w-5 h-5 text-[#f9c400] shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-base font-extrabold text-white truncate">
                الإشعارات {unreadCount > 0 ? `(${unreadCount})` : ''}
              </h2>
              <p className="text-[11px] text-[#b7c9ef]">تحديثات المواسم والحلقات والتنبيهات المباشرة</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowPrefs((p) => !p)}
              aria-label="تفضيلات الإشعارات"
              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                showPrefs
                  ? 'bg-[#E50914] border-[#E50914] text-white'
                  : 'bg-white/5 border-white/10 text-[#b7c9ef] hover:text-white'
              }`}
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق الإشعارات"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white hover:bg-[#D92321] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Web Push Permission Card */}
        <div className="border-b border-white/10 bg-[#101c26] p-3.5">
          <PushPermissionCard
            compact
            onStatusChange={(subscribed) => {
              onUpdatePreferences(
                saveNotificationPreferences({ ...preferences, browserPushEnabled: subscribed })
              );
            }}
            onNotify={onNotify}
          />
        </div>

        {/* Filter Tabs + Mark All Read */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#111d28] px-4 py-2.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'all', label: 'الكل' },
                { id: 'releases', label: 'إصدارات جديدة' },
                { id: 'episodes', label: 'حلقات جديدة' },
                { id: 'system', label: 'تنبيهات النظام' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[#E50914] text-white'
                    : 'bg-white/5 text-[#b7c9ef] hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#4CAF50] hover:text-white cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>تحديد الكل كمقروء</span>
            </button>
          )}
        </div>

        {/* Notification Preferences Collapsible Panel */}
        {showPrefs && (
          <div className="border-b border-white/10 bg-[#15222d] p-4 space-y-2.5">
            <span className="block text-xs font-extrabold text-white">تخصيص أنواع الإشعارات</span>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(NOTIFICATION_CATEGORY_LABELS) as NotificationCategory[]).map((cat) => (
                <label
                  key={cat}
                  className="flex items-center justify-between gap-2 rounded-lg bg-[#0c1821] px-2.5 py-1.5 text-[11px] font-bold text-[#d4d4d4] cursor-pointer"
                >
                  <span className="truncate">{NOTIFICATION_CATEGORY_LABELS[cat]}</span>
                  <input
                    type="checkbox"
                    checked={preferences[cat] !== false}
                    onChange={(e) => {
                      onUpdatePreferences(
                        saveNotificationPreferences({
                          ...preferences,
                          [cat]: e.target.checked,
                        })
                      );
                    }}
                    className="accent-[#E50914]"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Notification Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-[#08121a] py-16 text-center px-4">
              <Sparkles className="w-10 h-10 text-[#b7c9ef]/30 mb-2.5" />
              <p className="text-sm font-bold text-white">لا توجد إشعارات حالياً</p>
              <p className="text-[11px] text-[#b7c9ef] mt-1">
                ستظهر هنا التنبيهات الخاصة بالحلقات والمواسم الجديدة وتنبيهات الإدارة
              </p>
            </div>
          ) : (
            displayed.map((notif) => {
              const read = isNotificationRead(notif, uid, localReadIds);
              const linkedMedia = notif.mediaId
                ? catalog.find((m) => m.id === notif.mediaId)
                : undefined;

              return (
                <div
                  key={notif.id}
                  onClick={() => {
                    onMarkRead(notif.id);
                    if (linkedMedia) {
                      onSelectMedia(linkedMedia);
                    }
                  }}
                  className={`rounded-2xl border p-3.5 transition-all cursor-pointer ${
                    read
                      ? 'bg-[#121e28]/70 border-white/[0.06] opacity-80'
                      : 'bg-[#1a242e] border-[#E50914]/45 shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {!read && <span className="h-2 w-2 rounded-full bg-[#E50914] shrink-0" />}
                      <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-[#f9c400]">
                        {NOTIFICATION_CATEGORY_LABELS[notif.category] || 'تنبيه'}
                      </span>
                    </div>
                    <span className="font-latin text-[10px] text-[#b7c9ef] shrink-0">
                      {new Date(notif.createdAtMs || Date.now()).toLocaleDateString('ar-EG')}
                    </span>
                  </div>
                  <h3 className="text-xs sm:text-sm font-extrabold text-white mt-2">{notif.title}</h3>
                  <p className="text-xs text-[#b7c9ef] mt-1 leading-relaxed">{notif.body}</p>
                  {linkedMedia && (
                    <span className="inline-block mt-2 text-[11px] font-extrabold text-[#4CAF50]">
                      عرض العمل: {linkedMedia.title} ←
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
