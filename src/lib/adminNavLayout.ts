import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  ADMIN_NAV_GROUPS,
  AdminNavGroup,
  AdminNavItem,
  AdminTab,
  findAdminNavItem,
  isTabAccessible,
} from '../components/admin/adminNavigation';
import type { ModeratorSubPermissions } from './adminPreferences';
import { reportClientError } from './clientLogger';
import { getActiveDb } from './dbConnectionManager';

export const ADMIN_NAV_LAYOUT_STORAGE_KEY = 'rahaltv_admin_nav_layout_v1';
export const ADMIN_NAV_LAYOUT_VERSION = 1;

export interface AdminSubOptionDef {
  id: string;
  label: string;
}

// Configurable internal sub-options per Admin section/page.
export const ADMIN_SECTION_SUB_OPTIONS: Partial<Record<AdminTab, AdminSubOptionDef[]>> = {
  overview: [
    { id: 'kpis', label: 'مؤشرات الأداء الرئيسية' },
    { id: 'quick_actions', label: 'الإجراءات السريعة' },
    { id: 'recent_catalog', label: 'أحدث الأعمال المضافة' },
    { id: 'pending_requests', label: 'الطلبات المعلّقة' },
  ],
  catalog: [
    { id: 'search_filters', label: 'البحث والفلترة حسب النوع' },
    { id: 'bulk_toolbar', label: 'شريط التحديد والحذف الجماعي' },
    { id: 'catalog_table', label: 'جدول الأعمال الرئيسي' },
  ],
  database_manager: [
    { id: 'connections', label: 'ملفات اتصال قواعد البيانات' },
    { id: 'test_diagnostics', label: 'اختبار الاتصال والتشخيص' },
    { id: 'secrets_vault', label: 'مخزن الأسرار الآمن' },
    { id: 'migration', label: 'الترحيل والنسخ الاحتياطي' },
    { id: 'connection_logs', label: 'سجل أحداث الاتصال' },
  ],
  website_branding: [
    { id: 'logo_settings', label: 'إعدادات الشعار والمقاس والتموضع' },
    { id: 'site_name_typography', label: 'اسم الموقع والخط واللون' },
    { id: 'favicon_settings', label: 'أيقونة المتصفح (Favicon)' },
    { id: 'live_branding_preview', label: 'المعاينة المباشرة للهوية' },
  ],
  slider_customization: [
    { id: 'description_controls', label: 'إظهار/إخفاء الوصف وعدد السطور' },
    { id: 'slider_typography', label: 'أحجام الخطوط والمحاذاة والتموضع' },
    { id: 'slider_elements', label: 'عناصر الشارة والتقييم والأزرار' },
    { id: 'slider_live_preview', label: 'المعاينة المباشرة للسلايدر' },
  ],
  admin_appearance: [
    { id: 'eye_comfort_modes', label: 'أوضاع راحة العين (Dark/Light/Soft Gray/Eye)' },
    { id: 'palette_controls', label: 'ألوان الخلفية والبطاقات والقائمة والنصوص' },
    { id: 'contrast_spacing', label: 'التباين والسطوع والظلال والمسافات' },
    { id: 'font_family', label: 'الخطوط والخط المخصص' },
    { id: 'font_sizes', label: 'أحجام الخطوط التفصيلية (px)' },
    { id: 'live_preview', label: 'صندوق المعاينة الحية' },
  ],
  settings: [
    { id: 'identity', label: 'اسم الموقع والوصف' },
    { id: 'ticker', label: 'شريط الأخبار العاجلة' },
    { id: 'maintenance', label: 'وضع الصيانة' },
    { id: 'worker_proxy', label: 'إعدادات Cloudflare Worker والبروكسي' },
  ],
  display_modes: [
    { id: 'tv_mode', label: 'وضع Android TV / Google TV' },
    { id: 'low_spec', label: 'وضع الأجهزة الضعيفة' },
    { id: 'diagnostics', label: 'تشخيص قدرات المتصفح' },
  ],
};

export interface AdminNavLayoutItemEntry {
  id: AdminTab;
  hidden?: boolean;
  subOptionsOrder?: string[];
}

export interface AdminNavLayoutGroup {
  id: string;
  label: string;
  isCustom?: boolean;
  items: AdminNavLayoutItemEntry[];
}

