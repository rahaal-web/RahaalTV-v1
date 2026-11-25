import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Database,
  Download,
  Edit3,
  ExternalLink,
  History,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Upload,
  WifiOff,
  X,
} from 'lucide-react';
import {
  appendDatabaseConnectionLog,
  buildConnectionBackupBundle,
  BUILTIN_DEFAULT_CONNECTION_ID,
  clearDatabaseConnectionLogs,
  createOrUpdateConnectionProfile,
  deleteConnectionProfile,
  deleteServerSecrets,
  fetchServerSecretStatuses,
  importConnectionBackupBundle,
  loadDatabaseConnectionLogs,
  loadDatabaseRegistry,
  migrateDatabaseContent,
  parseAndValidateConnectionBackup,
  PROVIDER_LABELS_AR,
  rollbackDatabaseConnection,
  saveServerSecrets,
  setDatabaseAutoRetryEnabled,
  setDefaultConnectionProfile,
  subscribeDatabaseRegistryUi,
  switchActiveDatabaseConnection,
  syncActiveDatabasePointerToFirestore,
  syncDatabaseRegistryToFirestore,
  testDatabaseConnection,
} from '../../lib/dbConnectionManager';
import { FirestoreConnectionStatus } from '../../lib/firebase';
import { safeCopyToClipboard } from '../../lib/browserCompat';
import firestoreRulesTemplate from '../../../firestore.rules?raw';
import {
  DatabaseConnectionHealthStatus,
  DatabaseConnectionLogEntry,
  DatabaseConnectionProfile,
  DatabaseConnectionRegistryState,
  DatabaseConnectionTestResult,
  DatabaseMigrationReport,
  DatabaseProviderType,
  DatabaseServerSecretStatus,
} from '../../types/database';
import { ConfirmDialog } from './AdminSharedUi';

interface AdminDatabaseManagerPanelProps {
  user: User | null;
  dbConnectionStatus?: FirestoreConnectionStatus;
  dbConnectionError?: string | null;
  customApiUrl?: string;
  onReconnectDatabase?: () => Promise<void> | void;
  onNotify: (msg: string) => void;
}

const STATUS_BADGE_MAP: Record<
  DatabaseConnectionHealthStatus,
  { label: string; cls: string }
> = {
  connected: {
    label: 'متصل',
    cls: 'bg-[#4CAF50]/20 border-[#4CAF50]/45 text-[#4CAF50]',
  },
  offline: {
    label: 'غير متصل',
    cls: 'bg-[#D92321]/20 border-[#D92321]/50 text-[#ff9f9d]',
  },
  invalid_config: {
    label: 'بيانات غير صحيحة',
    cls: 'bg-[#D92321]/20 border-[#D92321]/50 text-[#ff9f9d]',
  },
  permission_denied: {
    label: 'مشكلة في الصلاحيات',
    cls: 'bg-[#f9c400]/20 border-[#f9c400]/50 text-[#f9c400]',
  },
  timeout: {
    label: 'انتهت مهلة الاتصال',
    cls: 'bg-orange-500/20 border-orange-400/50 text-orange-300',
  },
  quota_exceeded: {
    label: 'تم تجاوز الحصة',
    cls: 'bg-[#f9c400]/20 border-[#f9c400]/50 text-[#f9c400]',
  },
  untested: {
    label: 'بانتظار الاختبار',
    cls: 'bg-white/10 border-white/15 text-[#b7c9ef]',
  },
};

