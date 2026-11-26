import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Film,
  Play,
  Star,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  DuplicateMatchInfo,
  ImporterJobResultRecord,
} from '../../types/advancedImporter';

interface AdvancedImporterPreviewModalProps {
  record: ImporterJobResultRecord | null;
  duplicateInfo: DuplicateMatchInfo | null;
  onClose: () => void;
  onSaveSingle?: (record: ImporterJobResultRecord, mode: 'create' | 'update') => void;
  saving?: boolean;
}

export function AdvancedImporterPreviewModal({
  record,
  duplicateInfo,
  onClose,
  onSaveSingle,
  saving = false,
}: AdvancedImporterPreviewModalProps) {
  if (!record || !record.movie) return null;
  const m = record.movie;
  const directors = m.directors.length
    ? m.directors
    : m.cast.filter((c) => /مخرج|director/i.test(c.role)).map((c) => c.name);
  const actors = m.cast.filter((c) => !/مخرج|director/i.test(c.role));

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-3xl bg-[#0c1821] border border-white/15 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 bg-[#09121a]">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-white truncate">{m.title}</h3>
            <p className="text-xs text-[#b7c9ef] font-latin truncate mt-0.5">
              {m.englishTitle} · {m.year} · {m.duration} · {m.quality}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق المعاينة"
            className="w-9 h-9 rounded-xl bg-[#1a242e] hover:bg-white/15 text-[#b7c9ef] hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {duplicateInfo && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-400/35 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-amber-200 font-bold">
                <AlertTriangle className="w-4 h-4 text-[#f9c400] shrink-0" />
                <span>
                  تنبيه تكرار: {duplicateInfo.reasonLabel} — مطابق لـ &ldquo;{duplicateInfo.matchedTitle}&rdquo; (
                  {duplicateInfo.matchedYear})
                </span>
              </div>
              <span className="font-latin text-[11px] text-amber-300/90 tabular-nums">
                ID: {duplicateInfo.matchedCatalogId}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5">
            {/* Poster & Backdrop */}
            <div className="space-y-3">
              <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-[#1a242e] border border-white/10">
                {m.poster ? (
                  <img
                    src={m.poster}
                    alt={m.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#b7c9ef]/50">
                    <Film className="w-10 h-10" />
                  </div>
                )}
              </div>
              {m.backdrop && (
                <div className="aspect-video rounded-xl overflow-hidden bg-[#1a242e] border border-white/10">
                  <img
                    src={m.backdrop}
                    alt={`${m.title} backdrop`}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
            </div>

            {/* Metadata Details */}
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-xl bg-[#1a242e] px-3 py-2">
                  <div className="text-[10px] text-[#b7c9ef]">التقييم</div>
                  <div className="font-extrabold text-white mt-0.5 flex items-center gap-1 tabular-nums">
                    <Star className="w-3.5 h-3.5 text-[#f9c400] fill-[#f9c400]" />
                    <span>{m.imdb}</span>
                  </div>
                </div>
                <div className="rounded-xl bg-[#1a242e] px-3 py-2">
                  <div className="text-[10px] text-[#b7c9ef]">الإصدار</div>
                  <div className="font-extrabold text-white mt-0.5 tabular-nums">
                    {m.releaseDate || m.year}
                  </div>
                </div>
                <div className="rounded-xl bg-[#1a242e] px-3 py-2">
                  <div className="text-[10px] text-[#b7c9ef]">المدة</div>
                  <div className="font-extrabold text-white mt-0.5 tabular-nums">{m.duration}</div>
                </div>
                <div className="rounded-xl bg-[#1a242e] px-3 py-2">
                  <div className="text-[10px] text-[#b7c9ef]">المعرّف الخارجي</div>
                  <div className="font-extrabold text-white mt-0.5 font-latin truncate">
                    {m.imdbId || m.externalId || '-'}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-[#b7c9ef]">القصة والوصف</div>
                <p className="text-xs leading-relaxed text-white/90 bg-[#1a242e]/60 rounded-xl p-3 border border-white/5">
                  {m.story || 'لا يوجد وصف مستخرج'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl bg-[#1a242e]/60 p-3 space-y-1">
                  <div className="text-[10px] text-[#b7c9ef]">التصنيفات والأنواع</div>
                  <div className="text-white font-bold">
                    {[...m.categories, ...m.genres].join(' · ') || '-'}
                  </div>
                </div>
                <div className="rounded-xl bg-[#1a242e]/60 p-3 space-y-1">
                  <div className="text-[10px] text-[#b7c9ef]">الوسوم</div>
                  <div className="text-white/90">
                    {m.tags.length > 0 ? m.tags.slice(0, 12).join(' · ') : 'لا توجد وسوم إضافية'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl bg-[#1a242e]/60 p-3 space-y-1">
                  <div className="text-[10px] text-[#b7c9ef] flex items-center gap-1">
                    <UserCheck className="w-3 h-3 text-[#4CAF50]" />
                    <span>المخرجون</span>
                  </div>
                  <div className="text-white font-bold">
                    {directors.length > 0 ? directors.join('، ') : 'غير محدد'}
                  </div>
                </div>
                <div className="rounded-xl bg-[#1a242e]/60 p-3 space-y-1">
                  <div className="text-[10px] text-[#b7c9ef]">طاقم التمثيل ({actors.length})</div>
                  <div className="text-white/90 line-clamp-2">
                    {actors.length > 0
                      ? actors.slice(0, 10).map((a) => a.name).join('، ')
                      : 'غير متوفر'}
                  </div>
                </div>
              </div>

              {m.trailerUrl && (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-[#1a242e]/60 px-3 py-2 border border-white/5">
                  <span className="text-[#b7c9ef] truncate font-latin">{m.trailerUrl}</span>
                  <a
                    href={m.trailerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#f9c400] hover:underline font-bold shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>التريلر</span>
                  </a>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl bg-[#1a242e]/60 p-3 space-y-1.5">
                  <div className="text-[11px] font-bold text-[#b7c9ef] flex items-center justify-between">
                    <span>روابط وسيرفرات المشاهدة</span>
                    <span className="tabular-nums text-white">{m.servers.length}</span>
                  </div>
                  {m.servers.length === 0 ? (
                    <div className="text-[11px] text-white/50">لا توجد سيرفرات مستخرجة</div>
                  ) : (
                    <ul className="space-y-1 max-h-28 overflow-y-auto">
                      {m.servers.map((srv) => (
                        <li key={srv.id} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-white font-bold truncate">{srv.name}</span>
                          <span className="text-[#b7c9ef] font-latin truncate max-w-[160px]">
                            {srv.url || 'embed'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl bg-[#1a242e]/60 p-3 space-y-1.5">
                  <div className="text-[11px] font-bold text-[#b7c9ef] flex items-center justify-between">
                    <span>روابط التحميل</span>
                    <span className="tabular-nums text-white">{m.downloads.length}</span>
                  </div>
                  {m.downloads.length === 0 ? (
                    <div className="text-[11px] text-white/50">لا توجد روابط تحميل مستخرجة</div>
                  ) : (
                    <ul className="space-y-1 max-h-28 overflow-y-auto">
                      {m.downloads.map((dl) => (
                        <li key={dl.id} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-white font-bold truncate flex items-center gap-1">
                            <Download className="w-3 h-3 text-sky-400 shrink-0" />
                            <span>{dl.host}</span>
                          </span>
                          <span className="text-[#b7c9ef] font-latin">{dl.quality}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-[#b7c9ef]">
                <span className="truncate font-latin">المصدر: {m.sourceUrl}</span>
                {m.sourceUrl && (
                  <a
                    href={m.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sky-300 hover:underline shrink-0"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>فتح المصدر</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3.5 border-t border-white/10 bg-[#09121a]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#1a242e] hover:bg-white/15 px-4 py-2 text-xs font-bold text-white cursor-pointer whitespace-nowrap"
          >
            إغلاق
          </button>
          {onSaveSingle && (
            <>
              {duplicateInfo && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onSaveSingle(record, 'update')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 px-4 py-2 text-xs font-extrabold text-[#06131c] cursor-pointer whitespace-nowrap"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>تحديث الفيلم الموجود</span>
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => onSaveSingle(record, 'create')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] disabled:opacity-60 px-4 py-2 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{duplicateInfo ? 'حفظ كنسخة جديدة' : 'اعتماد وحفظ في الكتالوج'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