export interface AdminNavLayoutConfig {
  version: number;
  groups: AdminNavLayoutGroup[];
  pinnedTabs?: AdminTab[];
  updatedAt?: string;
}

export function buildDefaultAdminNavLayout(): AdminNavLayoutConfig {
  return {
    version: ADMIN_NAV_LAYOUT_VERSION,
    groups: ADMIN_NAV_GROUPS.map((group) => ({
      id: group.id,
      label: group.label,
      isCustom: false,
      items: group.items.map((item) => {
        const subDefs = ADMIN_SECTION_SUB_OPTIONS[item.id];
        return {
          id: item.id,
          hidden: false,
          ...(subDefs ? { subOptionsOrder: subDefs.map((s) => s.id) } : {}),
        };
      }),
    })),
    pinnedTabs: [],
  };
}

function normalizeSubOptionsOrder(tabId: AdminTab, rawOrder: unknown): string[] | undefined {
  const defs = ADMIN_SECTION_SUB_OPTIONS[tabId];
  if (!defs || defs.length === 0) return undefined;
  const canonicalIds = defs.map((d) => d.id);
  const canonicalSet = new Set(canonicalIds);
  const seen = new Set<string>();
  const clean: string[] = [];

  if (Array.isArray(rawOrder)) {
    for (const entry of rawOrder) {
      if (typeof entry === 'string' && canonicalSet.has(entry) && !seen.has(entry)) {
        seen.add(entry);
        clean.push(entry);
      }
    }
  }
  for (const id of canonicalIds) {
    if (!seen.has(id)) {
      seen.add(id);
      clean.push(id);
    }
  }
  return clean;
}

/**
 * Normalizes and reconciles any saved AdminNavLayoutConfig against canonical ADMIN_NAV_GROUPS.
 * - Preserves group order, custom groups, renamed group labels, item order across groups, hidden flags, and sub-option ordering.
 * - Guarantees every canonical AdminTab exists exactly once (auto-adds newly introduced tabs into their canonical group).
 * - Drops invalid/unknown tab IDs safely.
 */
export function normalizeAdminNavLayout(
  raw?: Partial<AdminNavLayoutConfig> | null
): AdminNavLayoutConfig {
  const fallback = buildDefaultAdminNavLayout();
  if (!raw || !Array.isArray(raw.groups) || raw.groups.length === 0) {
    return fallback;
  }

  const canonicalGroupIds = new Set(ADMIN_NAV_GROUPS.map((g) => g.id as string));
  const canonicalTabSet = new Set<AdminTab>(
    ADMIN_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id))
  );

  const seenGroups = new Set<string>();
  const seenTabs = new Set<AdminTab>();
  const normalizedGroups: AdminNavLayoutGroup[] = [];

  for (const rawGrp of raw.groups) {
    if (!rawGrp || typeof rawGrp !== 'object') continue;
    const rawId = typeof rawGrp.id === 'string' ? rawGrp.id.trim().slice(0, 80) : '';
    if (!rawId || seenGroups.has(rawId)) continue;
    seenGroups.add(rawId);

    const canonicalGroup = ADMIN_NAV_GROUPS.find((g) => g.id === rawId);
    const label =
      typeof rawGrp.label === 'string' && rawGrp.label.trim()
        ? rawGrp.label.trim().slice(0, 80)
        : canonicalGroup?.label || 'قسم مخصص';

    const items: AdminNavLayoutItemEntry[] = [];
    if (Array.isArray(rawGrp.items)) {
      for (const rawItem of rawGrp.items) {
        if (!rawItem || typeof rawItem !== 'object') continue;
        const tabId = rawItem.id as AdminTab;
        if (!canonicalTabSet.has(tabId) || seenTabs.has(tabId)) continue;
        seenTabs.add(tabId);
        const subOrder = normalizeSubOptionsOrder(tabId, rawItem.subOptionsOrder);
        items.push({
          id: tabId,
          hidden: Boolean(rawItem.hidden),
          ...(subOrder ? { subOptionsOrder: subOrder } : {}),
        });
      }
    }

    normalizedGroups.push({
      id: rawId,
      label,
      isCustom: Boolean(rawGrp.isCustom && !canonicalGroupIds.has(rawId)),
      items,
    });
  }

  // Reconcile any canonical groups missing from saved layout
  for (const defGroup of ADMIN_NAV_GROUPS) {
    if (!seenGroups.has(defGroup.id)) {
      seenGroups.add(defGroup.id);
      normalizedGroups.push({
        id: defGroup.id,
        label: defGroup.label,
        isCustom: false,
        items: [],
      });
    }
  }

  // Reconcile any canonical tabs missing from saved layout into their canonical group
  for (const defGroup of ADMIN_NAV_GROUPS) {
    for (const defItem of defGroup.items) {
      if (seenTabs.has(defItem.id)) continue;
      seenTabs.add(defItem.id);
      const targetGroup =
        normalizedGroups.find((g) => g.id === defGroup.id) || normalizedGroups[0];
      const subOrder = normalizeSubOptionsOrder(defItem.id, undefined);
      targetGroup.items.push({
        id: defItem.id,
        hidden: false,
        ...(subOrder ? { subOptionsOrder: subOrder } : {}),
      });
    }
  }

  const rawPinned = Array.isArray(raw.pinnedTabs) ? raw.pinnedTabs : [];
  const seenPinned = new Set<AdminTab>();
  const pinnedTabs: AdminTab[] = [];
  for (const t of rawPinned) {
    if (canonicalTabSet.has(t as AdminTab) && !seenPinned.has(t as AdminTab)) {
      seenPinned.add(t as AdminTab);
      pinnedTabs.push(t as AdminTab);
    }
  }

  return {
    version: ADMIN_NAV_LAYOUT_VERSION,
    groups: normalizedGroups,
    pinnedTabs: pinnedTabs.slice(0, 12),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
  };
}