function formatDateTimeAr(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function createEmptyDraft(providerType: DatabaseProviderType = 'firebase_firestore'): {
  id?: string;
  name: string;
  description: string;
  providerType: DatabaseProviderType;
  projectId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  databaseURL: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
  endpointUrl: string;
  healthPath: string;
  authHeaderName: string;
  useWorkerProxy: boolean;
} {
  return {
    name: '',
    description: '',
    providerType,
    projectId: '',
    apiKey: '',
    authDomain: '',
    firestoreDatabaseId: '(default)',
    databaseURL: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
    measurementId: '',
    endpointUrl: '',
    healthPath: '/health',
    authHeaderName: 'Authorization',
    useWorkerProxy: false,
  };
}

function profileToDraft(p: DatabaseConnectionProfile) {
  return {
    id: p.id,
    name: p.name,
    description: p.description || '',
    providerType: p.providerType,
    projectId: p.firebaseConfig.projectId || '',
    apiKey: p.firebaseConfig.apiKey || '',
    authDomain: p.firebaseConfig.authDomain || '',
    firestoreDatabaseId: p.firebaseConfig.firestoreDatabaseId || '(default)',
    databaseURL: p.firebaseConfig.databaseURL || '',
    storageBucket: p.firebaseConfig.storageBucket || '',
    messagingSenderId: p.firebaseConfig.messagingSenderId || '',
    appId: p.firebaseConfig.appId || '',
    measurementId: p.firebaseConfig.measurementId || '',
    endpointUrl: p.customApiConfig?.endpointUrl || '',
    healthPath: p.customApiConfig?.healthPath || '/health',
    authHeaderName: p.customApiConfig?.authHeaderName || 'Authorization',
    useWorkerProxy: Boolean(p.customApiConfig?.useWorkerProxy),
  };
}

function parseSnippetToFirebaseFields(rawSnippet: string): Partial<ReturnType<typeof createEmptyDraft>> | null {
  const text = rawSnippet.trim();
  if (!text) return null;
  const extract = (key: string) => {
    const m = text.match(new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`, 'i'));
    return m?.[1]?.trim() || '';
  };
  const projectId = extract('projectId');
  const apiKey = extract('apiKey');
  const appId = extract('appId');
  if (!projectId && !apiKey && !appId) return null;
  return {
    projectId,
    apiKey,
    authDomain: extract('authDomain') || (projectId ? `${projectId}.firebaseapp.com` : ''),
    firestoreDatabaseId: extract('firestoreDatabaseId') || '(default)',
    databaseURL: extract('databaseURL'),
    storageBucket: extract('storageBucket'),
    messagingSenderId: extract('messagingSenderId'),
    appId,
    measurementId: extract('measurementId'),
  };
}

export function AdminDatabaseManagerPanel({
  user,
  dbConnectionStatus,
  dbConnectionError,
  customApiUrl,
  onReconnectDatabase,
  onNotify,
}: AdminDatabaseManagerPanelProps) {
  const [registry, setRegistry] = useState<DatabaseConnectionRegistryState>(() =>
    loadDatabaseRegistry()
  );
  const [logs, setLogs] = useState<DatabaseConnectionLogEntry[]>(() =>
    loadDatabaseConnectionLogs()
  );
  const [secretStatuses, setSecretStatuses] = useState<
    Record<string, DatabaseServerSecretStatus>
  >({});
  const [vaultNote, setVaultNote] = useState<string>('');
  const [vaultSource, setVaultSource] = useState<'node_vault' | 'cloudflare_kv' | 'none'>('none');

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testWriteMode, setTestWriteMode] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<{
    connectionId: string;
    connectionName: string;
    result: DatabaseConnectionTestResult;
  } | null>(null);

  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  // Add / Edit Form state
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(() => createEmptyDraft());
  const [snippetInput, setSnippetInput] = useState('');
  const [showQuickPaste, setShowQuickPaste] = useState(false);

  // Server Secret Vault form state (only written to server, never stored in browser)
  const [secretTargetId, setSecretTargetId] = useState<string | null>(null);
  const [secretServiceAccount, setSecretServiceAccount] = useState('');
  const [secretPrivateKey, setSecretPrivateKey] = useState('');
  const [secretApiKey, setSecretApiKey] = useState('');
  const [secretCloudflareToken, setSecretCloudflareToken] = useState('');
  const [savingSecrets, setSavingSecrets] = useState(false);

  // Migration state
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [migrationSourceId, setMigrationSourceId] = useState<string>('');
  const [migrationTargetId, setMigrationTargetId] = useState<string>('');
  const [migrating, setMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<{
    message: string;
    done: number;
    total: number;
  } | null>(null);
  const [migrationReport, setMigrationReport] = useState<DatabaseMigrationReport | null>(null);

  // Delete / Switch Confirmations
  const [confirmDeleteProfile, setConfirmDeleteProfile] =
    useState<DatabaseConnectionProfile | null>(null);
  const [confirmSwitchTarget, setConfirmSwitchTarget] =
    useState<DatabaseConnectionProfile | null>(null);
  const [confirmImportBundle, setConfirmImportBundle] = useState<{
    bundle: ReturnType<typeof buildConnectionBackupBundle>;
    checksumMatched: boolean;
  } | null>(null);

  // Logs & Worker guide visibility
  const [logFilter, setLogFilter] = useState<'all' | 'errors' | 'switches'>('all');
  const [showWorkerGuide, setShowWorkerGuide] = useState(false);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  const actor = useMemo(
    () => ({
      uid: user?.uid,
      name: user?.displayName || user?.email || 'Owner',
    }),
    [user]
  );

  useEffect(() => {
    const refresh = () => {
      setRegistry(loadDatabaseRegistry());
      setLogs(loadDatabaseConnectionLogs());
    };
    refresh();
    return subscribeDatabaseRegistryUi(refresh);
  }, []);

  useEffect(() => {
    let active = true;
    void fetchServerSecretStatuses(user).then((res) => {
      if (!active) return;
      setSecretStatuses(res.statuses || {});
      setVaultSource(res.source);
      setVaultNote(res.note || '');
    });
    return () => {
      active = false;
    };
  }, [user, customApiUrl]);

  const activeProfile = useMemo(
    () =>
      registry.profiles.find((p) => p.id === registry.activeConnectionId) ||
      registry.profiles[0],
    [registry]
  );

  const previousProfile = useMemo(
    () =>
      registry.previousConnectionId
        ? registry.profiles.find((p) => p.id === registry.previousConnectionId) || null
        : null,
    [registry]
  );

  const defaultProfile = useMemo(
    () => registry.profiles.find((p) => p.id === registry.defaultConnectionId) || null,
    [registry]
  );

  const effectiveLiveStatus: DatabaseConnectionHealthStatus = useMemo(() => {
    if (dbConnectionStatus === 'quota_exceeded') return 'quota_exceeded';
    if (dbConnectionStatus === 'permission_denied') return 'permission_denied';
    if (dbConnectionStatus === 'offline') return 'offline';
    if (dbConnectionStatus === 'connected') return 'connected';
    return activeProfile?.lastStatus || 'untested';
  }, [dbConnectionStatus, activeProfile?.lastStatus]);

  const filteredLogs = useMemo(() => {
    return logs.filter((entry) => {
      if (logFilter === 'errors') {
        return entry.status === 'error' || entry.event === 'outage';
      }
      if (logFilter === 'switches') {
        return (
          entry.event === 'switch' ||
          entry.event === 'rollback' ||
          entry.event === 'migrate' ||
          entry.event === 'set_default'
        );
      }
      return true;
    });
  }, [logs, logFilter]);

  const buildProfileFromDraft = (): DatabaseConnectionProfile => {
    const existing = draft.id
      ? registry.profiles.find((p) => p.id === draft.id)
      : undefined;
    return {
      id: draft.id || `db_${Date.now()}`,
      name: draft.name.trim() || 'اتصال قاعدة بيانات جديد',
      description: draft.description.trim(),
      providerType: draft.providerType,
      isBuiltIn: existing?.isBuiltIn,
      firebaseConfig: {
        projectId: draft.projectId.trim(),
        apiKey: draft.apiKey.trim(),
        authDomain:
          draft.authDomain.trim() ||
          (draft.projectId.trim() ? `${draft.projectId.trim()}.firebaseapp.com` : ''),
        firestoreDatabaseId: draft.firestoreDatabaseId.trim() || '(default)',
        databaseURL: draft.databaseURL.trim(),
        storageBucket: draft.storageBucket.trim(),
        messagingSenderId: draft.messagingSenderId.trim(),
        appId: draft.appId.trim(),
        measurementId: draft.measurementId.trim(),
      },
      customApiConfig:
        draft.providerType === 'custom_api'
          ? {
              endpointUrl: draft.endpointUrl.trim(),
              healthPath: draft.healthPath.trim() || '/health',
              authHeaderName: draft.authHeaderName.trim() || 'Authorization',
              useWorkerProxy: draft.useWorkerProxy,
            }
          : undefined,
      lastStatus: existing?.lastStatus || 'untested',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const handleRunTest = async (profile: DatabaseConnectionProfile) => {
    setTestingId(profile.id);
    try {
      const result = await testDatabaseConnection(profile, {
        testWrite: testWriteMode,
        actorUid: actor.uid,
        actorName: actor.name,
      });
      setLastTestResult({
        connectionId: profile.id,
        connectionName: profile.name,
        result,
      });
      onNotify(
        result.ok
          ? `نجح اختبار الاتصال بـ "${profile.name}" (${result.latencyMs}ms)`
          : `فشل اختبار "${profile.name}": ${result.statusLabelAr}`
      );
      if (profile.id === activeProfile?.id && result.ok && onReconnectDatabase) {
        await onReconnectDatabase();
      }
    } finally {
      setTestingId(null);
    }
  };

  const syncDbWorkspaceInCloud = async (includeActivePointer = false) => {
    const regRes = await syncDatabaseRegistryToFirestore(user?.uid);
    const ptrRes = includeActivePointer
      ? await syncActiveDatabasePointerToFirestore(user?.uid)
      : null;
    return {
      regOk: regRes.ok,
      ptrOk: ptrRes ? ptrRes.ok : true,
    };
  };

  const handleSaveDraft = async (testFirst: boolean) => {
    if (!draft.name.trim()) {
      onNotify('يرجى إدخال اسم واضح لاتصال قاعدة البيانات.');
      return;
    }
    const built = buildProfileFromDraft();
    if (testFirst) {
      setTestingId(built.id);
      const testRes = await testDatabaseConnection(built, {
        testWrite: testWriteMode,
        actorUid: actor.uid,
        actorName: actor.name,
      });
      setTestingId(null);
      setLastTestResult({
        connectionId: built.id,
        connectionName: built.name,
        result: testRes,
      });
      if (!testRes.ok) {
        onNotify(`تعذر التحقق من الاتصال قبل الحفظ: ${testRes.message}`);
        return;
      }
    }

    const { profile, isNew } = createOrUpdateConnectionProfile(built, actor);
    setEditorOpen(false);
    const cloud = await syncDbWorkspaceInCloud(profile.id === activeProfile?.id);
    const syncNote = !cloud.regOk
      ? ' (محفوظة محلياً — تعذرت مزامنة قائمة القواعد سحابياً)'
      : ' وتمت مزامنتها سحابياً للأجهزة الأخرى';
    onNotify(
      (isNew
        ? `تمت إضافة الاتصال "${profile.name}" إلى القائمة المحفوظة`
        : `تم تحديث بيانات الاتصال "${profile.name}"`) + syncNote
    );
  };

  const handleExecuteSwitch = async (target: DatabaseConnectionProfile) => {
    setConfirmSwitchTarget(null);
    setSwitchingId(target.id);
    try {
      const res = await switchActiveDatabaseConnection(target.id, actor);
      if (res.testResult) {
        setLastTestResult({
          connectionId: target.id,
          connectionName: target.name,
          result: res.testResult,
        });
      }
      if (!res.ok) {
        onNotify(res.error || 'فشل التبديل — تم الإبقاء على القاعدة النشطة الحالية.');
        return;
      }
      const cloud = await syncDbWorkspaceInCloud(true);
      onNotify(
        cloud.regOk && cloud.ptrOk
          ? `تم التبديل الموحد إلى "${target.name}" ومزامنة التحويل لجميع الأجهزة.`
          : `تم التبديل محلياً إلى "${target.name}" — قد تحتاج لتسجيل الدخول في القاعدة الافتراضية أو نشر firestore.rules لمزامنة التبديل مع باقي الأجهزة.`
      );
    } finally {
      setSwitchingId(null);
    }
  };

  const handleRollback = async () => {
    setRollingBack(true);
    try {
      const res = await rollbackDatabaseConnection(actor);
      if (!res.ok) {
        onNotify(res.error || 'لا توجد قاعدة بيانات سابقة متاحة للرجوع.');
        return;
      }
      const cloud = await syncDbWorkspaceInCloud(true);
      onNotify(
        cloud.regOk && cloud.ptrOk
          ? `تم الرجوع الفوري إلى "${res.targetName}" ومزامنته لجميع الأجهزة.`
          : `تم الرجوع الفوري إلى "${res.targetName}" وتحديث اتصالات هذا الجهاز.`
      );
    } finally {
      setRollingBack(false);
    }
  };

  const handleSaveServerSecrets = async () => {
    if (!secretTargetId) return;
    setSavingSecrets(true);
    try {
      const res = await saveServerSecrets(
        secretTargetId,
        {
          serviceAccountJson: secretServiceAccount.trim() || undefined,
          privateKey: secretPrivateKey.trim() || undefined,
          apiSecret: secretApiKey.trim() || undefined,
          cloudflareToken: secretCloudflareToken.trim() || undefined,
        },
        user
      );
      if (!res.ok || !res.status) {
        onNotify(res.error || 'تعذر حفظ الأسرار على السيرفر.');
        return;
      }
      setSecretStatuses((prev) => ({ ...prev, [secretTargetId]: res.status! }));
      // Clear secret inputs immediately so secrets never linger in React state
      setSecretServiceAccount('');
      setSecretPrivateKey('');
      setSecretApiKey('');
      setSecretCloudflareToken('');
      setSecretTargetId(null);
      onNotify('تم حفظ الأسرار في مخزن السيرفر المشفر بنجاح دون تخزينها في المتصفح.');
    } finally {
      setSavingSecrets(false);
    }
  };

  const handleRunMigration = async () => {
    if (!migrationSourceId || !migrationTargetId || migrationSourceId === migrationTargetId) {
      onNotify('يرجى اختيار قاعدة مصدر وقاعدة هدف مختلفتين.');
      return;
    }
    setMigrating(true);
    setMigrationReport(null);
    try {
      const report = await migrateDatabaseContent(
        migrationSourceId,
        migrationTargetId,
        (message, done, total) => setMigrationProgress({ message, done, total }),
        actor
      );
      setMigrationReport(report);
      onNotify(
        report.ok
          ? `اكتمل نقل ${report.totalCopiedDocs} مستند والتحقق من تطابق الأعداد بنجاح.`
          : 'اكتمل النقل مع وجود ملاحظات — راجع جدول التحقق.'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'فشلت عملية نقل البيانات.');
    } finally {
      setMigrating(false);
    }
  };

  const handleExportConfigs = () => {
    const bundle = buildConnectionBackupBundle(actor.name);
    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rahaltv-db-connections-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('تم تصدير نسخة احتياطية لإعدادات الاتصالات (خالية تماماً من أي أسرار).');
  };

  const handleImportFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const parsed = parseAndValidateConnectionBackup(text);
    if (!parsed.valid || !parsed.bundle) {
      onNotify(parsed.error || 'ملف النسخة الاحتياطية غير صالح.');
      return;
    }
    setConfirmImportBundle({
      bundle: parsed.bundle,
      checksumMatched: Boolean(parsed.checksumMatched),
    });
  };

  const openMigrationModal = (targetPrefillId?: string) => {
    setMigrationSourceId(activeProfile?.id || BUILTIN_DEFAULT_CONNECTION_ID);
    const other =
      targetPrefillId ||
      registry.profiles.find((p) => p.id !== activeProfile?.id)?.id ||
      '';
    setMigrationTargetId(other);
    setMigrationReport(null);
    setMigrationProgress(null);
    setMigrationOpen(true);
  };

  const activeBadge = STATUS_BADGE_MAP[effectiveLiveStatus] || STATUS_BADGE_MAP.untested;

  return (
    <div className="space-y-6">
      {/* 1. Active Database Status Hero Card */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 sm:p-6 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-[#D92321]/15 border border-[#D92321]/35 px-3 py-1 text-xs font-extrabold text-[#ff9f9d]">
                <Database className="w-3.5 h-3.5" />
                إدارة قواعد البيانات والاتصال الموحّدة
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-black ${activeBadge.cls}`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    effectiveLiveStatus === 'connected'
                      ? 'bg-[#4CAF50]'
                      : effectiveLiveStatus === 'untested'
                        ? 'bg-[#b7c9ef]'
                        : 'bg-[#D92321] animate-pulse'
                  }`}
                />
                {activeBadge.label}
              </span>
              {activeProfile && (
                <span className="rounded-xl bg-[#1a242e] border border-white/10 px-2.5 py-1 text-[11px] font-bold text-[#f9c400]">
                  {PROVIDER_LABELS_AR[activeProfile.providerType]}
                </span>
              )}
            </div>

            <h2 className="font-display text-lg sm:text-xl font-extrabold text-white">
              {activeProfile?.name || 'قاعدة البيانات النشطة'}
            </h2>
            <p className="text-xs text-[#b7c9ef] leading-relaxed">
              تستخدم جميع أجزاء الموقع (الرئيسية، الأفلام، المسلسلات، المواسم والحلقات، الأعضاء، المفضلة، الطلبات، الإعدادات، والمحولات) مصدر اتصال موحّد واحد بدون تجزئة.
            </p>
          </div>

          {/* Quick Top Action Bar */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={testingId === activeProfile?.id || !activeProfile}
              onClick={() => activeProfile && void handleRunTest(activeProfile)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] disabled:opacity-50 px-4 py-2.5 text-xs font-extrabold text-white cursor-pointer shadow-lg"
            >
              {testingId === activeProfile?.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>اختبار الاتصال (Test)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDraft(createEmptyDraft('firebase_firestore'));
                setSnippetInput('');
                setShowQuickPaste(false);
                setEditorOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#D92321] hover:bg-[#dc0e30] px-4 py-2.5 text-xs font-extrabold text-white cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة قاعدة بيانات</span>
            </button>

            {activeProfile && (
              <button
                type="button"
                onClick={() => {
                  setDraft(profileToDraft(activeProfile));
                  setSnippetInput('');
                  setShowQuickPaste(false);
                  setEditorOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3.5 py-2.5 text-xs font-bold text-white cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-sky-400" />
                <span>تعديل الحالية</span>
              </button>
            )}

            <button
              type="button"
              disabled={rollingBack || (!previousProfile && activeProfile?.id === registry.defaultConnectionId)}
              onClick={() => void handleRollback()}
              title={
                previousProfile
                  ? `رجوع إلى: ${previousProfile.name}`
                  : 'الرجوع إلى القاعدة السابقة أو الافتراضية'
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-[#f9c400]/15 border border-[#f9c400]/35 disabled:opacity-40 px-3.5 py-2.5 text-xs font-extrabold text-[#f9c400] cursor-pointer"
            >
              {rollingBack ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              <span>الرجوع للسابقة</span>
            </button>
          </div>
        </div>

        {/* Technical Strip + Outage / Resilience Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-white/10">
          <div className="rounded-2xl bg-[#1a242e]/70 border border-white/[0.06] p-3.5 space-y-1">
            <span className="text-[11px] font-bold text-[#b7c9ef]">المشروع والقاعدة النشطة</span>
            <p className="font-latin text-xs font-bold text-white truncate" dir="ltr">
              {activeProfile?.firebaseConfig.projectId || '—'}
            </p>
            <p className="font-latin text-[10px] text-[#f9c400] truncate" dir="ltr">
              DB: {activeProfile?.firebaseConfig.firestoreDatabaseId || '(default)'}
            </p>
          </div>

          <div className="rounded-2xl bg-[#1a242e]/70 border border-white/[0.06] p-3.5 space-y-1">
            <span className="text-[11px] font-bold text-[#b7c9ef]">الاستجابة وآخر اتصال ناجح</span>
            <p className="text-xs font-extrabold text-white">
              {activeProfile?.lastLatencyMs ? `${activeProfile.lastLatencyMs} ms` : 'لم يُقَس بعد'}
            </p>
            <p className="text-[10px] text-[#4CAF50] truncate">
              متصل: {formatDateTimeAr(activeProfile?.lastConnectedAt)}
            </p>
          </div>

          <div className="rounded-2xl bg-[#1a242e]/70 border border-white/[0.06] p-3.5 space-y-1">
            <span className="text-[11px] font-bold text-[#b7c9ef]">الافتراضية / آخر انقطاع</span>
            <p className="text-xs font-extrabold text-white truncate">
              {defaultProfile?.name || 'المدمجة'}
            </p>
            <p className="text-[10px] text-[#ff9f9d] truncate">
              آخر انقطاع: {formatDateTimeAr(activeProfile?.lastDisconnectedAt)}
            </p>
          </div>

          <div className="rounded-2xl bg-[#1a242e]/70 border border-white/[0.06] p-3.5 flex flex-col justify-between gap-2">
            <label className="flex items-center justify-between gap-2 text-xs font-bold text-white cursor-pointer">
              <span>إعادة محاولة تلقائية عند الانقطاع</span>
              <input
                type="checkbox"
                checked={registry.autoRetryEnabled}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setDatabaseAutoRetryEnabled(enabled);
                  void syncDbWorkspaceInCloud(false);
                  onNotify(
                    enabled
                      ? 'تم تفعيل إعادة المحاولة التلقائية عند الانقطاع المؤقت.'
                      : 'تم إيقاف إعادة المحاولة التلقائية.'
                  );
                }}
                className="h-4 w-4 accent-[#4CAF50] cursor-pointer"
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#b7c9ef] cursor-pointer">
              <span>فحص القراءة والكتابة معاً</span>
              <input
                type="checkbox"
                checked={testWriteMode}
                onChange={(e) => setTestWriteMode(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#f9c400] cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Active Outage Warning */}
        {effectiveLiveStatus !== 'connected' && effectiveLiveStatus !== 'untested' && (
          <div className="rounded-2xl bg-[#D92321]/15 border border-[#D92321]/45 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-xs text-red-100">
              <WifiOff className="w-4 h-4 text-[#ff8a88] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-extrabold text-white">
                  تنبيه انقطاع أو تقييد الاتصال بالقاعدة النشطة
                </p>
                <p className="text-[11px] text-white/85">
                  {dbConnectionError || activeProfile?.lastStatusMessage || 'تعذر الوصول إلى قاعدة البيانات.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {previousProfile && (
                <button
                  type="button"
                  onClick={() => void handleRollback()}
                  className="rounded-xl bg-[#f9c400] hover:bg-[#dfb20b] px-3.5 py-2 text-xs font-black text-[#06131c] cursor-pointer"
                >
                  الرجوع فوراً إلى {previousProfile.name}
                </button>
              )}
              {onReconnectDatabase && (
                <button
                  type="button"
                  onClick={() => void onReconnectDatabase()}
                  className="rounded-xl bg-white/15 hover:bg-white/25 px-3.5 py-2 text-xs font-extrabold text-white cursor-pointer"
                >
                  إعادة الاتصال الآن
                </button>
              )}
            </div>
          </div>
        )}

        {/* Secondary Tools Strip: Migrate, Backup/Restore, Worker KV Guide */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openMigrationModal()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-sky-500/20 border border-sky-400/35 px-3.5 py-2 text-xs font-extrabold text-sky-300 cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>نقل البيانات والتحقق (Migration)</span>
            </button>

            <button
              type="button"
              onClick={handleExportConfigs}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-bold text-white cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#4CAF50]" />
              <span>تصدير إعدادات الاتصال</span>
            </button>

            <button
              type="button"
              onClick={() => backupFileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-bold text-white cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-[#f9c400]" />
              <span>استيراد إعدادات الاتصال</span>
            </button>
            <button
              type="button"
              onClick={() => {
                void safeCopyToClipboard(firestoreRulesTemplate);
                onNotify('تم نسخ قواعد الأمان (firestore.rules) — الصقها في تبويب Rules بقاعدتك الجديدة ثم اضغط Publish');
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-bold text-white cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-[#f9c400]" />
              <span>نسخ قواعد الأمان (firestore.rules)</span>
            </button>
            <input
              ref={backupFileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void handleImportFileChange(e)}
              className="hidden"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowWorkerGuide((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#b7c9ef] hover:text-[#f9c400] cursor-pointer"
          >
            <Server className="w-3.5 h-3.5" />
            <span>دليل مخزن الأسرار (Server & Cloudflare Worker)</span>
            {showWorkerGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showWorkerGuide && (
          <div className="rounded-2xl bg-[#06131c] border border-white/10 p-4 space-y-2 text-xs text-[#b7c9ef] leading-relaxed">
            <p className="font-extrabold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#f9c400]" />
              كيف يعمل تخزين الأسرار الآمن وحماية الاستضافة؟
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                ملفات الاتصال العامة (<span className="font-latin text-white">Project ID / API Key / DB ID</span>) تُحفظ خارج قاعدة البيانات الأساسية لتبقى لوحة التحكم قابلة للإصلاح حتى لو تعطلت القاعدة.
              </li>
              <li>
                الأسرار الحساسة (<span className="font-latin text-white">Service Account JSON, Private Keys, API Secrets</span>) لا تُحفظ إطلاقاً في المتصفح ولا في <span className="font-latin text-white">localStorage</span>، بل تُرسل مشفرة عبر <span className="font-latin text-white">POST /api/db/secrets</span> إلى خزنة السيرفر أو Cloudflare Worker.
              </li>
              <li>
                عند النشر على Cloudflare Workers: أضف ربط KV باسم <span className="font-latin text-[#f9c400]">DB_CONFIG_KV</span> وأضف سر <span className="font-latin text-[#f9c400]">FIREBASE_WEB_API_KEY</span> في إعدادات Worker لحماية جميع نقاط الأسرار بالتحقق الفعلي من توكن Firebase للمالك فقط.
              </li>
            </ul>
            {vaultNote && (
              <p className="text-[11px] font-bold text-[#f9c400] pt-1">
                حالة مخزن الأسرار الحالي ({vaultSource}): {vaultNote}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 2. Live Test Result Breakdown (when run) */}
      {lastTestResult && (
        <div
          className={`rounded-3xl border p-5 space-y-3 ${
            lastTestResult.result.ok
              ? 'bg-[#0c1821] border-[#4CAF50]/40'
              : 'bg-[#0c1821] border-[#D92321]/50'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {lastTestResult.result.ok ? (
                <CheckCircle2 className="w-5 h-5 text-[#4CAF50]" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-[#ff8a88]" />
              )}
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  نتيجة اختبار الاتصال: {lastTestResult.connectionName} —{' '}
                  <span className={lastTestResult.result.ok ? 'text-[#4CAF50]' : 'text-[#ff8a88]'}>
                    {lastTestResult.result.statusLabelAr}
                  </span>
                </h3>
                <p className="text-xs text-[#b7c9ef] mt-0.5">{lastTestResult.result.message}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-latin rounded-lg bg-[#1a242e] px-2.5 py-1 text-xs font-bold text-[#f9c400] tabular-nums">
                {lastTestResult.result.latencyMs} ms
              </span>
              <button
                type="button"
                onClick={() => setLastTestResult(null)}
                aria-label="إغلاق نتيجة الاختبار"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {lastTestResult.result.steps.map((st, idx) => (
              <div
                key={`${st.step}-${idx}`}
                className={`rounded-2xl border p-3 text-xs space-y-1 ${
                  st.ok
                    ? 'bg-[#4CAF50]/[0.07] border-[#4CAF50]/30'
                    : 'bg-[#D92321]/10 border-[#D92321]/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2 font-extrabold text-white">
                  <span>{st.label}</span>
                  <span className={st.ok ? 'text-[#4CAF50]' : 'text-[#ff8a88]'}>
                    {st.ok ? 'ناجح' : 'فشل'}
                  </span>
                </div>
                <p className="text-[11px] text-[#b7c9ef] leading-relaxed">{st.detail}</p>
              </div>
            ))}
          </div>

          {lastTestResult.result.rawError && (
            <div className="rounded-xl bg-[#06131c] border border-white/10 p-3 flex items-center justify-between gap-3">
              <code className="font-latin text-[11px] text-[#ff9f9d] break-all" dir="ltr">
                {lastTestResult.result.rawError}
              </code>
              <button
                type="button"
                onClick={() => {
                  void safeCopyToClipboard(lastTestResult.result.rawError || '');
                  onNotify('تم نسخ نص الخطأ التشخيصي.');
                }}
                className="shrink-0 rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {!lastTestResult.result.ok &&
            lastTestResult.result.status === 'permission_denied' &&
            (() => {
              const testedProfile = registry.profiles.find(
                (p) => p.id === lastTestResult.connectionId
              );
              if (!testedProfile || testedProfile.providerType !== 'firebase_firestore') {
                return null;
              }
              const targetProjId = testedProfile.firebaseConfig.projectId;
              return (
                <div className="rounded-2xl bg-[#f9c400]/10 border border-[#f9c400]/40 p-4 space-y-2.5 text-xs text-amber-100">
                  <p className="font-extrabold text-[#f9c400]">
                    كيف تصلح مشكلة الصلاحيات وتفعّل قاعدة {targetProjId} في خطوتين؟
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed text-white/90">
                    <li>
                      انسخ قواعد الأمان الكاملة من الزر أدناه والصقها في{' '}
                      <span className="font-latin text-white">Firestore Database → Rules</span> داخل مشروعك في Firebase Console ثم اضغط <strong className="text-white">Publish</strong>.
                    </li>
                    <li>
                      فعّل <span className="font-latin text-white">Google</span> و<span className="font-latin text-white">Email/Password</span> من <span className="font-latin text-white">Authentication → Sign-in method</span> وأضف نطاق الموقع في <span className="font-latin text-white">Authorized domains</span>.
                    </li>
                  </ol>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        void safeCopyToClipboard(firestoreRulesTemplate);
                        onNotify('تم نسخ محتوى firestore.rules بنجاح — الصقه في Firebase Console واضغط Publish');
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#f9c400] hover:bg-[#dfb20b] px-3.5 py-2 text-xs font-black text-[#06131c] cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ firestore.rules</span>
                    </button>
                    <a
                      href={`https://console.firebase.google.com/project/${targetProjId}/firestore/rules`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/15 border border-white/15 px-3.5 py-2 text-xs font-bold text-white"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-[#f9c400]" />
                      <span>فتح صفحة Rules في Firebase</span>
                    </a>
                    <a
                      href={`https://console.firebase.google.com/project/${targetProjId}/authentication/providers`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/15 border border-white/15 px-3.5 py-2 text-xs font-bold text-white"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-sky-300" />
                      <span>إعدادات تسجيل الدخول (Auth)</span>
                    </a>
                    <button
                      type="button"
                      disabled={testingId !== null}
                      onClick={() => void handleRunTest(testedProfile)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#4CAF50] hover:bg-emerald-600 px-3.5 py-2 text-xs font-extrabold text-white cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>إعادة اختبار الاتصال الآن</span>
                    </button>
                  </div>
                </div>
              );
            })()}
        </div>
      )}

      {/* 3. Dynamic Add / Edit Connection Panel */}
      {editorOpen && (
        <div className="rounded-3xl bg-[#0c1821] border border-[#f9c400]/35 p-5 sm:p-6 space-y-5 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <h3 className="font-display text-base font-extrabold text-white">
                {draft.id ? 'تعديل إعدادات قاعدة البيانات' : 'إضافة قاعدة بيانات جديدة'}
              </h3>
              <p className="text-xs text-[#b7c9ef] mt-0.5">
                تتغير حقول الاتصال تلقائياً حسب نوع قاعدة البيانات المختار.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowQuickPaste((s) => !s)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-[#f9c400]/15 border border-[#f9c400]/35 px-3 py-1.5 text-xs font-bold text-[#f9c400] cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>لصق كود firebaseConfig تلقائياً</span>
              </button>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {showQuickPaste && (
            <div className="rounded-2xl bg-[#1a242e] border border-[#f9c400]/30 p-4 space-y-2.5">
              <p className="text-xs font-bold text-[#f9c400]">
                الصق كائن firebaseConfig أو JSON من Firebase Console وسيتم تعبئة الحقول تلقائياً:
              </p>
              <textarea
                rows={4}
                dir="ltr"
                value={snippetInput}
                onChange={(e) => setSnippetInput(e.target.value)}
                placeholder={'{\n  "apiKey": "...",\n  "authDomain": "...",\n  "projectId": "...",\n  "appId": "..."\n}'}
                className="w-full rounded-xl bg-[#06131c] border border-white/10 p-3 font-latin text-xs text-white focus:border-[#f9c400] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const parsed = parseSnippetToFirebaseFields(snippetInput);
                  if (!parsed) {
                    onNotify('لم يتم التعرف على حقول Firebase صالحة داخل النص.');
                    return;
                  }
                  setDraft((prev) => ({ ...prev, ...parsed }));
                  setShowQuickPaste(false);
                  onNotify('تم استخراج وتعبئة بيانات Firebase بنجاح.');
                }}
                className="rounded-xl bg-[#f9c400] hover:bg-[#dfb20b] px-4 py-2 text-xs font-black text-[#06131c] cursor-pointer"
              >
                استخراج وتعبئة الحقول
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                اسم الاتصال (وصفي للإدارة) *
              </label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="مثال: قاعدة الإنتاج الاحتياطية"
                className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-xs font-bold text-white focus:border-[#D92321] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                نوع قاعدة البيانات *
              </label>
              <select
                value={draft.providerType}
                onChange={(e) =>
                  setDraft({ ...draft, providerType: e.target.value as DatabaseProviderType })
                }
                className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none cursor-pointer"
              >
                <option value="firebase_firestore" className="bg-[#0c1821]">
                  Firebase Firestore (الأساسي للموقع)
                </option>
                <option value="firebase_realtime" className="bg-[#0c1821]">
                  Firebase Realtime Database
                </option>
                <option value="custom_api" className="bg-[#0c1821]">
                  خادم API / نقطة خارجية مخصصة
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                ملاحظة / وصف مختصر
              </label>
              <input
                type="text"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="بيئة الإنتاج / بيئة الاختبار..."
                className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-xs text-white focus:border-[#D92321] focus:outline-none"
              />
            </div>
          </div>

          {/* Dynamic Fields: Firebase Firestore OR Firebase Realtime DB */}
          {(draft.providerType === 'firebase_firestore' ||
            draft.providerType === 'firebase_realtime') && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 border-t border-white/10">
              <div>
                <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                  Project ID *
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={draft.projectId}
                  onChange={(e) => {
                    const projectId = e.target.value;
                    setDraft((prev) => ({
                      ...prev,
                      projectId,
                      authDomain:
                        !prev.authDomain ||
                        prev.authDomain === `${prev.projectId}.firebaseapp.com`
                          ? projectId
                            ? `${projectId}.firebaseapp.com`
                            : ''
                          : prev.authDomain,
                    }));
                  }}
                  placeholder="my-firebase-project"
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 font-latin text-xs text-white focus:border-[#D92321] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                  API Key *
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={draft.apiKey}
                  onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                  placeholder="AIzaSy..."
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 font-latin text-xs text-white focus:border-[#D92321] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                  Auth Domain *
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={draft.authDomain}
                  onChange={(e) => setDraft({ ...draft, authDomain: e.target.value })}
                  placeholder="my-project.firebaseapp.com"
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 font-latin text-xs text-white focus:border-[#D92321] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                  App ID *
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={draft.appId}
                  onChange={(e) => setDraft({ ...draft, appId: e.target.value })}
                  placeholder="1:123456789:web:abcdef"
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 font-latin text-xs text-white focus:border-[#D92321] focus:outline-none"
                />
              </div>

              {draft.providerType === 'firebase_firestore' && (
                <div>
                  <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                    Firestore Database ID *
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={draft.firestoreDatabaseId}
                    onChange={(e) =>
                      setDraft({ ...draft, firestoreDatabaseId: e.target.value })
                    }
                    placeholder="(default) أو اسم القاعدة"
                    className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 font-latin text-xs text-white focus:border-[#D92321] focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                  Database URL {draft.providerType === 'firebase_realtime' ? '*' : '(اختياري)'}
                </label>
                <input
                  type="url"
                  dir="ltr"
                  value={draft.databaseURL}
                  onChange={(e) => setDraft({ ...draft, databaseURL: e.target.value })}
                  placeholder="https://my-project-default-rtdb.firebaseio.com"
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 font-latin text-xs text-white focus:border-[#D92321] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                  Storage Bucket (اختياري)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={draft.storageBucket}
                  onChange={(e) => setDraft({ ...draft, storageBucket: e.target.value })}
                  placeholder="my-project.firebasestorage.app"
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 font-latin text-xs text-white focus:border-[#D92321] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                  Messaging Sender ID (اختياري)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={draft.messagingSenderId}
                  onChange={(e) => setDraft({ ...draft, messagingSenderId: e.target.value })}
                  placeholder="1234567890"
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 font-latin text-xs text-white focus:border-[#D92321] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                  Measurement ID (اختياري)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={draft.measurementId}
                  onChange={(e) => setDraft({ ...draft, measurementId: e.target.value })}
                  placeholder="G-XXXXXXXXXX"
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 font-latin text-xs text-white focus:border-[#D92321] focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Dynamic Fields: Custom API */}
          {draft.providerType === 'custom_api' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-white/10">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                  Endpoint Base URL *
                </label>
                <input
                  type="url"
                  dir="ltr"
                  value={draft.endpointUrl}
                  onChange={(e) => setDraft({ ...draft, endpointUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 font-latin text-xs text-white focus:border-[#D92321] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                  Health Check Path
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={draft.healthPath}
                  onChange={(e) => setDraft({ ...draft, healthPath: e.target.value })}
                  placeholder="/health"
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 font-latin text-xs text-white focus:border-[#D92321] focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-4 py-2.5 text-xs font-bold text-[#b7c9ef] cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => void handleSaveDraft(false)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/15 px-4 py-2.5 text-xs font-extrabold text-white cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-[#f9c400]" />
              <span>حفظ الإعداد فقط</span>
            </button>
            <button
              type="button"
              disabled={testingId !== null}
              onClick={() => void handleSaveDraft(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] disabled:opacity-50 px-5 py-2.5 text-xs font-extrabold text-white cursor-pointer"
            >
              {testingId !== null ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
              <span>اختبار الاتصال ثم الحفظ</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. Server Secret Vault Drawer */}
      {secretTargetId && (
        <div className="rounded-3xl bg-[#0c1821] border border-amber-400/35 p-5 sm:p-6 space-y-4 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-[#f9c400]" />
              <div>
                <h3 className="font-display text-base font-extrabold text-white">
                  مخزن الأسرار الآمن على السيرفر (Server Secret Vault)
                </h3>
                <p className="text-xs text-[#b7c9ef]">
                  تُرسل هذه الأسرار إلى السيرفر/Worker مباشرة ولا تُخزن أو تُعرض في المتصفح مطلقاً.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSecretTargetId(null)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                Firebase Service Account JSON (سري على السيرفر فقط)
              </label>
              <textarea
                rows={4}
                dir="ltr"
                value={secretServiceAccount}
                onChange={(e) => setSecretServiceAccount(e.target.value)}
                placeholder='{"type": "service_account", "project_id": "...", "private_key": "...", "client_email": "..."}'
                className="w-full rounded-xl bg-[#06131c] border border-white/10 p-3 font-latin text-xs text-white focus:border-[#f9c400] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                Private Key / كلمة مرور أو مفتاح سري إضافي
              </label>
              <input
                type="password"
                dir="ltr"
                autoComplete="new-password"
                value={secretPrivateKey}
                onChange={(e) => setSecretPrivateKey(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 font-latin text-xs text-white focus:border-[#f9c400] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                API Secret / Cloudflare API Token (اختياري)
              </label>
              <input
                type="password"
                dir="ltr"
                autoComplete="new-password"
                value={secretCloudflareToken || secretApiKey}
                onChange={(e) => {
                  setSecretApiKey(e.target.value);
                  setSecretCloudflareToken(e.target.value);
                }}
                placeholder="••••••••••••"
                className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 font-latin text-xs text-white focus:border-[#f9c400] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setSecretTargetId(null)}
              className="rounded-xl bg-[#1a242e] border border-white/10 px-4 py-2 text-xs font-bold text-[#b7c9ef] cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={savingSecrets}
              onClick={() => void handleSaveServerSecrets()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#f9c400] hover:bg-[#dfb20b] disabled:opacity-50 px-5 py-2 text-xs font-black text-[#06131c] cursor-pointer"
            >
              {savingSecrets ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
              <span>تشفير وحفظ على السيرفر</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. Saved Connections List */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <h3 className="font-display text-base font-extrabold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#f9c400]" />
              <span>قائمة الاتصالات المحفوظة ({registry.profiles.length})</span>
            </h3>
            <p className="text-xs text-[#b7c9ef] mt-0.5">
              لا يتم استبدال القاعدة النشطة أبداً إلا بعد نجاح اختبار الاتصال الفعلي، ولا تُحذف الإعدادات القديمة تلقائياً.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {registry.profiles.map((profile) => {
            const isActive = profile.id === registry.activeConnectionId;
            const isDefault = profile.id === registry.defaultConnectionId;
            const isPrevious = profile.id === registry.previousConnectionId;
            const badge =
              isActive && effectiveLiveStatus !== 'untested'
                ? STATUS_BADGE_MAP[effectiveLiveStatus]
                : STATUS_BADGE_MAP[profile.lastStatus] || STATUS_BADGE_MAP.untested;
            const sec = secretStatuses[profile.id];
            const hasSecrets = Boolean(
              sec?.hasServiceAccount ||
                sec?.hasPrivateKey ||
                sec?.hasApiSecret ||
                sec?.hasCloudflareToken
            );

            return (
              <div
                key={profile.id}
                className={`rounded-2xl border p-4 transition-colors ${
                  isActive
                    ? 'bg-[#4CAF50]/[0.07] border-[#4CAF50]/40'
                    : 'bg-[#1a242e]/65 border-white/[0.08]'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-extrabold text-white">{profile.name}</h4>
                      {isActive && (
                        <span className="rounded-md bg-[#4CAF50] px-2 py-0.5 text-[10px] font-black text-white">
                          نشطة الآن
                        </span>
                      )}
                      {isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#f9c400]/20 border border-[#f9c400]/45 px-2 py-0.5 text-[10px] font-black text-[#f9c400]">
                          <Star className="w-2.5 h-2.5" />
                          الافتراضية
                        </span>
                      )}
                      {isPrevious && !isActive && (
                        <span className="rounded-md bg-sky-500/15 border border-sky-400/35 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                          القاعدة السابقة
                        </span>
                      )}
                      {profile.isBuiltIn && (
                        <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold text-[#b7c9ef]">
                          احتياطية مدمجة
                        </span>
                      )}
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-black ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#b7c9ef]">
                      <span className="font-bold text-white/90">
                        {PROVIDER_LABELS_AR[profile.providerType]}
                      </span>
                      {profile.providerType !== 'custom_api' ? (
                        <span className="font-latin text-[#b7c9ef]" dir="ltr">
                          {profile.firebaseConfig.projectId} •{' '}
                          {profile.firebaseConfig.firestoreDatabaseId || '(default)'}
                        </span>
                      ) : (
                        <span className="font-latin text-[#b7c9ef]" dir="ltr">
                          {profile.customApiConfig?.endpointUrl}
                        </span>
                      )}
                      {typeof profile.lastLatencyMs === 'number' && (
                        <span className="font-latin text-[#f9c400] tabular-nums">
                          {profile.lastLatencyMs}ms
                        </span>
                      )}
                      {hasSecrets && (
                        <span className="inline-flex items-center gap-1 text-[#4CAF50] font-bold">
                          <Lock className="w-3 h-3" />
                          أسرار السيرفر: {sec?.serviceAccountClientEmail || 'محفوظة ومشفرة'}
                        </span>
                      )}
                    </div>

                    {profile.description && (
                      <p className="text-[11px] text-[#b7c9ef]/80">{profile.description}</p>
                    )}
                    {profile.lastStatusMessage && (
                      <p className="text-[11px] text-white/75">{profile.lastStatusMessage}</p>
                    )}
                  </div>

                  {/* Per-connection Actions */}
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={testingId === profile.id}
                      onClick={() => void handleRunTest(profile)}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#0c1821] hover:bg-[#4CAF50]/20 border border-white/10 hover:border-[#4CAF50]/45 px-3 py-2 text-xs font-bold text-white cursor-pointer"
                    >
                      {testingId === profile.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Activity className="w-3.5 h-3.5 text-[#4CAF50]" />
                      )}
                      <span>اختبار</span>
                    </button>

                    {!isActive && profile.providerType === 'firebase_firestore' && (
                      <button
                        type="button"
                        disabled={switchingId === profile.id}
                        onClick={() => setConfirmSwitchTarget(profile)}
                        className="inline-flex items-center gap-1 rounded-xl bg-[#D92321] hover:bg-[#dc0e30] disabled:opacity-50 px-3.5 py-2 text-xs font-extrabold text-white cursor-pointer"
                      >
                        {switchingId === profile.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        <span>تفعيل واستخدام</span>
                      </button>
                    )}

                    {!isDefault && (
                      <button
                        type="button"
                        onClick={() => {
                          const r = setDefaultConnectionProfile(profile.id, actor);
                          if (r.ok) {
                            void syncDbWorkspaceInCloud(false);
                            onNotify(`تم تعيين "${profile.name}" كقاعدة بيانات افتراضية.`);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-xl bg-[#0c1821] hover:bg-[#f9c400]/15 border border-white/10 px-3 py-2 text-xs font-bold text-[#f9c400] cursor-pointer"
                      >
                        <Star className="w-3.5 h-3.5" />
                        <span>افتراضية</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setSecretTargetId(profile.id)}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#0c1821] hover:bg-white/10 border border-white/10 px-3 py-2 text-xs font-bold text-[#b7c9ef] hover:text-white cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-[#f9c400]" />
                      <span>الأسرار</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDraft(profileToDraft(profile));
                        setSnippetInput('');
                        setShowQuickPaste(false);
                        setEditorOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#0c1821] hover:bg-white/10 border border-white/10 px-3 py-2 text-xs font-bold text-white cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-sky-400" />
                      <span>تعديل</span>
                    </button>

                    {!isActive && !isDefault && !profile.isBuiltIn && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteProfile(profile)}
                        aria-label={`حذف ${profile.name}`}
                        className="inline-flex items-center justify-center rounded-xl bg-[#0c1821] hover:bg-[#D92321] border border-white/10 px-2.5 py-2 text-xs font-bold text-[#ff8a88] hover:text-white cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. Cross-Database Migration & Verification Panel */}
      {migrationOpen && (
        <div className="rounded-3xl bg-[#0c1821] border border-sky-400/35 p-5 sm:p-6 space-y-4 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-sky-400" />
              <div>
                <h3 className="font-display text-base font-extrabold text-white">
                  نقل البيانات والتحقق قبل التبديل (Zero-Loss Migration)
                </h3>
                <p className="text-xs text-[#b7c9ef]">
                  ينسخ المحتوى والإعدادات والمحولات والتقييمات والطلبات بأمان من المصدر إلى القاعدة المستهدفة دون حذف أي بيانات من المصدر.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMigrationOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                قاعدة المصدر (قراءة فقط)
              </label>
              <select
                value={migrationSourceId}
                onChange={(e) => setMigrationSourceId(e.target.value)}
                className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-xs font-bold text-white"
              >
                {registry.profiles
                  .filter((p) => p.providerType === 'firebase_firestore')
                  .map((p) => (
                    <option key={p.id} value={p.id} className="bg-[#0c1821]">
                      {p.name} ({p.firebaseConfig.projectId})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                القاعدة الهدف (نسخ + تحقق)
              </label>
              <select
                value={migrationTargetId}
                onChange={(e) => setMigrationTargetId(e.target.value)}
                className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-xs font-bold text-white"
              >
                <option value="" className="bg-[#0c1821]">
                  — اختر قاعدة الهدف —
                </option>
                {registry.profiles
                  .filter(
                    (p) => p.providerType === 'firebase_firestore' && p.id !== migrationSourceId
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id} className="bg-[#0c1821]">
                      {p.name} ({p.firebaseConfig.projectId})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {migrationProgress && (
            <div className="rounded-2xl bg-[#1a242e] border border-white/10 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span>{migrationProgress.message}</span>
                <span className="font-latin text-[#f9c400] tabular-nums">
                  {migrationProgress.done}/{migrationProgress.total}
                </span>
              </div>
              <div className="h-2 rounded-full bg-[#06131c] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#4CAF50] transition-all"
                  style={{
                    width: `${Math.round(
                      (migrationProgress.done / Math.max(1, migrationProgress.total)) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {migrationReport && (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#1a242e] text-[11px] font-extrabold text-[#b7c9ef]">
                    <tr>
                      <th className="py-2.5 px-3">المجموعة</th>
                      <th className="py-2.5 px-3">المصدر</th>
                      <th className="py-2.5 px-3">المنقول</th>
                      <th className="py-2.5 px-3">الهدف بعد النقل</th>
                      <th className="py-2.5 px-3">التحقق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {migrationReport.collections.map((row) => (
                      <tr key={row.collection}>
                        <td className="py-2.5 px-3 font-bold text-white">{row.labelAr}</td>
                        <td className="py-2.5 px-3 font-latin text-[#b7c9ef] tabular-nums">
                          {row.sourceCount}
                        </td>
                        <td className="py-2.5 px-3 font-latin text-sky-300 tabular-nums">
                          {row.copiedCount}
                        </td>
                        <td className="py-2.5 px-3 font-latin text-white tabular-nums">
                          {row.targetAfterCount}
                        </td>
                        <td className="py-2.5 px-3">
                          {row.verified ? (
                            <span className="rounded bg-[#4CAF50]/20 px-2 py-0.5 text-[10px] font-black text-[#4CAF50]">
                              متطابق
                            </span>
                          ) : (
                            <span className="rounded bg-[#D92321]/20 px-2 py-0.5 text-[10px] font-black text-[#ff9f9d]">
                              {row.warning || 'يحتاج مراجعة'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {migrationReport.ok && migrationTargetId !== registry.activeConnectionId && (
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#4CAF50]/15 border border-[#4CAF50]/40 p-3.5">
                  <span className="text-xs font-extrabold text-[#4CAF50]">
                    تم التحقق من سلامة نقل جميع المجموعات بنجاح! يمكنك التبديل الآن بأمان.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const tgt = registry.profiles.find((p) => p.id === migrationTargetId);
                      if (tgt) setConfirmSwitchTarget(tgt);
                    }}
                    className="rounded-xl bg-[#4CAF50] hover:bg-[#43a047] px-4 py-2 text-xs font-extrabold text-white cursor-pointer"
                  >
                    تفعيل القاعدة الجديدة الآن
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={migrating || !migrationTargetId}
              onClick={() => void handleRunMigration()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 px-5 py-2.5 text-xs font-black text-[#06131c] cursor-pointer"
            >
              {migrating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowLeftRight className="w-4 h-4" />
              )}
              <span>بدء النسخ والتحقق من العدّ</span>
            </button>
          </div>
        </div>
      )}

      {/* 7. Connection Operations & Error Audit Log */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <h3 className="font-display text-base font-extrabold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-[#f9c400]" />
              <span>سجل الاتصال والأخطاء وتدقيق التبديلات ({logs.length})</span>
            </h3>
            <p className="text-xs text-[#b7c9ef] mt-0.5">
              توثيق فوري لكل عملية اختبار اتصال، تبديل، رجوع، انقطاع مؤقت، إعادة محاولة، أو تحديث أسرار.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'all', label: 'الكل' },
                { id: 'errors', label: 'الانقطاعات والأخطاء' },
                { id: 'switches', label: 'التبديل والترحيل' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setLogFilter(f.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${
                  logFilter === f.id
                    ? 'bg-[#f9c400] text-[#06131c]'
                    : 'bg-[#1a242e] text-[#b7c9ef] hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}

            {logs.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  clearDatabaseConnectionLogs();
                  appendDatabaseConnectionLog({
                    event: 'update',
                    connectionId: activeProfile?.id || BUILTIN_DEFAULT_CONNECTION_ID,
                    connectionName: activeProfile?.name || 'System',
                    status: 'info',
                    actorUid: actor.uid,
                    actorName: actor.name,
                    message: 'تم تنظيف سجل اتصالات قواعد البيانات.',
                  });
                  onNotify('تم مسح سجل الاتصالات.');
                }}
                className="rounded-lg bg-[#1a242e] hover:bg-[#D92321]/20 border border-white/10 px-3 py-1.5 text-xs font-bold text-[#ff9f9d] cursor-pointer"
              >
                مسح السجل
              </button>
            )}
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <p className="rounded-2xl bg-[#1a242e]/50 border border-white/[0.06] p-5 text-center text-xs text-[#b7c9ef]">
            لا توجد سجلات اتصال مطابقة للفلتر الحالي.
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {filteredLogs.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl bg-[#1a242e]/65 border border-white/[0.06] px-4 py-3 text-xs space-y-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-black ${
                        entry.status === 'success'
                          ? 'bg-[#4CAF50]/20 text-[#4CAF50]'
                          : entry.status === 'error'
                            ? 'bg-[#D92321]/20 text-[#ff9f9d]'
                            : entry.status === 'warning'
                              ? 'bg-[#f9c400]/20 text-[#f9c400]'
                              : 'bg-sky-500/20 text-sky-300'
                      }`}
                    >
                      {entry.event}
                    </span>
                    <span className="font-extrabold text-white">{entry.connectionName}</span>
                    {entry.actorName && (
                      <span className="text-[10px] text-[#b7c9ef]">
                        بواسطة: {entry.actorName}
                      </span>
                    )}
                    {typeof entry.latencyMs === 'number' && (
                      <span className="font-latin text-[10px] text-[#f9c400] tabular-nums">
                        {entry.latencyMs}ms
                      </span>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] text-[#b7c9ef]">
                    <Clock className="w-3 h-3" />
                    {formatDateTimeAr(entry.timestamp)}
                  </span>
                </div>
                <p className="text-white/90 leading-relaxed">{entry.message}</p>
                {entry.rawError && (
                  <p className="font-latin text-[10px] text-[#ff9f9d] truncate" dir="ltr">
                    {entry.rawError}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmations */}
      <ConfirmDialog
        isOpen={Boolean(confirmDeleteProfile)}
        title={`حذف إعداد الاتصال "${confirmDeleteProfile?.name || ''}"؟`}
        description="سيتم حذف ملف الاتصال من القائمة المحفوظة ومسح أي أسرار مرتبطة به على السيرفر. لن تتأثر القاعدة النشطة الحالية."
        confirmLabel="نعم، احذف الإعداد"
        danger
        onConfirm={async () => {
          if (!confirmDeleteProfile) return;
          const res = deleteConnectionProfile(confirmDeleteProfile.id, actor);
          if (res.ok) {
            await deleteServerSecrets(confirmDeleteProfile.id, user);
            await syncDbWorkspaceInCloud(false);
            onNotify(`تم حذف إعداد الاتصال "${confirmDeleteProfile.name}".`);
          } else {
            onNotify(res.error || 'تعذر حذف إعداد الاتصال.');
          }
          setConfirmDeleteProfile(null);
        }}
        onCancel={() => setConfirmDeleteProfile(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(confirmSwitchTarget)}
        title={`تأكيد التبديل الموحد إلى "${confirmSwitchTarget?.name || ''}"؟`}
        description={
          confirmSwitchTarget &&
          confirmSwitchTarget.firebaseConfig.projectId !== activeProfile?.firebaseConfig.projectId
            ? 'ملاحظة مهمة: سيتم اختبار الاتصال أولاً، وبما أن Project ID مختلف فقد يُطلب منك إعادة تسجيل الدخول في المشروع الجديد بعد التفعيل. لن يتم حذف أي بيانات من القاعدة القديمة.'
            : 'سيتم إجراء اختبار اتصال حي أولاً، وإذا نجح سيتم تحويل جميع أجزاء الموقع ولوحة الإدارة إلى هذه القاعدة فوراً مع إمكانية الرجوع للسابقة في أي وقت.'
        }
        confirmLabel="اختبار ثم تفعيل الآن"
        onConfirm={() => confirmSwitchTarget && void handleExecuteSwitch(confirmSwitchTarget)}
        onCancel={() => setConfirmSwitchTarget(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(confirmImportBundle)}
        title={`استيراد ${confirmImportBundle?.bundle.profiles.length || 0} إعداد اتصال؟`}
        description={
          confirmImportBundle?.checksumMatched
            ? 'البصمة سليمة (FNV-1a Verified). سيتم دمج الاتصالات المستوردة مع قائمتك الحالية دون تغيير القاعدة النشطة الحالية حتى تختبرها يدوياً.'
            : 'تنبيه: بصمة الملف لا تطابق (قد يكون الملف معدّلاً يدوياً). هل تريد الاستيراد بالدمج مع الإبقاء على اتصالك النشط آمناً؟'
        }
        confirmLabel="استيراد ودمج بأمان"
        onConfirm={async () => {
          if (!confirmImportBundle) return;
          importConnectionBackupBundle(confirmImportBundle.bundle, 'merge', actor);
          const cloud = await syncDbWorkspaceInCloud(false);
          setConfirmImportBundle(null);
          onNotify(
            cloud.regOk
              ? 'تم استيراد إعدادات الاتصالات ودمجها ومزامنتها سحابياً.'
              : 'تم استيراد إعدادات الاتصالات ودمجها محلياً.'
          );
        }}
        onCancel={() => setConfirmImportBundle(null)}
      />
    </div>
  );
}
