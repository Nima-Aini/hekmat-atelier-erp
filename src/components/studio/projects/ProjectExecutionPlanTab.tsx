"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Users,
  FolderKanban,
  FileSignature,
  DollarSign,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  Calendar,
  MapPin,
  Phone,
  AtSign,
  UserPlus,
  CheckCircle2,
  Clock,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  FileText,
  Activity,
  Layers,
  Sparkles,
  Camera,
  X,
  CreditCard,
  Receipt,
  MessageSquare,
  ShieldCheck,
  Send,
  Printer,
  ChevronDown,
  UserCheck
} from "lucide-react";
import { NeonBadge } from "@/components/ui/NeonBadge";
import { toJalaliDate, formatMoney, formatNumber, gregorianToJalali, jalaliToGregorian, getJalaliMonthLength, toPersianDigits, getBusinessWeekday, toBusinessGregorianDateString } from "@/lib/dateUtils";

// Pipeline Stages as per specification
const PIPELINE_STAGES = [
  { id: "lead", title: "سرنخ (Lead)", color: "blue", border: "border-blue-500/30", bg: "bg-blue-500/10", text: "text-blue-400" },
  { id: "contact", title: "مشاوره و تماس (Contact)", color: "purple", border: "border-purple-500/30", bg: "bg-purple-500/10", text: "text-purple-400" },
  { id: "proposal", title: "پیشنهاد و پکیج (Proposal)", color: "pink", border: "border-pink-500/30", bg: "bg-pink-500/10", text: "text-pink-400" },
  { id: "contract", title: "عقد قرارداد (Contract)", color: "amber", border: "border-amber-500/30", bg: "bg-amber-500/10", text: "text-amber-400" },
  { id: "active_project", title: "پروژه فعال (Active Project)", color: "emerald", border: "border-emerald-500/30", bg: "bg-emerald-500/10", text: "text-emerald-400" },
];

const EVENT_TYPES: Record<string, string> = {
  wedding: "عروسی و فرمالیته",
  engagement: "عقد و نامزدی",
  formalite: "فرمالیته و کویر/شمال",
  child: "کودک و بارداری",
  birthday: "تولد و جشن",
  industrial: "صنعتی و تیزر تبلیغاتی",
  modeling: "مدلینگ و فشن",
  portrait: "پرتره و شخصی",
  concert: "همایش و رویداد",
};

const EXPENSE_CATEGORIES: Record<string, string> = {
  personnel: "دستمزد پرسنل و عوامل",
  rental: "کرایه تجهیزات خارجی",
  location: "ورودی عمارت / لوکیشن",
  printing_album: "چاپ و صحافی آلبوم ژورنال",
  retouch_edit: "ادیت، تدوین و رتوش",
  catering: "پذیرایی و تشریفات",
  transport: "ایاب و ذهاب و سفر",
  misc: "سایر هزینه‌ها",
};

interface ProjectExecutionPlanTabProps {
  projectId: string;
  projectDetails: any;
  personnelList: any[];
  equipmentList: any[];
  globalEvents: any[];
  equipmentReservationsList: any[];
  onUpdate: () => void;
}