export function togglePinnedTabInLayout(
  layout: AdminNavLayoutConfig,
  tabId: AdminTab
): AdminNavLayoutConfig {
  const current = Array.isArray(layout.pinnedTabs) ? [...layout.pinnedTabs] : [];
  const exists = current.includes(tabId);
  const nextPinned = exists ? current.filter((t) => t !== tabId) : [tabId, ...current].slice(0, 12);
  return {
    ...layout,
    pinnedTabs: nextPinned,
  };
}

export function reorderPinnedTabsInLayout(
  layout: AdminNavLayoutConfig,
  fromIdx: number,
  toIdx: number
): AdminNavLayoutConfig {
  const current = Array.isArray(layout.pinnedTabs) ? [...layout.pinnedTabs] : [];
  if (
    fromIdx === toIdx ||
    fromIdx < 0 ||
    toIdx < 0 ||
    fromIdx >= current.length ||
    toIdx >= current.length
  ) {
    return layout;
  }
  const [moved] = current.splice(fromIdx, 1);
  current.splice(toIdx, 0, moved);
  return { ...layout, pinnedTabs: current };
}

const layoutListeners = new Set<(cfg: AdminNavLayoutConfig) => void>();

function notifyLayoutListeners(cfg: AdminNavLayoutConfig) {
  layoutListeners.forEach((cb) => {
    try {
      cb(cfg);
    } catch {
      // Ignore subscriber errors
    }
  });
}

export function subscribeAdminNavLayout(
  cb: (cfg: AdminNavLayoutConfig) => void
): () => void {
  layoutListeners.add(cb);
  return () => {
    layoutListeners.delete(cb);
  };
}

export function loadAdminNavLayout(): AdminNavLayoutConfig {
  if (typeof window === 'undefined') return buildDefaultAdminNavLayout();
  try {
    const raw = window.localStorage.getItem(ADMIN_NAV_LAYOUT_STORAGE_KEY);
    if (!raw) return buildDefaultAdminNavLayout();
    return normalizeAdminNavLayout(JSON.parse(raw) as Partial<AdminNavLayoutConfig>);
  } catch {
    return buildDefaultAdminNavLayout();
  }
}

export function saveAdminNavLayout(raw: Partial<AdminNavLayoutConfig>): AdminNavLayoutConfig {
  const clean = normalizeAdminNavLayout({
    ...raw,
    updatedAt: new Date().toISOString(),
  });
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(ADMIN_NAV_LAYOUT_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Ignore storage quota errors
    }
  }
  notifyLayoutListeners(clean);
  return clean;
}

