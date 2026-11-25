import { DragEvent, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Edit3,
  Eye,
  EyeOff,
  FolderPlus,
  GripVertical,
  LayoutList,
  Lock,
  MoveRight,
  Pin,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { ADMIN_NAV_GROUPS, findAdminNavItem, type AdminTab } from './adminNavigation';
import {
  ADMIN_SECTION_SUB_OPTIONS,
  AdminNavLayoutConfig,
  createCustomNavGroup,
  deleteCustomNavGroup,
  getOrderedSubOptions,
  moveGroupInLayout,
  moveItemInLayout,
  renameNavGroup,
  reorderSubOptionInLayout,
  resetAdminNavLayout,
  saveAdminNavLayout,
  syncAdminNavLayoutToFirestore,
  toggleItemHiddenInLayout,
  togglePinnedTabInLayout,
} from '../../lib/adminNavLayout';

interface AdminNavOrderPanelProps {
  navLayout: AdminNavLayoutConfig;
  actorUid: string;
  onChangeLayout: (next: AdminNavLayoutConfig) => void;
  onNotify: (msg: string) => void;
}

export function AdminNavOrderPanel({
  navLayout,
  actorUid,
  onChangeLayout,
  onNotify,
}: AdminNavOrderPanelProps) {
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupLabel, setEditingGroupLabel] = useState('');
  const [expandedSubItemId, setExpandedSubItemId] = useState<AdminTab | null>(null);

  // Drag state (works seamlessly on desktop; touch/mobile uses explicit arrows & move dropdown)
  const [draggedGroupIdx, setDraggedGroupIdx] = useState<number | null>(null);
  const [draggedItem, setDraggedItem] = useState<{ id: AdminTab; fromGroupId: string } | null>(null);
  const [draggedSubOption, setDraggedSubOption] = useState<{
    tabId: AdminTab;
    fromIdx: number;
  } | null>(null);

  const totalStats = useMemo(() => {
    let totalItems = 0;
    let hiddenItems = 0;
    for (const g of navLayout.groups) {
      totalItems += g.items.length;
      hiddenItems += g.items.filter((i) => i.hidden).length;
    }
    return {
      groupsCount: navLayout.groups.length,
      totalItems,
      visibleItems: totalItems - hiddenItems,
      hiddenItems,
    };
  }, [navLayout]);

  const commitAutoSave = (nextLayout: AdminNavLayoutConfig, feedback?: string) => {
    const saved = saveAdminNavLayout(nextLayout);
    onChangeLayout(saved);
    if (actorUid) {
      void syncAdminNavLayoutToFirestore(saved, actorUid).then((ok) => {
        if (!ok) {
          onNotify('تم حفظ الترتيب محلياً — تعذرت المزامنة السحابية لترتيب القائمة');
        }
      });
    }
    if (feedback) onNotify(feedback);
  };

  const handleCreateGroup = () => {
    const clean = newGroupName.trim();
    if (!clean) {
      onNotify('اكتب اسم القسم الجديد أولاً');
      return;
    }
    const next = createCustomNavGroup(navLayout, clean);
    setNewGroupName('');
    commitAutoSave(next, `تم إنشاء القسم "${clean}" وحفظه تلقائياً`);
  };

  const handleSaveRename = (groupId: string) => {
    const clean = editingGroupLabel.trim();
    if (!clean) return;
    const next = renameNavGroup(navLayout, groupId, clean);
    setEditingGroupId(null);
    setEditingGroupLabel('');
    commitAutoSave(next, 'تمت إعادة تسمية القسم وحفظ التغييرات تلقائياً');
  };

  const handleResetDefault = () => {
    const def = resetAdminNavLayout();
    onChangeLayout(def);
    if (actorUid) {
      void syncAdminNavLayoutToFirestore(def, actorUid).then((ok) => {
        if (!ok) {
          onNotify('تمت استعادة الترتيب محلياً — تعذرت المزامنة السحابية');
        }
      });
    }
    onNotify('تمت استعادة الترتيب الافتراضي لأقسام لوحة الإدارة');
  };

  const handleGroupDrop = (targetIdx: number, e: DragEvent) => {
    e.preventDefault();
    if (draggedGroupIdx !== null && draggedGroupIdx !== targetIdx) {
      commitAutoSave(moveGroupInLayout(navLayout, draggedGroupIdx, targetIdx));
    } else if (draggedItem) {
      const targetGroup = navLayout.groups[targetIdx];
      if (targetGroup) {
        commitAutoSave(moveItemInLayout(navLayout, draggedItem.id, targetGroup.id));
      }
    }
    setDraggedGroupIdx(null);
    setDraggedItem(null);
  };

  const handleItemDrop = (targetGroupId: string, targetIndex: number, e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedItem) return;
    if (draggedItem.id) {
      commitAutoSave(moveItemInLayout(navLayout, draggedItem.id, targetGroupId, targetIndex));
    }
    setDraggedItem(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl rtv-admin-accent-soft border rtv-admin-accent-text">
              <LayoutList className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg sm:text-xl font-extrabold text-white">
                  ترتيب وتنظيم أقسام لوحة الإدارة
                </h2>
                <span className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-400">
                  حفظ تلقائي فوري
                </span>
              </div>
              <p className="text-xs text-[#b7c9ef] mt-1 leading-relaxed">
                اسحب وأفلت الأقسام والعناصر لإعادة ترتيبها أو نقلها بين المجموعات، وثبّت الأقسام المفضلة في أعلى القائمة. جميع الروابط والصلاحيات محمية بالكامل.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetDefault}
            className="rtv-admin-btn-height inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-4 py-2.5 text-xs font-extrabold text-[#b7c9ef] hover:text-white cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الترتيب الافتراضي</span>
          </button>
        </div>

        {/* Summary Counters + Create New Group */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2 border-t border-white/10">
          <div className="lg:col-span-5 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 font-bold text-[#b7c9ef]">
              الأقسام: <strong className="text-white tabular-nums">{totalStats.groupsCount}</strong>
            </span>
            <span className="rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 font-bold text-emerald-400">
              الظاهرة: <strong className="tabular-nums">{totalStats.visibleItems}</strong>
            </span>
            <span className="rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 font-bold text-sky-400">
              المثبتة: <strong className="tabular-nums">{navLayout.pinnedTabs?.length || 0}</strong>
            </span>
            <span className="rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 font-bold text-[#b7c9ef]">
              المخفية: <strong className="tabular-nums">{totalStats.hiddenItems}</strong>
            </span>
          </div>

          <div className="lg:col-span-7 flex flex-wrap sm:flex-nowrap items-center gap-2">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateGroup();
                }
              }}
              placeholder="اسم قسم رئيسي جديد (مثال: أدوات النشر السريع)..."
              className="flex-1 min-w-[200px] rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-xs text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCreateGroup}
              className="rtv-admin-btn-height inline-flex items-center gap-1.5 rounded-xl rtv-admin-accent-bg px-4 py-2.5 text-xs font-extrabold shadow cursor-pointer shrink-0"
            >
              <FolderPlus className="w-4 h-4" />
              <span>إنشاء قسم جديد</span>
            </button>
          </div>
        </div>
      </div>

      {/* Groups & Items Tree */}
      <div className="space-y-4">
        {navLayout.groups.map((group, groupIdx) => {
          const isEditingThis = editingGroupId === group.id;

          return (
            <div
              key={group.id}
              draggable={!isEditingThis}
              onDragStart={(e) => {
                if (draggedItem || draggedSubOption) return;
                setDraggedGroupIdx(groupIdx);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                setDraggedGroupIdx(null);
                setDraggedItem(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => handleGroupDrop(groupIdx, e)}
              className={`rounded-3xl bg-[#0c1821] border p-5 space-y-3 transition-all ${
                draggedGroupIdx === groupIdx
                  ? 'border-[#f9c400] opacity-70'
                  : 'border-white/[0.08] hover:border-white/20'
              }`}
            >
              {/* Group Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span
                    title="اسحب لتغيير ترتيب القسم"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#1a242e] text-[#b7c9ef] cursor-grab active:cursor-grabbing shrink-0"
                  >
                    <GripVertical className="w-4 h-4" />
                  </span>

                  {isEditingThis ? (
                    <div className="flex flex-wrap items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editingGroupLabel}
                        onChange={(e) => setEditingGroupLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveRename(group.id);
                          } else if (e.key === 'Escape') {
                            setEditingGroupId(null);
                          }
                        }}
                        autoFocus
                        className="flex-1 min-w-[180px] rounded-xl bg-[#1a242e] border border-[#f9c400]/50 px-3 py-1.5 text-xs font-bold text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveRename(group.id)}
                        className="inline-flex items-center gap-1 rounded-xl bg-[#4CAF50] px-3 py-1.5 text-xs font-extrabold text-white cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>حفظ</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingGroupId(null)}
                        className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            ADMIN_NAV_GROUPS.find((g) => g.id === group.id)?.accentColor ||
                            '#64748b',
                        }}
                      />
                      <h3 className="font-display text-sm sm:text-base font-extrabold text-white truncate">
                        {group.label}
                      </h3>
                      <span className="font-latin rounded-md bg-[#1a242e] px-2 py-0.5 text-[10px] font-bold text-[#b7c9ef] tabular-nums">
                        {group.items.length} عناصر
                      </span>
                      {group.isCustom && (
                        <span className="rounded-md bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 text-[10px] font-bold text-sky-400">
                          مخصص
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Group Actions */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={groupIdx === 0}
                    onClick={() =>
                      commitAutoSave(moveGroupInLayout(navLayout, groupIdx, groupIdx - 1))
                    }
                    title="تحريك القسم للأعلى"
                    aria-label="تحريك القسم للأعلى"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#1a242e] hover:bg-white/15 disabled:opacity-35 text-white cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={groupIdx === navLayout.groups.length - 1}
                    onClick={() =>
                      commitAutoSave(moveGroupInLayout(navLayout, groupIdx, groupIdx + 1))
                    }
                    title="تحريك القسم للأسفل"
                    aria-label="تحريك القسم للأسفل"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#1a242e] hover:bg-white/15 disabled:opacity-35 text-white cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingGroupId(group.id);
                      setEditingGroupLabel(group.label);
                    }}
                    title="إعادة تسمية القسم"
                    className="inline-flex items-center gap-1 rounded-lg bg-[#1a242e] hover:bg-white/15 px-2.5 py-1.5 text-[11px] font-bold text-[#b7c9ef] hover:text-white cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>تسمية</span>
                  </button>
                  {group.isCustom && (
                    <button
                      type="button"
                      onClick={() =>
                        commitAutoSave(
                          deleteCustomNavGroup(navLayout, group.id),
                          'تم حذف القسم المخصص وإرجاع عناصره لأقسامها الافتراضية'
                        )
                      }
                      title="حذف القسم المخصص"
                      className="inline-flex items-center gap-1 rounded-lg bg-[#D92321]/15 hover:bg-[#D92321] px-2.5 py-1.5 text-[11px] font-bold text-[#ff8a88] hover:text-white cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Group Items List */}
              {group.items.length === 0 ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleItemDrop(group.id, 0, e)}
                  className="rounded-2xl border border-dashed border-white/15 bg-[#1a242e]/35 p-4 text-center text-xs text-[#b7c9ef]"
                >
                  هذا القسم فارغ حالياً — اسحب أي عنصر هنا أو اختر هذا القسم من قائمة &quot;نقل إلى قسم&quot; بجانب أي عنصر.
                </div>
              ) : (
                <div className="space-y-2">
                  {group.items.map((entry, itemIdx) => {
                    const meta = findAdminNavItem(entry.id)?.item;
                    if (!meta) return null;
                    const hasSubOptions = Boolean(ADMIN_SECTION_SUB_OPTIONS[entry.id]?.length);
                    const subExpanded = expandedSubItemId === entry.id;
                    const orderedSubs = hasSubOptions
                      ? getOrderedSubOptions(entry.id, navLayout)
                      : [];
                    const isSelfOrderPage = entry.id === 'admin_nav_order';

                    return (
                      <div
                        key={entry.id}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          setDraggedGroupIdx(null);
                          setDraggedItem({ id: entry.id, fromGroupId: group.id });
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => setDraggedItem(null)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={(e) => handleItemDrop(group.id, itemIdx, e)}
                        className={`rounded-2xl border p-3.5 transition-all ${
                          entry.hidden
                            ? 'bg-[#1a242e]/35 border-white/[0.05] opacity-65'
                            : 'bg-[#1a242e]/80 border-white/[0.08]'
                        } ${draggedItem?.id === entry.id ? 'ring-2 ring-[#f9c400]' : ''}`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <span
                              title="اسحب لإعادة الترتيب أو النقل لقسم آخر"
                              className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#0c1821] text-[#b7c9ef] cursor-grab active:cursor-grabbing shrink-0"
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </span>

                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-extrabold text-white">
                                  {meta.label}
                                </span>
                                <span className="font-latin rounded bg-[#0c1821] px-1.5 py-0.5 text-[10px] text-[#b7c9ef]/80">
                                  {entry.id}
                                </span>
                                {meta.ownerOnly && (
                                  <span className="inline-flex items-center gap-1 rounded bg-[#f9c400]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#f9c400]">
                                    <Lock className="w-2.5 h-2.5" />
                                    <span>للمسؤول</span>
                                  </span>
                                )}
                                {entry.hidden && (
                                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                                    مخفي من القائمة الجانبية
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#b7c9ef] line-clamp-1">
                                {meta.description}
                              </p>
                            </div>
                          </div>

                          {/* Item Controls (Mobile-friendly + Desktop) */}
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={itemIdx === 0}
                              onClick={() =>
                                commitAutoSave(
                                  moveItemInLayout(navLayout, entry.id, group.id, itemIdx - 1)
                                )
                              }
                              title="تحريك للأعلى"
                              aria-label={`تحريك ${meta.label} للأعلى`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0c1821] hover:bg-white/10 disabled:opacity-35 text-white cursor-pointer"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={itemIdx === group.items.length - 1}
                              onClick={() =>
                                commitAutoSave(
                                  moveItemInLayout(navLayout, entry.id, group.id, itemIdx + 1)
                                )
                              }
                              title="تحريك للأسفل"
                              aria-label={`تحريك ${meta.label} للأسفل`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0c1821] hover:bg-white/10 disabled:opacity-35 text-white cursor-pointer"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>

                            {/* Move to Group Selector */}
                            <div className="inline-flex items-center gap-1 rounded-lg bg-[#0c1821] border border-white/10 px-2 py-1">
                              <MoveRight className="w-3 h-3 text-[#f9c400] shrink-0" />
                              <select
                                aria-label={`نقل ${meta.label} إلى قسم`}
                                value={group.id}
                                onChange={(e) =>
                                  commitAutoSave(
                                    moveItemInLayout(navLayout, entry.id, e.target.value),
                                    `تم نقل "${meta.label}" إلى القسم المختار`
                                  )
                                }
                                className="bg-transparent text-[11px] font-bold text-white focus:outline-none cursor-pointer max-w-[140px]"
                              >
                                {navLayout.groups.map((targetGrp) => (
                                  <option
                                    key={targetGrp.id}
                                    value={targetGrp.id}
                                    className="bg-[#0c1821] text-white"
                                  >
                                    {targetGrp.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Pin Favorite Toggle */}
                            <button
                              type="button"
                              onClick={() =>
                                commitAutoSave(
                                  togglePinnedTabInLayout(navLayout, entry.id),
                                  (navLayout.pinnedTabs || []).includes(entry.id)
                                    ? `تمت إزالة "${meta.label}" من المثبتة`
                                    : `تم تثبيت "${meta.label}" في أعلى القائمة الجانبية`
                                )
                              }
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold border cursor-pointer ${
                                (navLayout.pinnedTabs || []).includes(entry.id)
                                  ? 'rtv-admin-accent-soft rtv-admin-accent-text'
                                  : 'bg-[#0c1821] hover:bg-white/10 border-white/10 text-[#b7c9ef] hover:text-white'
                              }`}
                            >
                              <Pin className="w-3.5 h-3.5" />
                              <span>
                                {(navLayout.pinnedTabs || []).includes(entry.id) ? 'مثبت' : 'تثبيت'}
                              </span>
                            </button>

                            {/* Show / Hide Toggle (without deleting or changing permissions) */}
                            <button
                              type="button"
                              onClick={() => {
                                if (isSelfOrderPage && !entry.hidden) {
                                  onNotify(
                                    'ملاحظة: إخفاء هذه الصفحة يخفيها من القائمة الجانبية فقط مع بقائها متاحة عبر البحث السريع Ctrl+K.'
                                  );
                                }
                                commitAutoSave(toggleItemHiddenInLayout(navLayout, entry.id));
                              }}
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold cursor-pointer ${
                                entry.hidden
                                  ? 'bg-[#4CAF50]/20 border border-[#4CAF50]/40 text-[#4CAF50]'
                                  : 'bg-[#0c1821] hover:bg-white/10 border border-white/10 text-[#b7c9ef] hover:text-white'
                              }`}
                            >
                              {entry.hidden ? (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>إظهار</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3.5 h-3.5" />
                                  <span>إخفاء</span>
                                </>
                              )}
                            </button>

                            {hasSubOptions && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedSubItemId(subExpanded ? null : entry.id)
                                }
                                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold border cursor-pointer ${
                                  subExpanded
                                    ? 'rtv-admin-accent-bg border-transparent'
                                    : 'bg-[#0c1821] border-white/10 text-[#b7c9ef] hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <span>الخيارات الفرعية ({orderedSubs.length})</span>
                                <ChevronDown
                                  className={`w-3.5 h-3.5 transition-transform ${
                                    subExpanded ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Reorder Sub-options Inside Section */}
                        {subExpanded && orderedSubs.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                            <p className="text-[11px] font-bold text-[#f9c400]">
                              ترتيب الخيارات الفرعية داخل &quot;{meta.label}&quot;:
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {orderedSubs.map((sub, subIdx) => (
                                <div
                                  key={sub.id}
                                  draggable
                                  onDragStart={(e) => {
                                    e.stopPropagation();
                                    setDraggedSubOption({ tabId: entry.id, fromIdx: subIdx });
                                  }}
                                  onDragEnd={() => setDraggedSubOption(null)}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (
                                      draggedSubOption &&
                                      draggedSubOption.tabId === entry.id &&
                                      draggedSubOption.fromIdx !== subIdx
                                    ) {
                                      commitAutoSave(
                                        reorderSubOptionInLayout(
                                          navLayout,
                                          entry.id,
                                          draggedSubOption.fromIdx,
                                          subIdx
                                        )
                                      );
                                    }
                                    setDraggedSubOption(null);
                                  }}
                                  className="flex items-center justify-between gap-2 rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs"
                                >
                                  <span className="inline-flex items-center gap-2 font-bold text-white truncate">
                                    <GripVertical className="w-3.5 h-3.5 text-[#b7c9ef] cursor-grab shrink-0" />
                                    <span className="truncate">{sub.label}</span>
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      disabled={subIdx === 0}
                                      onClick={() =>
                                        commitAutoSave(
                                          reorderSubOptionInLayout(
                                            navLayout,
                                            entry.id,
                                            subIdx,
                                            subIdx - 1
                                          )
                                        )
                                      }
                                      aria-label={`تحريك ${sub.label} للأعلى`}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded bg-[#1a242e] disabled:opacity-35 text-white cursor-pointer"
                                    >
                                      <ArrowUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={subIdx === orderedSubs.length - 1}
                                      onClick={() =>
                                        commitAutoSave(
                                          reorderSubOptionInLayout(
                                            navLayout,
                                            entry.id,
                                            subIdx,
                                            subIdx + 1
                                          )
                                        )
                                      }
                                      aria-label={`تحريك ${sub.label} للأسفل`}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded bg-[#1a242e] disabled:opacity-35 text-white cursor-pointer"
                                    >
                                      <ArrowDown className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