export const ProjectExecutionPlanTab: React.FC<ProjectExecutionPlanTabProps> = ({
  projectId,
  projectDetails,
  personnelList,
  equipmentList,
  globalEvents,
  equipmentReservationsList,
  onUpdate,
}) => {
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form states
  const [title, setTitle] = useState("روز عکاسی و تصویربرداری");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [photographerId, setPhotographerId] = useState("");
  const [videographerId, setVideographerId] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [timelineSteps, setTimelineSteps] = useState<Array<{ time: string; title: string }>>([]);
  const [customNotes, setCustomNotes] = useState("");

  // Step entry states
  const [stepTime, setStepTime] = useState("");
  const [stepTitle, setStepTitle] = useState("");

  // Filter lists by role
  const photographers = personnelList.filter((p) => p.primaryRole === "photographer");
  const videographers = personnelList.filter((p) => p.primaryRole === "videographer");
  const assistants = personnelList.filter((p) => p.primaryRole === "assistant");

  // Format Helper for local inputs
  const toDatetimeLocal = (dateInput: string | Date) => {
    if (!dateInput) return "";
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    const tzoffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzoffset).toISOString().slice(0, 16);
  };

  // Preset Timeline Loader
  const handleLoadPresetTimeline = () => {
    setTimelineSteps([
      { time: "08:00", title: "حضور پرسنل و آماده‌سازی تجهیزات در آتلیه" },
      { time: "09:00", title: "شروع فاز اول عکاسی و تصویربرداری (فرمالیته/استودیو)" },
      { time: "13:00", title: "استراحت، تجدید آرایش و پذیرایی ناهار" },
      { time: "14:00", title: "جابجایی به لوکیشن دوم (باغ عمارت عکاسی)" },
      { time: "18:00", title: "پایان فیلم‌برداری، بررسی صحت فایل‌ها و ترخیص پرسنل" },
    ]);
  };

  // Open Form to Edit or Create
  const handleOpenForm = (event: any = null) => {
    if (event) {
      setEditingEventId(event.id);
      setTitle(event.title);
      setStartTime(toDatetimeLocal(event.startTime));
      setEndTime(toDatetimeLocal(event.endTime));
      setLocation(event.location || "");

      // Find assigned crew
      const assignedIds = Array.isArray(event.assignedPersonnelIds) ? event.assignedPersonnelIds : [];
      
      // Look for photographer, videographer, assistant from assigned
      const pId = assignedIds.find((id: string) => photographers.some((p) => p.id === id)) || "";
      const vId = assignedIds.find((id: string) => videographers.some((p) => p.id === id)) || "";
      const aId = assignedIds.find((id: string) => assistants.some((p) => p.id === id)) || "";
      
      setPhotographerId(pId);
      setVideographerId(vId);
      setAssistantId(aId);

      // Parse timeline and notes from serialized notes field
      let parsedSteps = [];
      let notesText = "";
      try {
        if (event.notes && event.notes.startsWith("{")) {
          const parsed = JSON.parse(event.notes);
          parsedSteps = parsed.timeline || [];
          notesText = parsed.customNotes || "";
        } else {
          notesText = event.notes || "";
        }
      } catch (e) {
        notesText = event.notes || "";
      }
      setTimelineSteps(parsedSteps);
      setCustomNotes(notesText);

      // Find reserved equipment
      const eventMarker = `[EventID:${event.id}]`;
      const reservedIds = projectDetails.reservations
        ?.filter((r: any) => r.notes?.includes(eventMarker))
        ?.map((r: any) => r.equipmentId) || [];
      setSelectedEquipmentIds(reservedIds);
    } else {
      setEditingEventId(null);
      setTitle("برنامه عکاسی و آفیش اجرای پروژه");
      setStartTime(toDatetimeLocal(projectDetails.eventDate || ""));
      // Default end time is 8 hours after start
      const defaultStart = projectDetails.eventDate ? new Date(projectDetails.eventDate) : new Date();
      const defaultEnd = new Date(defaultStart.getTime() + 8 * 60 * 60 * 1000);
      setEndTime(toDatetimeLocal(defaultEnd));
      setLocation(projectDetails.location || "");
      setPhotographerId("");
      setVideographerId("");
      setAssistantId("");
      setSelectedEquipmentIds([]);
      setTimelineSteps([]);
      setCustomNotes("");
    }
    setIsFormOpen(true);
  };

  // Close Form
  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingEventId(null);
  };

  // Add Step to Timeline
  const handleAddStep = () => {
    if (!stepTime || !stepTitle.trim()) return;
    const newSteps = [...timelineSteps, { time: stepTime, title: stepTitle.trim() }];
    newSteps.sort((a, b) => a.time.localeCompare(b.time));
    setTimelineSteps(newSteps);
    setStepTime("");
    setStepTitle("");
  };

  // Remove Step from Timeline
  const handleRemoveStep = (index: number) => {
    setTimelineSteps(timelineSteps.filter((_, i) => i !== index));
  };

  // Save/Submit Form
  const handleSave = async () => {
    if (!title.trim() || !startTime || !endTime) {
      alert("لطفاً عنوان، تاریخ شروع و تاریخ پایان را وارد نمایید.");
      return;
    }

    setLoading(true);
    try {
      // Collect crew
      const crewIds = [photographerId, videographerId, assistantId].filter(Boolean);

      // Serialize notes (with custom text and timeline steps)
      const serializedNotes = JSON.stringify({
        timeline: timelineSteps,
        customNotes: customNotes.trim(),
      });

      const payload = {
        eventId: editingEventId,
        title: title.trim(),
        startTime,
        endTime,
        location,
        assignedPersonnelIds: crewIds,
        notes: serializedNotes,
        equipmentIds: selectedEquipmentIds,
        status: "confirmed",
      };

      const res = await fetch(`/api/studio/projects/${projectId}/execution`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());

      if (!res.success) {
        throw new Error(res.error || "خطا در ذخیره‌سازی برنامه اجرا");
      }

      handleCloseForm();
      onUpdate();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete Calendar Shoot Event
  const handleDeleteEvent = async (id: string) => {
    if (!confirm("آیا از حذف این برنامه تولید و لغو آفیش‌ها و تجهیزات اطمینان دارید؟")) return;

    try {
      const res = await fetch(`/api/studio/calendar/${id}`, {
        method: "DELETE",
      }).then((r) => r.json());

      if (!res.success) {
        throw new Error(res.error || "خطا در حذف برنامه");
      }

      onUpdate();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Toggle Equipment checkbox
  const handleToggleEquipment = (equipId: string) => {
    if (selectedEquipmentIds.includes(equipId)) {
      setSelectedEquipmentIds(selectedEquipmentIds.filter((id) => id !== equipId));
    } else {
      setSelectedEquipmentIds([...selectedEquipmentIds, equipId]);
    }
  };

  // --- CONFLICT DETECTION LOGIC (PRE-CONFIRM) ---
  const checkPersonnelConflict = (personId: string, roleName: string) => {
    if (!personId || !startTime || !endTime) return null;
    const start = new Date(startTime);
    const end = new Date(endTime);

    const conflictingEvent = globalEvents.find((event) => {
      // Don't conflict with the current event itself being edited
      if (editingEventId && event.id === editingEventId) return false;

      // Check personnel assignment overlap
      const assigned = Array.isArray(event.assignedPersonnelIds) ? event.assignedPersonnelIds : [];
      if (!assigned.includes(personId)) return false;

      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);

      // Overlap formula: startA < endB && endA > startB
      return start < eventEnd && end > eventStart;
    });

    if (conflictingEvent) {
      const p = personnelList.find((x) => x.id === personId);
      return {
        personName: p?.fullName || "پرسنل",
        role: roleName,
        conflictProject: conflictingEvent.projectNumber || conflictingEvent.projectTitle || "پروژه دیگر",
        conflictTitle: conflictingEvent.title,
        conflictTime: toJalaliDate(conflictingEvent.startTime, { showTime: true }),
      };
    }
    return null;
  };

  const checkEquipmentConflict = (equipId: string) => {
    if (!equipId || !startTime || !endTime) return null;
    const start = new Date(startTime);
    const end = new Date(endTime);

    const conflictingReservation = equipmentReservationsList.find((res) => {
      if (res.equipmentId !== equipId) return false;
      if (res.status === "cancelled") return false;

      // Don't conflict if it's the current project and the same eventMarker
      if (editingEventId && res.notes?.includes(`[EventID:${editingEventId}]`)) return false;

      const resFrom = new Date(res.reservedFrom);
      const resTo = new Date(res.reservedTo);

      return start < resTo && end > resFrom;
    });

    if (conflictingReservation) {
      const eqItem = equipmentList.find((x) => x.id === equipId);
      return {
        equipTitle: eqItem?.title || "تجهیز",
        equipCode: eqItem?.code || "-",
        conflictProject: conflictingReservation.projectNumber || "پروژه دیگر",
      };
    }
    return null;
  };

  // Compile Conflicts List
  const personnelConflicts = [
    checkPersonnelConflict(photographerId, "عکاس"),
    checkPersonnelConflict(videographerId, "تصویربردار"),
    checkPersonnelConflict(assistantId, "دستیار عکاسی"),
  ].filter(Boolean) as any[];

  const equipmentConflicts = selectedEquipmentIds
    .map((id) => checkEquipmentConflict(id))
    .filter(Boolean) as any[];

  // Shoot Events for current project
  const shootEvents = projectDetails.calendarEvents?.filter((e: any) => e.eventType === "shooting") || [];

  return (
    <div className="space-y-6">
      {!isFormOpen ? (
        // LIST VIEW
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                برنامه تولید و اجرای روز عکاسی و آفیش عوامل
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                زمان‌بندی گام‌به‌گام روز عکاسی، بستن لوکیشن‌ها، رنتال تجهیزات، و تخصیص عکاسان و عوامل پروژه.
              </p>
            </div>

            <button
              onClick={() => handleOpenForm()}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              تعریف روز اجرای جدید
            </button>
          </div>

          {shootEvents.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-dashed border-slate-800 flex flex-col items-center gap-3">
              <Calendar className="w-8 h-8 text-slate-600" />
              <span>هیچ برنامه اجرا یا روز عکاسی برای این پروژه ثبت نشده است.</span>
              <button
                onClick={() => handleOpenForm()}
                className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-bold"
              >
                ثبت اولین روز اجرا ←
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {shootEvents.map((event: any) => {
                // Parse timeline from event notes
                let steps: any[] = [];
                let textNotes = "";
                try {
                  if (event.notes && event.notes.startsWith("{")) {
                    const parsed = JSON.parse(event.notes);
                    steps = parsed.timeline || [];
                    textNotes = parsed.customNotes || "";
                  } else {
                    textNotes = event.notes || "";
                  }
                } catch (e) {
                  textNotes = event.notes || "";
                }

                // Gather equipment reserved for this specific event
                const eventMarker = `[EventID:${event.id}]`;
                const reservedItems = projectDetails.reservations?.filter((r: any) => r.notes?.includes(eventMarker)) || [];

                return (
                  <div key={event.id} className="bg-slate-950/80 rounded-xl border border-slate-800 overflow-hidden">
                    {/* Event Header */}
                    <div className="p-4 bg-slate-950 border-b border-slate-800/80 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                      <div>
                        <h4 className="font-bold text-sm text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          {event.title}
                        </h4>
                        <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap gap-4 font-mono">
                          <span>
                            شروع: {toJalaliDate(event.startTime, { showTime: true })}
                          </span>
                          <span>
                            پایان: {toJalaliDate(event.endTime, { showTime: true })}
                          </span>
                          {event.location && (
                            <span className="text-indigo-400 font-sans">
                              📍 لوکیشن: {event.location}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          onClick={() => handleOpenForm(event)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold transition"
                        >
                          ویرایش برنامه
                        </button>
                        <button
                          onClick={() => handleDeleteEvent(event.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition"
                          title="حذف برنامه"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Event Body Grid */}
                    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-5">
                      {/* Crew & Equipment */}
                      <div className="space-y-3 border-l border-slate-800/50 pl-2">
                        <div>
                          <h5 className="text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-purple-400" />
                            عوامل آفیش شده (Crew)
                          </h5>
                          {event.assignedPersonnelIds?.length === 0 ? (
                            <span className="text-[11px] text-slate-500">هیچ عاملی آفیش نشده است.</span>
                          ) : (
                            <div className="space-y-1">
                              {event.assignedPersonnelIds?.map((id: string) => {
                                const p = personnelList.find((x) => x.id === id);
                                if (!p) return null;
                                return (
                                  <div key={id} className="flex items-center justify-between text-[11px] bg-slate-900/60 px-2 py-1 rounded">
                                    <span className="font-semibold text-slate-200">{p.fullName}</span>
                                    <span className="text-slate-400 text-[10px]">
                                      {p.primaryRole === "photographer" ? "📸 عکاس" : p.primaryRole === "videographer" ? "🎥 تصویربردار" : "💼 دستیار"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div>
                          <h5 className="text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                            <Camera className="w-3.5 h-3.5 text-indigo-400" />
                            تجهیزات رزرو شده استودیو
                          </h5>
                          {reservedItems.length === 0 ? (
                            <span className="text-[11px] text-slate-500">تجهیزی برای این روز رزرو نشده.</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {reservedItems.map((r: any) => (
                                <span key={r.id} className="text-[10px] px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded">
                                  {r.equipmentTitle} ({r.equipmentCode})
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Timeline Steps (Day production timeline) */}
                      <div className="space-y-2 md:col-span-2">
                        <h5 className="text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-emerald-400" />
                          تایم‌لاین و سناریوی زمانی روز عکاسی
                        </h5>
                        {steps.length === 0 ? (
                          <div className="text-[11px] text-slate-500 bg-slate-900/20 p-4 rounded-lg border border-slate-800/50">
                            تایم‌لاین روزانه وارد نشده است. برای درج سناریوی گام‌به‌گام دکمه ویرایش را بزنید.
                          </div>
                        ) : (
                          <div className="relative border-r border-slate-800/80 mr-1.5 space-y-3 pt-1">
                            {steps.map((step: any, sIdx: number) => (
                              <div key={sIdx} className="relative pr-4">
                                <div className="absolute -right-1 top-1 w-2 h-2 rounded-full bg-emerald-500"></div>
                                <div className="flex items-center gap-3 text-[11px]">
                                  <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded">
                                    {step.time}
                                  </span>
                                  <span className="text-slate-200">{step.title}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {textNotes && (
                          <div className="mt-3 pt-2 border-t border-slate-800/50">
                            <span className="text-[10px] text-slate-500 block mb-1">یادداشت‌های هماهنگی:</span>
                            <p className="text-[11px] text-slate-300 whitespace-pre-line bg-slate-900/30 p-2 rounded">
                              {textNotes}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        // EDIT / CREATE FORM
        <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h4 className="font-bold text-sm text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              {editingEventId ? "ویرایش و اصلاح برنامه روز اجرا" : "برنامه‌ریزی و تدوین روز اجرای جدید"}
            </h4>
            <button
              onClick={handleCloseForm}
              className="text-slate-400 hover:text-white text-xs"
            >
              بازگشت به لیست ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Main Fields */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">عنوان برنامه روز اجرا</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: روز عکاسی و تصویربرداری کویر شهداد"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">ساعت و تاریخ شروع آفیش</label>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">ساعت و تاریخ پایان آفیش</label>
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">📍 آدرس لوکیشن / عمارت عکاسی</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="مثال: تهران، جاده فشم، عمارت عکاسی مانی"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Crew Selection */}
              <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800/80 space-y-3.5">
                <h5 className="text-xs font-bold text-slate-200 border-b border-slate-800 pb-1.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-purple-400" />
                  آفیش عوامل (Crew Assignment)
                </h5>

                <div className="grid grid-cols-1 gap-3 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">📸 عکاس پروژه (Photographer)</label>
                    <select
                      value={photographerId}
                      onChange={(e) => setPhotographerId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none"
                    >
                      <option value="">-- بدون انتخاب عکاس --</option>
                      {photographers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName} ({p.mobile})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">🎥 تصویربردار پروژه (Videographer)</label>
                    <select
                      value={videographerId}
                      onChange={(e) => setVideographerId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none"
                    >
                      <option value="">-- بدون انتخاب تصویربردار --</option>
                      {videographers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName} ({p.mobile})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">💼 دستیار عکاسی (Assistant)</label>
                    <select
                      value={assistantId}
                      onChange={(e) => setAssistantId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none"
                    >
                      <option value="">-- بدون انتخاب دستیار --</option>
                      {assistants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName} ({p.mobile})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Equipment Selection & Warnings */}
            <div className="space-y-4">
              {/* Conflicts Alerts Area */}
              {(personnelConflicts.length > 0 || equipmentConflicts.length > 0) && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2.5">
                  <h5 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    هشدار تداخل و تعارض در زمان‌بندی (Conflict Warning)
                  </h5>
                  <div className="space-y-2 text-[11px] text-amber-300/90 leading-relaxed">
                    {personnelConflicts.map((c, idx) => (
                      <div key={idx} className="flex gap-1">
                        <span>•</span>
                        <p>
                          پرسنل <strong>{c.personName}</strong> ({c.role}) قبلاً در رویداد «{c.conflictTitle}» مربوط به <strong>پروژه {c.conflictProject}</strong> در تاریخ {c.conflictTime} آفیش شده است!
                        </p>
                      </div>
                    ))}
                    {equipmentConflicts.map((c, idx) => (
                      <div key={idx} className="flex gap-1">
                        <span>•</span>
                        <p>
                          تجهیز <strong>{c.equipTitle}</strong> ({c.equipCode}) قبلاً در بازه این آفیش، برای <strong>پروژه {c.conflictProject}</strong> رزرو شده است!
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Equipment Grid */}
              <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800/80 space-y-3.5">
                <h5 className="text-xs font-bold text-slate-200 border-b border-slate-800 pb-1.5 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-indigo-400" />
                  برنامه تجهیزات استودیو (Equipment Plan)
                </h5>

                <div className="max-h-[220px] overflow-y-auto space-y-3 pr-1">
                  {["camera", "lens", "light", "stabilizer", "drone", "other"].map((cat) => {
                    const items = equipmentList.filter((e) => e.category === cat && e.healthStatus === "active");
                    if (items.length === 0) return null;
                    return (
                      <div key={cat} className="space-y-1">
                        <span className="text-[10px] text-slate-500 font-bold tracking-wider uppercase block">
                          {cat === "camera" ? "دوربین‌ها" : cat === "lens" ? "لنزها" : cat === "light" ? "نورها و فلاش" : cat === "drone" ? "هلی‌شات و تجهیزات پروازی" : cat === "stabilizer" ? "لرزشگیر و گیمبال" : "سایر ملزومات"}
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-300">
                          {items.map((eqItem) => (
                            <label key={eqItem.id} className="flex items-center gap-2 bg-slate-900/80 px-2 py-1.5 rounded border border-slate-800/60 cursor-pointer hover:border-indigo-500/50 transition">
                              <input
                                type="checkbox"
                                checked={selectedEquipmentIds.includes(eqItem.id)}
                                onChange={() => handleToggleEquipment(eqItem.id)}
                                className="rounded text-indigo-600 bg-slate-800 border-slate-700"
                              />
                              <span className="truncate" title={`${eqItem.title} (${eqItem.code})`}>
                                {eqItem.title}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Timeline Schedule Editor */}
          <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800/80 space-y-3.5">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h5 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                تایم‌لاین گام‌به‌گام فاز اجرای روز عکاسی (Production Timeline)
              </h5>
              <button
                type="button"
                onClick={handleLoadPresetTimeline}
                className="text-[10px] bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 px-2 py-1 rounded hover:bg-indigo-500/20 transition font-bold"
              >
                + بارگذاری سناریوی عکاسی پیش‌فرض
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Step Adder Form */}
              <div className="space-y-3 p-3 bg-slate-950/40 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold block mb-1">افزودن رویداد زمانی:</span>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <input
                      type="text"
                      placeholder="08:00"
                      value={stepTime}
                      onChange={(e) => setStepTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-white text-center font-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      placeholder="شرح فعالیت روزانه..."
                      value={stepTitle}
                      onChange={(e) => setStepTitle(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-white"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddStep}
                  className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-bold transition flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  درج رویداد در خط زمانی
                </button>
              </div>

              {/* Steps List */}
              <div className="md:col-span-2 space-y-2 max-h-[160px] overflow-y-auto">
                {timelineSteps.length === 0 ? (
                  <div className="text-[11px] text-slate-500 text-center py-6">
                    هیچ رویداد زمانی اضافه نشده است. می‌توانید با زدن دکمه بارگذاری خودکار، سناریوی پیش‌فرض را ویرایش کنید.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {timelineSteps.map((step, index) => (
                      <div key={index} className="flex items-center justify-between py-1.5 text-[11px] text-slate-300">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            {step.time}
                          </span>
                          <span>{step.title}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveStep(index)}
                          className="text-slate-500 hover:text-rose-400 transition"
                          title="حذف مرحله"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Coordination Notes */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">✍️ توضیحات و هماهنگی‌های متفرقه پروژه</label>
            <textarea
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="مثال: عروس و داماد نیاز به ناهار گیاهی دارند. پمپ باد برقی برای بالن‌ها برداشته شود."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-white h-16 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Form Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleCloseForm}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-md"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
              تایید و ثبت نهایی برنامه تولید
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: GLOBAL PRODUCTION CALENDAR & WORKLOAD HEATMAP (TASK 6/8)
// =========================================================================