export function resetAdminNavLayout(): AdminNavLayoutConfig {
  return saveAdminNavLayout(buildDefaultAdminNavLayout());
}

export interface ResolvedSidebarGroup {
  id: string;
  label: string;
  accentColor: string;
  iconName: string;
  isCustom?: boolean;
  items: AdminNavItem[];
}

/**
 * Builds the sidebar group tree for AdminDashboardView while strictly enforcing
 * existing RBAC permissions (isTabAccessible) and excluding items marked hidden.
 */
export function resolveSidebarGroupsForRender(
  layout: AdminNavLayoutConfig,
  isOwner: boolean,
  moderatorPerms: ModeratorSubPermissions
): ResolvedSidebarGroup[] {
  const normalized = normalizeAdminNavLayout(layout);
  const result: ResolvedSidebarGroup[] = [];

  for (const grp of normalized.groups) {
    const canonicalGroup = ADMIN_NAV_GROUPS.find((g) => g.id === grp.id);
    const items: AdminNavItem[] = [];
    for (const entry of grp.items) {
      if (entry.hidden) continue;
      if (!isTabAccessible(entry.id, isOwner, moderatorPerms)) continue;
      const meta = findAdminNavItem(entry.id);
      if (!meta) continue;
      items.push(meta.item);
    }
    if (items.length > 0) {
      result.push({
        id: grp.id,
        label: grp.label,
        accentColor: canonicalGroup?.accentColor || '#64748b',
        iconName: canonicalGroup?.iconName || 'FolderKanban',
        isCustom: grp.isCustom,
        items,
      });
    }
  }

  return result;
}

export function getOrderedSubOptions(
  tabId: AdminTab,
  layout?: AdminNavLayoutConfig | null
): AdminSubOptionDef[] {
  const defs = ADMIN_SECTION_SUB_OPTIONS[tabId];
  if (!defs || defs.length === 0) return [];
  if (!layout) return defs;

  let order: string[] | undefined;
  for (const grp of layout.groups) {
    const found = grp.items.find((i) => i.id === tabId);
    if (found) {
      order = found.subOptionsOrder;
      break;
    }
  }
  if (!order || order.length === 0) return defs;

  const map = new Map(defs.map((d) => [d.id, d]));
  const ordered: AdminSubOptionDef[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const def = map.get(id);
    if (def && !seen.has(id)) {
      seen.add(id);
      ordered.push(def);
    }
  }
  for (const def of defs) {
    if (!seen.has(def.id)) ordered.push(def);
  }
  return ordered;
}

export function moveGroupInLayout(
  layout: AdminNavLayoutConfig,
  fromIdx: number,
  toIdx: number
): AdminNavLayoutConfig {
  if (
    fromIdx === toIdx ||
    fromIdx < 0 ||
    toIdx < 0 ||
    fromIdx >= layout.groups.length ||
    toIdx >= layout.groups.length
  ) {
    return layout;
  }
  const groups = [...layout.groups];
  const [moved] = groups.splice(fromIdx, 1);
  groups.splice(toIdx, 0, moved);
  return { ...layout, groups };
}

export function moveItemInLayout(
  layout: AdminNavLayoutConfig,
  itemId: AdminTab,
  targetGroupId: string,
  targetIndex?: number
): AdminNavLayoutConfig {
  let extracted: AdminNavLayoutItemEntry | null = null;
  const strippedGroups = layout.groups.map((grp) => {
    const idx = grp.items.findIndex((i) => i.id === itemId);
    if (idx === -1) return grp;
    extracted = grp.items[idx];
    return {
      ...grp,
      items: grp.items.filter((i) => i.id !== itemId),
    };
  });

  if (!extracted) return layout;

  const nextGroups = strippedGroups.map((grp) => {
    if (grp.id !== targetGroupId) return grp;
    const nextItems = [...grp.items];
    const clampedIdx =
      typeof targetIndex === 'number'
        ? Math.max(0, Math.min(nextItems.length, targetIndex))
        : nextItems.length;
    nextItems.splice(clampedIdx, 0, extracted as AdminNavLayoutItemEntry);
    return { ...grp, items: nextItems };
  });

  return { ...layout, groups: nextGroups };
}

