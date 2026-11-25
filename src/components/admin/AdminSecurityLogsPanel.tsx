import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  History,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  getActiveFirebaseConfig,
  RulesDiagnosticReport,
} from '../../lib/firebase';
import firestoreRulesSource from '../../../firestore.rules?raw';
import {
  AdminActivityLogEntry,
  clearActivityLog,
  loadActivityLog,
  subscribeActivityLogsFromFirestore,
} from '../../lib/adminAssistantDb';
import {
  clearClientErrorLogs,
  ClientErrorRecord,
  loadClientErrorLogs,
} from '../../lib/adminPreferences';
import { safeCopyToClipboard } from '../../lib/browserCompat';
import { AdminActivityLog } from '../AdminActivityLog';

export type { RulesDiagnosticReport };

interface AdminSecurityLogsPanelProps {
  mode: 'security_rules' | 'audit_logs';
  onNotify: (msg: string) => void;
  onRunRulesDiagnostic?: () => Promise<RulesDiagnosticReport>;
}

export function AdminSecurityLogsPanel({
  mode,
  onNotify,
  onRunRulesDiagnostic,
}: AdminSecurityLogsPanelProps) {
  const [activityLogs, setActivityLogs] = useState<AdminActivityLogEntry[]>(() =>
    loadActivityLog()
  );
  const [syncMode, setSyncMode] = useState<'firestore+local' | 'local'>('local');
  const [clientErrors, setClientErrors] = useState<ClientErrorRecord[]>(() =>
    loadClientErrorLogs()
  );
  const [subView, setSubView] = useState<'admin' | 'client'>('admin');
  const [runningDiagnostic, setRunningDiagnostic] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<RulesDiagnosticReport | null>(null);

  useEffect(() => {
    if (mode !== 'audit_logs') return;
    setClientErrors(loadClientErrorLogs());
    const unsub = subscribeActivityLogsFromFirestore(
      (entries) => setActivityLogs(entries),
      (st) => setSyncMode(st)
    );
    return () => unsub();
  }, [mode]);

  const activeFirebaseConfig = getActiveFirebaseConfig();
  const activeDbId = activeFirebaseConfig.firestoreDatabaseId || '(default)';
  const consoleDbSegment = activeDbId === '(default)' ? '-default-' : encodeURIComponent(activeDbId);
  const rulesLineCount = firestoreRulesSource.split('\n').length;

  const handleTestRulesNow = async () => {
    if (!onRunRulesDiagnostic) return;
    setRunningDiagnostic(true);
    try {
      const report = await onRunRulesDiagnostic();
      setDiagnosticReport(report);
      if (report.ok) {
        const allSynced =
          report.result.rejectedSections.length === 0 &&
          report.syncedImagePlaceholdersToCloud &&
          report.recentlyWatchedReady &&
          report.recentlyWatchedUiReady &&
          report.heroSliderModeReady &&
          report.streamV4SliderReady;
        if (allSynced) {
          onNotify(
            'قواعد firestore.rules المنشورة مطابقة بالكامل لجميع أقسام الإعدادات والسلايدر الرابع وشريط شاهدته مؤخراً!'
          );
        } else if (report.outdatedRulesDetected) {
          onNotify(
            `القواعد المنشورة على (${report.result.projectId}/${report.result.databaseId}) ما زالت تفتقد بعض القواعد الحديثة — راجع تفاصيل التشخيص أدناه.`
          );
        } else {
          const missingList = [
            ...report.result.rejectedSections,
            ...(!report.syncedImagePlaceholdersToCloud ? ['settings/image_placeholders'] : []),
            ...(!report.recentlyWatchedReady ? ['recently_watched'] : []),
            ...(!report.recentlyWatchedUiReady ? ['settings/recently_watched_ui'] : []),
            ...(!report.heroSliderModeReady ? ['settings/hero_slider_mode'] : []),
            ...(!report.streamV4SliderReady ? ['settings/stream_v4_slider'] : []),
          ];
          onNotify(
            `بعض الأقسام مرفوضة من قواعد Firebase (${missingList.join(', ')}) — راجع نتيجة الفحص أدناه.`
          );
        }
      } else {
        onNotify(report.errorMessage);
      }
    } finally {
      setRunningDiagnostic(false);
    }
  };

  const handleDownloadRulesFile = () => {
    try {
      const blob = new Blob([firestoreRulesSource], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'firestore.rules';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onNotify(`تم تنزيل ملف firestore.rules (${rulesLineCount} سطراً)!`);
    } catch {
      onNotify('تعذر تنزيل الملف — استخدم زر النسخ أعلاه.');
    }
  };

  if (mode === 'security_rules') {
    const allReportSynced =
      diagnosticReport?.ok &&
      diagnosticReport.result.rejectedSections.length === 0 &&
      diagnosticReport.syncedImagePlaceholdersToCloud &&
      diagnosticReport.recentlyWatchedReady &&
      diagnosticReport.recentlyWatchedUiReady &&
      diagnosticReport.heroSliderModeReady &&
      diagnosticReport.streamV4SliderReady;

    return (
      <div className="space-y-6">
        <div className="rounded-3xl bg-[#0c1821] border border-[#f9c400]/25 p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1 flex-1 min-w-[240px]">
              <h2 className="font-display text-lg font-extrabold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#f9c400]" />
                <span>قواعد أمان Firestore المطلوبة للمنصة</span>
              </h2>
              <p className="text-xs leading-relaxed text-[#b7c9ef]">
                تحمي هذه القواعد جميع مجموعات قاعدة البيانات (
                <span className="font-latin text-white">
                  media, settings, settings/image_placeholders, settings/recently_watched_ui, recently_watched, admins, admin_activity_logs, admin_workspace, scraper_adapters, fonts, requests, users, ratings
                </span>
                ) لمشروع{' '}
                <span className="font-latin text-[#f9c400]">{activeFirebaseConfig.projectId}</span>{' '}
                وقاعدة البيانات{' '}
                <span className="font-latin text-[#f9c400]">{activeDbId}</span>{' '}
                ({rulesLineCount} سطراً).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onRunRulesDiagnostic && (
                <button
                  type="button"
                  disabled={runningDiagnostic}
                  onClick={() => void handleTestRulesNow()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#4CAF50] hover:bg-emerald-600 disabled:opacity-50 px-4 py-2.5 text-xs font-black text-white cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${runningDiagnostic ? 'animate-spin' : ''}`} />
                  <span>{runningDiagnostic ? 'جاري الفحص...' : 'فحص تطابق القواعد الآن'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  const ok = await safeCopyToClipboard(firestoreRulesSource);
                  onNotify(
                    ok
                      ? `تم نسخ قواعد firestore.rules الكاملة (${rulesLineCount} سطراً) إلى الحافظة!`
                      : 'تعذر النسخ التلقائي — انسخ القواعد من الصندوق أدناه.'
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#f9c400] hover:bg-[#dfb20b] px-4 py-2.5 text-xs font-black text-[#06131c] cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ قواعد firestore.rules</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadRulesFile}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-3.5 py-2.5 text-xs font-extrabold text-white cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#f9c400]" />
                <span>تحميل الملف</span>
              </button>
              <a
                href={`https://console.firebase.google.com/project/${activeFirebaseConfig.projectId}/firestore/databases/${consoleDbSegment}/rules`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2.5 text-xs font-extrabold text-white"
              >
                <span>فتح محرر Rules في {activeFirebaseConfig.projectId}</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#f9c400]" />
              </a>
            </div>
          </div>

          {diagnosticReport && (
            <div
              className={`rounded-2xl border p-4 space-y-3 text-xs ${
                allReportSynced
                  ? 'bg-[#4CAF50]/10 border-[#4CAF50]/40 text-emerald-100'
                  : 'bg-[#f9c400]/10 border-[#f9c400]/40 text-amber-100'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-extrabold text-white">
                  نتيجة الفحص الفعلي لـ{' '}
                  <span className="font-latin text-[#f9c400]">
                    {diagnosticReport.ok
                      ? `${diagnosticReport.result.projectId} / ${diagnosticReport.result.databaseId}`
                      : `${diagnosticReport.projectId} / ${diagnosticReport.databaseId}`}
                  </span>
                </p>
                <span className="font-latin text-[11px] text-[#b7c9ef]">
                  {diagnosticReport.userEmail || 'بدون بريد'} ·{' '}
                  {diagnosticReport.emailVerified ? 'email_verified=true' : 'email_verified=false'}
                </span>
              </div>

              {diagnosticReport.ok ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    <div
                      className={`rounded-xl border px-3 py-2 flex items-center justify-between gap-2 ${
                        diagnosticReport.result.syncedHomeToCloud
                          ? 'bg-[#4CAF50]/15 border-[#4CAF50]/40 text-white'
                          : diagnosticReport.homeConfigMode === 'autoplay_only' ||
                              diagnosticReport.homeConfigMode === 'core_only'
                            ? 'bg-[#f9c400]/15 border-[#f9c400]/45 text-[#fde68a]'
                            : 'bg-[#D92321]/15 border-[#D92321]/45 text-[#ffb4b2]'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <span className="font-bold block">تخطيط الرئيسية والسلايدر</span>
                        {diagnosticReport.result.syncedHomeToCloud &&
                          diagnosticReport.homeConfigMode === 'split_sync' && (
                            <span className="text-[10px] text-emerald-200/90 block">
                              مزامنة مزدوجة مستقرة (23 + 19 حقلاً منفصلاً)
                            </span>
                          )}
                        {!diagnosticReport.result.syncedHomeToCloud &&
                          (diagnosticReport.homeConfigMode === 'autoplay_only' ||
                            diagnosticReport.homeConfigMode === 'core_only') && (
                            <span className="text-[10px] opacity-90 block">
                              {diagnosticReport.homeConfigMode === 'autoplay_only'
                                ? 'يقبل 23 حقلاً قديماً فقط — يرفض 19 حقل السلايدر الجديدة'
                                : 'يقبل 15 حقلاً أساسياً فقط — يرفض خصائص السلايدر'}
                            </span>
                          )}
                      </div>
                      {diagnosticReport.result.syncedHomeToCloud ? (
                        <CheckCircle2 className="w-4 h-4 text-[#4CAF50] shrink-0" />
                      ) : diagnosticReport.homeConfigMode === 'autoplay_only' ||
                        diagnosticReport.homeConfigMode === 'core_only' ? (
                        <AlertTriangle className="w-4 h-4 text-[#f9c400] shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[#ff8a88] shrink-0" />
                      )}
                    </div>

                    {(
                      [
                        {
                          key: 'typography',
                          label: 'الخطوط وأحجام النصوص',
                          ok: diagnosticReport.result.syncedTypographyToCloud,
                        },
                        {
                          key: 'popupShield',
                          label: 'درع النوافذ (Popup Shield)',
                          ok: diagnosticReport.result.syncedPopupShieldToCloud,
                        },
                        {
                          key: 'branding',
                          label: 'هوية الموقع (Branding)',
                          ok: diagnosticReport.result.syncedBrandingToCloud,
                        },
                        {
                          key: 'imagePlaceholders',
                          label: 'الخلفيات المؤقتة للصور (Placeholders)',
                          sub: diagnosticReport.syncedImagePlaceholdersToCloud
                            ? 'settings/image_placeholders'
                            : `مرفوض (${diagnosticReport.imagePlaceholdersErrorCode || 'permission-denied'})`,
                          ok: diagnosticReport.syncedImagePlaceholdersToCloud,
                        },
                        {
                          key: 'recentlyWatched',
                          label: 'سجل شاهدته مؤخراً (Recently Watched)',
                          sub: diagnosticReport.recentlyWatchedReady
                            ? 'recently_watched جاهز'
                            : 'قواعد recently_watched غير منشورة',
                          ok: diagnosticReport.recentlyWatchedReady,
                        },
                        {
                          key: 'recentlyWatchedUi',
                          label: 'تخطيط شريط شاهدته مؤخراً (Carousel UI)',
                          sub: diagnosticReport.recentlyWatchedUiReady
                            ? 'settings/recently_watched_ui جاهز'
                            : `مرفوض (${diagnosticReport.recentlyWatchedUiErrorCode || 'permission-denied'})`,
                          ok: diagnosticReport.recentlyWatchedUiReady,
                        },
                        {
                          key: 'heroSliderMode',
                          label: 'نمط السلايدر النشط (Hero Mode)',
                          sub: diagnosticReport.heroSliderModeReady
                            ? 'settings/hero_slider_mode جاهز'
                            : `مرفوض (${diagnosticReport.heroSliderModeErrorCode || 'permission-denied'})`,
                          ok: diagnosticReport.heroSliderModeReady,
                        },
                        {
                          key: 'streamV4Slider',
                          label: 'إعدادات السلايدر الرابع (Stream V4)',
                          sub: diagnosticReport.streamV4SliderReady
                            ? 'settings/stream_v4_slider جاهز'
                            : `مرفوض (${diagnosticReport.streamV4SliderErrorCode || 'permission-denied'})`,
                          ok: diagnosticReport.streamV4SliderReady,
                        },
                      ] as Array<{ key: string; label: string; sub?: string; ok: boolean }>
                    ).map((row) => (
                      <div
                        key={row.key}
                        className={`rounded-xl border px-3 py-2 flex items-center justify-between gap-2 ${
                          row.ok
                            ? 'bg-[#4CAF50]/15 border-[#4CAF50]/40 text-white'
                            : 'bg-[#D92321]/15 border-[#D92321]/45 text-[#ffb4b2]'
                        }`}
                      >
                        <div className="space-y-0.5 min-w-0">
                          <span className="font-bold block">{row.label}</span>
                          {row.sub && (
                            <span className="font-latin text-[10px] opacity-85 block truncate" dir="ltr">
                              {row.sub}
                            </span>
                          )}
                        </div>
                        {row.ok ? (
                          <CheckCircle2 className="w-4 h-4 text-[#4CAF50] shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-[#ff8a88] shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>

                  {diagnosticReport.homeComplexityLimitDetected && (
                    <div className="rounded-xl bg-[#D92321]/15 border border-[#D92321]/45 p-3.5 space-y-2 text-[#ffd8d7]">
                      <p className="font-extrabold text-white flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-[#f9c400] shrink-0" />
                        <span>
                          تم تحديد السبب بدقة: القاعدة الحالية في Firebase ترفض اجتماع الـ 42 حقلاً في مستند واحد وتحتاج إلى تفعيل قواعد المستندات المنفصلة!
                        </span>
                      </p>
                      <p className="text-[11px] leading-relaxed">
                        تحتوي النسخة الجديدة من <span className="font-latin text-[#f9c400]">firestore.rules</span> ({rulesLineCount} سطراً) على مستندات منفصلة خفيفة (<span className="font-latin text-white">settings/home_layout</span> و<span className="font-latin text-white">settings/slider_style</span> و<span className="font-latin text-white">settings/site_branding</span> و<span className="font-latin text-white">settings/image_placeholders</span>) لتجاوز هذا الحد بالكامل. انسخ النسخة الجديدة والصقها في محرر Firebase ثم اضغط <strong className="text-white">Publish / نشر</strong> وبعدها أعد الضغط على «فحص تطابق القواعد الآن».
                      </p>
                    </div>
                  )}

                  {diagnosticReport.outdatedRulesDetected && (
                    <div className="rounded-xl bg-[#D92321]/15 border border-[#D92321]/45 p-3.5 space-y-2 text-[#ffd8d7]">
                      <p className="font-extrabold text-white flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-[#f9c400] shrink-0" />
                        <span>
                          التشخيص المؤكد: القواعد الفعالة على{' '}
                          <span className="font-latin text-[#f9c400]">
                            {diagnosticReport.result.projectId} / {diagnosticReport.result.databaseId}
                          </span>{' '}
                          لا تطابق أحدث <span className="font-latin">firestore.rules</span>!
                        </span>
                      </p>
                      {diagnosticReport.rejectedHomeKeys.length > 0 && (
                        <div className="rounded-lg bg-black/30 border border-white/10 p-2.5 space-y-1">
                          <p className="text-[11px] font-bold text-[#fde68a]">
                            الحقول المرفوضة تحديداً من القاعدة النشطة حالياً ({diagnosticReport.rejectedHomeKeys.length} حقل):
                          </p>
                          <p className="font-latin text-[11px] text-white break-words" dir="ltr">
                            {diagnosticReport.rejectedHomeKeys.join(', ')}
                          </p>
                        </div>
                      )}
                      {!diagnosticReport.syncedImagePlaceholdersToCloud && (
                        <div className="rounded-lg bg-black/30 border border-white/10 p-2.5 space-y-1">
                          <p className="text-[11px] font-bold text-[#fde68a]">
                            رفض فعلي على <span className="font-latin">settings/image_placeholders</span>:
                          </p>
                          <p className="font-latin text-[11px] text-white break-words" dir="ltr">
                            {diagnosticReport.imagePlaceholdersErrorCode || 'permission-denied'}
                            {diagnosticReport.imagePlaceholdersErrorMessage
                              ? ` — ${diagnosticReport.imagePlaceholdersErrorMessage}`
                              : ''}
                          </p>
                        </div>
                      )}
                      {!diagnosticReport.recentlyWatchedUiReady && (
                        <div className="rounded-lg bg-black/30 border border-white/10 p-2.5 space-y-1">
                          <p className="text-[11px] font-bold text-[#fde68a]">
                            رفض فعلي على <span className="font-latin">settings/recently_watched_ui</span>:
                          </p>
                          <p className="font-latin text-[11px] text-white break-words" dir="ltr">
                            {diagnosticReport.recentlyWatchedUiErrorCode || 'permission-denied'}
                            {diagnosticReport.recentlyWatchedUiErrorMessage
                              ? ` — ${diagnosticReport.recentlyWatchedUiErrorMessage}`
                              : ''}
                          </p>
                        </div>
                      )}
                      <p className="text-[11px] leading-relaxed">
                        {!diagnosticReport.syncedImagePlaceholdersToCloud ||
                        !diagnosticReport.recentlyWatchedReady ||
                        !diagnosticReport.recentlyWatchedUiReady ||
                        !diagnosticReport.heroSliderModeReady ||
                        !diagnosticReport.streamV4SliderReady
                          ? `القواعد المنشورة على Firebase حالياً تسمح بالإعدادات الأساسية، لكنها ما زالت تحتاج نشر التحديث الأخير لـ (${[
                              !diagnosticReport.syncedImagePlaceholdersToCloud ? 'settings/image_placeholders' : '',
                              !diagnosticReport.recentlyWatchedReady ? 'recently_watched' : '',
                              !diagnosticReport.recentlyWatchedUiReady ? 'settings/recently_watched_ui' : '',
                              !diagnosticReport.heroSliderModeReady ? 'settings/hero_slider_mode' : '',
                              !diagnosticReport.streamV4SliderReady ? 'settings/stream_v4_slider' : '',
                            ]
                              .filter(Boolean)
                              .join(' و ')}) — انسخ النص الكامل الحالي (${rulesLineCount} سطراً) واضغط Publish في Firebase Console.`
                          : diagnosticReport.rejectedHomeKeys.length > 0 &&
                              diagnosticReport.rejectedHomeKeys.length <= 5
                            ? 'القاعدة النشطة في Firebase قريبة من التحديث الأخير لكنها ما زالت تفتقد هذه الحقول من التحديث الأخير لـ homeConfig.'
                            : diagnosticReport.homeConfigMode === 'autoplay_only' ||
                                diagnosticReport.homeConfigMode === 'core_only'
                              ? 'القاعدة قبلت الحقول القديمة من homeConfig لكنها رفضت خصائص السلايدر الجديدة — وهذا يثبت أن دالة isValidHomeConfig في Firebase ما زالت بنسخة أقدم من الملف الكامل.'
                              : 'القاعدة قبلت الخطوط ودرع النوافذ لكنها رفضت homeConfig و/أو branding.'}
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-[11px] text-white/90">
                        <li>
                          افتح الرابط المباشر عبر زر{' '}
                          <strong className="text-[#f9c400]">
                            فتح محرر Rules في {diagnosticReport.result.projectId}
                          </strong>{' '}
                          أعلاه وتأكد أن رابط المتصفح هو{' '}
                          <span className="font-latin text-[#f9c400]">
                            /project/{diagnosticReport.result.projectId}/firestore/databases/{consoleDbSegment}/rules
                          </span>.
                        </li>
                        <li>
                          اضغط زر <strong className="text-white">نسخ قواعد firestore.rules</strong> أعلاه، ثم في المحرر اضغط{' '}
                          <span className="font-latin">Ctrl+A</span> ثم{' '}
                          <span className="font-latin">Ctrl+V</span> وتأكد أن نهاية النص تصل إلى السطر{' '}
                          <span className="font-latin text-[#f9c400]">{rulesLineCount}</span>، ثم اضغط{' '}
                          <strong className="text-white">Publish / نشر</strong>.
                        </li>
                      </ul>
                    </div>
                  )}

                  {diagnosticReport.payloadIssueDetected && (
                    <div className="rounded-xl bg-[#f9c400]/15 border border-[#f9c400]/45 p-3 text-[11px] text-[#fde68a]">
                      القواعد نفسها تدعم جميع الحقول الافتراضية، لكن قيمة حالية في نموذج التخطيط أو الهوية تجاوزت أحد الحدود (مثل طول نص أو رابط طويل). جرّب إعادة ضبط الحقول الطويلة ثم الحفظ مجدداً.
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[#ffb4b2] font-bold">{diagnosticReport.errorMessage}</p>
              )}
            </div>
          )}

          <ol className="list-decimal list-inside space-y-1.5 text-xs text-[#b7c9ef] bg-[#1a242e]/65 border border-white/5 rounded-2xl p-4">
            <li>
              اضغط على زر &quot;نسخ قواعد firestore.rules&quot; أعلاه ثم حدد كل النص داخل محرر Firebase واستبدله بالكامل (Ctrl+A ثم Ctrl+V).
            </li>
            <li>
              تأكد أنك في مشروع{' '}
              <span className="font-latin text-[#f9c400]">{activeFirebaseConfig.projectId}</span>{' '}
              وداخل قسم <strong className="text-white">Firestore Database</strong> وقاعدة{' '}
              <span className="font-latin text-[#f9c400]">{activeDbId}</span>{' '}
              وليس قاعدة أخرى أو مشروعاً آخر.
            </li>
            <li>
              تأكد من الضغط على زر <strong className="text-white">Publish / نشر</strong> في أعلى محرر Firebase Console (اللصق فقط بدون Publish لا يفعّل القواعد)، ثم اضغط &quot;فحص تطابق القواعد الآن&quot;.
            </li>
          </ol>

          <pre
            dir="ltr"
            className="max-h-96 overflow-auto rounded-2xl bg-[#06131c] border border-white/10 p-4 text-[11px] font-latin text-[#b7c9ef] leading-relaxed"
          >
            {firestoreRulesSource}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-extrabold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-[#f9c400]" />
            <span>سجل نشاطات الإدارة وأخطاء العميل</span>
          </h2>
          <p className="text-xs text-[#b7c9ef] mt-1">
            مراقبة جميع عمليات النشر والتعديل والحذف الإدارية، بالإضافة إلى أخطاء التشغيل المرصودة على المتصفح.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 rounded-xl bg-[#1a242e] p-1 border border-white/10">
          <button
            type="button"
            onClick={() => setSubView('admin')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-extrabold cursor-pointer ${
              subView === 'admin' ? 'bg-[#D92321] text-white' : 'text-[#b7c9ef]'
            }`}
          >
            سجل الإدارة ({activityLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setSubView('client')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-extrabold cursor-pointer ${
              subView === 'client' ? 'bg-[#D92321] text-white' : 'text-[#b7c9ef]'
            }`}
          >
            أخطاء المتصفح ({clientErrors.length})
          </button>
        </div>
      </div>

      {subView === 'admin' ? (
        <AdminActivityLog
          logs={activityLogs}
          syncMode={syncMode}
          onClearLogs={async () => {
            const cleared = await clearActivityLog(true);
            setActivityLogs(cleared);
            onNotify('تم مسح سجل العمليات الإدارية.');
          }}
        />
      ) : (
        <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-sm font-extrabold text-white flex items-center gap-2">
              <Bug className="w-4 h-4 text-[#ff8a88]" />
              <span>سجل أخطاء المتصفح والعميل المحلية ({clientErrors.length})</span>
            </h3>
            {clientErrors.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  clearClientErrorLogs();
                  setClientErrors([]);
                  onNotify('تم مسح سجل أخطاء المتصفح المحلية.');
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#D92321]/15 hover:bg-[#D92321] border border-[#D92321]/40 px-3 py-1.5 text-xs font-bold text-[#ff9f9d] hover:text-white cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تنظيف السجل</span>
              </button>
            )}
          </div>

          {clientErrors.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 py-12 text-center text-xs text-[#b7c9ef]">
              لم تُسجل أي أخطاء غير معالجة في جلسات هذا المتصفح.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {clientErrors.map((err) => (
                <div
                  key={err.id}
                  className="rounded-2xl bg-[#1a242e]/70 border border-white/[0.08] p-3.5 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#ff9f9d]">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span className="font-latin">{err.scope}</span>
                    </span>
                    <span className="font-latin text-[10px] text-[#b7c9ef]">
                      {new Date(err.createdAt).toLocaleString('ar-EG')}
                    </span>
                  </div>
                  <p className="font-latin text-xs text-white break-words" dir="ltr">
                    {err.message}
                  </p>
                  {err.stack && (
                    <pre
                      dir="ltr"
                      className="max-h-24 overflow-auto rounded-lg bg-[#06131c] p-2 text-[10px] font-latin text-[#b7c9ef]/80"
                    >
                      {err.stack}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