export function createCustomNavGroup(
  layout: AdminNavLayoutConfig,
  label: string
): AdminNavLayoutConfig {
  const cleanLabel = label.trim().slice(0, 80);
  if (!cleanLabel) return layout;
  const slug = `custom_${Date.now().toString(36)}`;
  return {
    ...layout,
    groups: [
      ...layout.groups,
      {
        id: slug,
        label: cleanLabel,
        isCustom: true,
        items: [],
      },
    ],
  };
}

export function renameNavGroup(
  layout: AdminNavLayoutConfig,
  groupId: string,
  newLabel: string
): AdminNavLayoutConfig {
  const clean = newLabel.trim().slice(0, 80);
  if (!clean) return layout;
  return {
    ...layout,
    groups: layout.groups.map((grp) => (grp.id === groupId ? { ...grp, label: clean } : grp)),
  };
}

export function deleteCustomNavGroup(
  layout: AdminNavLayoutConfig,
  groupId: string
): AdminNavLayoutConfig {
  const target = layout.groups.find((g) => g.id === groupId);
  if (!target || !target.isCustom) return layout;
  // Move any items inside custom group back to their canonical default groups before deleting
  const remaining = layout.groups.filter((g) => g.id !== groupId);
  return normalizeAdminNavLayout({
    ...layout,
    groups: remaining,
  });
}

export function toggleItemHiddenInLayout(
  layout: AdminNavLayoutConfig,
  itemId: AdminTab
): AdminNavLayoutConfig {
  return {
    ...layout,
    groups: layout.groups.map((grp) => ({
      ...grp,
      items: grp.items.map((item) =>
        item.id === itemId ? { ...item, hidden: !item.hidden } : item
      ),
    })),
  };
}

export function reorderSubOptionInLayout(
  layout: AdminNavLayoutConfig,
  itemId: AdminTab,
  fromIdx: number,
  toIdx: number
): AdminNavLayoutConfig {
  const currentOrdered = getOrderedSubOptions(itemId, layout).map((s) => s.id);
  if (
    fromIdx === toIdx ||
    fromIdx < 0 ||
    toIdx < 0 ||
    fromIdx >= currentOrdered.length ||
    toIdx >= currentOrdered.length
  ) {
    return layout;
  }
  const nextOrder = [...currentOrdered];
  const [moved] = nextOrder.splice(fromIdx, 1);
  nextOrder.splice(toIdx, 0, moved);

  return {
    ...layout,
    groups: layout.groups.map((grp) => ({
      ...grp,
      items: grp.items.map((item) =>
        item.id === itemId ? { ...item, subOptionsOrder: nextOrder } : item
      ),
    })),
  };
}

export async function syncAdminNavLayoutToFirestore(
  layout: AdminNavLayoutConfig,
  uid: string
): Promise<boolean> {
  if (!uid) return false;
  try {
    const db = getActiveDb();
    const clean = normalizeAdminNavLayout(layout);
    await setDoc(doc(db, 'admin_workspace', 'nav_layout'), {
      kind: 'nav_layout',
      config: clean,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    reportClientError({
      source: 'firestore.admin_workspace.nav_layout',
      level: 'warn',
      message: `Failed to sync admin nav layout to Firestore: ${error instanceof Error ? error.message : String(error)}`,
      context: { uid },
    });
    return false;
  }
}

export function subscribeAdminNavLayoutFromFirestore(
  enabled: boolean,
  onRemote: (layout: AdminNavLayoutConfig) => void
): () => void {
  if (!enabled) return () => {};
  try {
    const db = getActiveDb();
    return onSnapshot(
      doc(db, 'admin_workspace', 'nav_layout'),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as { config?: Partial<AdminNavLayoutConfig> } | undefined;
        if (!data?.config) return;
        const normalized = saveAdminNavLayout(data.config);
        onRemote(normalized);
      },
      (error) => {
        reportClientError({
          source: 'firestore.admin_workspace.nav_layout',
          level: 'warn',
          message: `Admin nav layout listener error: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    );
  } catch {
    return () => {};
  }
}

export type { AdminNavGroup, AdminNavItem };
