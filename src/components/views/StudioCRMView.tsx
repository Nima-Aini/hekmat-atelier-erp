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
import { toJalaliDate, formatMoney, formatNumber, gregorianToJalali, jalaliToGregorian, getJalaliMonthLength, toPersianDigits } from "@/lib/dateUtils";

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

// =========================================================================
// SUB-COMPONENT: PROJECT EXECUTION & PRODUCTION PLANNER (TASK 6/8)
// =========================================================================
interface ProjectExecutionPlanTabProps {
  projectId: string;
  projectDetails: any;
  personnelList: any[];
  equipmentList: any[];
  globalEvents: any[];
  equipmentReservationsList: any[];
  onUpdate: () => void;
}

const ProjectExecutionPlanTab: React.FC<ProjectExecutionPlanTabProps> = ({
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
        conflictTime: `${new Date(conflictingEvent.startTime).toLocaleDateString("fa-IR")} ساعت ${new Date(conflictingEvent.startTime).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}`,
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
interface GlobalProductionCalendarViewProps {
  personnelList: any[];
  equipmentList: any[];
  globalEvents: any[];
  equipmentReservationsList: any[];
  onOpenProjectWorkspace: (id: string) => void;
}

const JALALI_MONTH_NAMES = [
  "",
  "فروردین", "اردیبهشت", "خرداد",
  "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر",
  "دی", "بهمن", "اسفند"
];

const WEEKDAY_NAMES = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه"];

const GlobalProductionCalendarView: React.FC<GlobalProductionCalendarViewProps> = ({
  personnelList,
  equipmentList,
  globalEvents,
  equipmentReservationsList,
  onOpenProjectWorkspace,
}) => {
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const [currentJalali, setCurrentJalali] = useState(() => {
    const today = gregorianToJalali(new Date());
    return { year: today.year || 1403, month: today.month || 1, day: today.day || 1 };
  });

  const [selectedDayYMD, setSelectedDayYMD] = useState<string | null>(null);

  // Month navigation
  const handlePrevMonth = () => {
    setCurrentJalali((prev) => {
      let m = prev.month - 1;
      let y = prev.year;
      if (m === 0) {
        m = 12;
        y = prev.year - 1;
      }
      return { year: y, month: m, day: 1 };
    });
  };

  const handleNextMonth = () => {
    setCurrentJalali((prev) => {
      let m = prev.month + 1;
      let y = prev.year;
      if (m === 13) {
        m = 1;
        y = prev.year + 1;
      }
      return { year: y, month: m, day: 1 };
    });
  };

  // Nav to current day
  const handleGoToToday = () => {
    const today = gregorianToJalali(new Date());
    setCurrentJalali({ year: today.year || 1403, month: today.month || 1, day: today.day || 1 });
    const todayG = new Date();
    setSelectedDayYMD(todayG.toISOString().split("T")[0]);
  };

  // Workload analyzer for any gregorian date YYYY-MM-DD
  const analyzeWorkload = (ymdStr: string) => {
    const eventsOnDay = globalEvents.filter((e) => {
      if (!e.startTime) return false;
      return e.startTime.split("T")[0] === ymdStr && e.eventType === "shooting";
    });

    const count = eventsOnDay.length;
    if (count === 0) {
      return {
        count,
        colorCode: "empty",
        colorClass: "text-slate-500",
        bgClass: "bg-slate-900/20 border-slate-800/50 hover:bg-slate-950/40 text-slate-400",
        dotClass: "bg-slate-700",
        label: "بدون برنامه",
      };
    }
    if (count === 1) {
      return {
        count,
        colorCode: "normal",
        colorClass: "text-emerald-400",
        bgClass: "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500 text-emerald-400",
        dotClass: "bg-emerald-500",
        label: "عادی (۱ پروژه)",
      };
    }
    if (count === 2) {
      return {
        count,
        colorCode: "busy",
        colorClass: "text-amber-400",
        bgClass: "bg-amber-500/5 border-amber-500/20 hover:border-amber-500 text-amber-400",
        dotClass: "bg-amber-500 animate-pulse",
        label: "شلوغ (۲ پروژه)",
      };
    }
    return {
      count,
      colorCode: "critical",
      colorClass: "text-rose-400",
      bgClass: "bg-rose-500/5 border-rose-500/20 hover:border-rose-500 text-rose-400",
      dotClass: "bg-rose-500",
      label: "بحرانی (۳+ پروژه)",
    };
  };

  // Generate Month Days
  const monthLength = getJalaliMonthLength(currentJalali.year, currentJalali.month);
  
  // Find first day's weekday index (0 = Sat, 6 = Fri)
  const firstDayGreg = jalaliToGregorian({ year: currentJalali.year, month: currentJalali.month, day: 1 });
  const firstDayDate = firstDayGreg;
  // Gregorian: 0 = Sun, 6 = Sat. Map to Persian: 0 = Sat, 1 = Sun, ..., 6 = Fri
  const firstDayPersianIndex = (firstDayDate.getDay() + 1) % 7;

  const monthCells = [];
  // Empty slots for offset
  for (let i = 0; i < firstDayPersianIndex; i++) {
    monthCells.push({ type: "empty" as const, key: `empty-${i}` });
  }
  // Days of the month
  for (let d = 1; d <= monthLength; d++) {
    const gDate = jalaliToGregorian({ year: currentJalali.year, month: currentJalali.month, day: d });
    const ymdStr = `${gDate.getFullYear()}-${String(gDate.getMonth() + 1).padStart(2, "0")}-${String(gDate.getDate()).padStart(2, "0")}`;
    monthCells.push({
      type: "day" as const,
      dayNum: d,
      ymdStr,
      workload: analyzeWorkload(ymdStr),
      key: `day-${d}`,
    });
  }

  // Handle selected day events listing
  const activeYMD = selectedDayYMD || (monthCells.find(c => c.type === "day") as any)?.ymdStr || "";
  const activeEvents = globalEvents.filter((e) => {
    if (!e.startTime) return false;
    return e.startTime.split("T")[0] === activeYMD && e.eventType === "shooting";
  });

  return (
    <div className="space-y-6">
      {/* Calendar Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-400" />
            تقویم هوشمند تولید و مدیریت تراکم کاری آتلیه
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            پایش زمان‌بندی پروژه‌ها و آفیش همزمان عوامل و ابزارها جهت جلوگیری از تداخل منابع (Conflict Detection).
          </p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setViewMode("month")}
            className={`px-3 py-1 text-xs font-bold rounded-md transition ${viewMode === "month" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            ماهانه
          </button>
          <button
            onClick={() => setViewMode("week")}
            className={`px-3 py-1 text-xs font-bold rounded-md transition ${viewMode === "week" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            هفتگی
          </button>
          <button
            onClick={() => setViewMode("day")}
            className={`px-3 py-1 text-xs font-bold rounded-md transition ${viewMode === "day" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            روانه
          </button>
        </div>
      </div>

      {/* Calendar Legend Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-700"></span>
          <span className="text-slate-400">بدون پروژه عکاسی</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span className="text-emerald-400 font-bold">سبز: عادی (۱ پروژه)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
          <span className="text-amber-400 font-bold">نارنجی: شلوغ (۲ پروژه)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
          <span className="text-rose-400 font-bold">قرمز: بحرانی (۳+ پروژه)</span>
        </div>
      </div>

      {/* VIEW: MONTH VIEW */}
      {viewMode === "month" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Month Calendar Grid */}
          <div className="lg:col-span-2 bg-slate-950/80 p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePrevMonth}
                  className="p-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-white font-sans min-w-[110px] text-center">
                  {JALALI_MONTH_NAMES[currentJalali.month]} {currentJalali.year}
                </span>
                <button
                  onClick={handleNextMonth}
                  className="p-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={handleGoToToday}
                className="text-[11px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/30 px-3 py-1 rounded-md hover:bg-indigo-500/20 transition"
              >
                امروز
              </button>
            </div>

            {/* Week Days Headers */}
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold text-slate-400 pb-1.5 border-b border-slate-800/50">
              {WEEKDAY_NAMES.map((name) => (
                <div key={name} className="py-1">{name}</div>
              ))}
            </div>

            {/* Month Cells */}
            <div className="grid grid-cols-7 gap-1.5 aspect-square sm:aspect-auto">
              {monthCells.map((cell) => {
                if (cell.type === "empty") {
                  return <div key={cell.key} className="bg-transparent aspect-square rounded-lg"></div>;
                }

                const isSelected = selectedDayYMD === cell.ymdStr;
                const isToday = cell.ymdStr === new Date().toISOString().split("T")[0];

                return (
                  <button
                    key={cell.key}
                    onClick={() => setSelectedDayYMD(cell.ymdStr)}
                    className={`p-1 bg-slate-900/60 aspect-square rounded-xl border flex flex-col justify-between transition relative text-right cursor-pointer ${
                      isSelected
                        ? "border-indigo-500 ring-2 ring-indigo-500/20"
                        : isToday
                        ? "border-emerald-500 bg-emerald-500/5"
                        : cell.workload.bgClass
                    }`}
                  >
                    <div className="flex items-center justify-between w-full p-1">
                      <span className="text-[10px] sm:text-xs font-mono font-bold">
                        {toPersianDigits(cell.dayNum)}
                      </span>
                      {cell.workload.count > 0 && (
                        <span className={`w-1.5 h-1.5 rounded-full ${cell.workload.dotClass}`}></span>
                      )}
                    </div>

                    <div className="w-full text-center hidden sm:block pb-1">
                      {cell.workload.count > 0 ? (
                        <span className="text-[9px] px-1 py-0.5 rounded-md font-bold bg-slate-950/60 font-sans block truncate">
                          {toPersianDigits(cell.workload.count)} آفیش
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Day Agenda Drilldown */}
          <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 flex flex-col space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                برنامه روز {toJalaliDate(activeYMD)}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                لیست عکاسی‌ها و پرسنل آفیش شده در تاریخ انتخاب شده.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3.5 max-h-[360px] pr-1">
              {activeEvents.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-xs bg-slate-900/30 rounded-xl border border-dashed border-slate-800 flex flex-col items-center justify-center gap-2">
                  <Calendar className="w-7 h-7 text-slate-600" />
                  <span>هیچ پروژه عکاسی یا آفیشی برای این روز ثبت نشده است.</span>
                </div>
              ) : (
                activeEvents.map((event) => {
                  let steps = [];
                  try {
                    if (event.notes && event.notes.startsWith("{")) {
                      steps = JSON.parse(event.notes).timeline || [];
                    }
                  } catch (e) {}

                  return (
                    <div key={event.id} className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded font-mono font-bold">
                            {event.projectNumber || "پروژه"}
                          </span>
                          <h4 className="font-bold text-xs text-white mt-1.5">{event.title}</h4>
                          <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                            ساعت {new Date(event.startTime).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })} الی {new Date(event.endTime).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>

                        <button
                          onClick={() => onOpenProjectWorkspace(event.projectId)}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold transition shrink-0"
                        >
                          جزئیات و ویرایش
                        </button>
                      </div>

                      {event.location && (
                        <div className="text-[11px] text-slate-300 flex items-center gap-1">
                          <span>📍 لوکیشن:</span>
                          <span className="truncate">{event.location}</span>
                        </div>
                      )}

                      {/* Crew & Equipment checklist */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/60 text-[10px]">
                        <div>
                          <span className="text-slate-500 font-bold block mb-1">عوامل آفیش شده:</span>
                          {event.assignedPersonnelIds?.length === 0 ? (
                            <span className="text-slate-500">-</span>
                          ) : (
                            <div className="space-y-0.5">
                              {event.assignedPersonnelIds?.map((pid: string) => {
                                const p = personnelList.find(x => x.id === pid);
                                return p ? <div key={pid} className="text-slate-300 truncate">• {p.fullName}</div> : null;
                              })}
                            </div>
                          )}
                        </div>
                        <div>
                          <span className="text-slate-500 font-bold block mb-1">تجهیزات تخصیص‌یافته:</span>
                          {/* Get equipment count */}
                          <span className="text-indigo-400 font-bold">
                            {equipmentReservationsList.filter(r => r.notes?.includes(`[EventID:${event.id}]`) && r.status !== "cancelled").length} آیتم رزرو شده
                          </span>
                        </div>
                      </div>

                      {/* Small Timeline Preview */}
                      {steps.length > 0 && (
                        <div className="bg-slate-950/40 p-2 rounded border border-slate-800/80">
                          <span className="text-[9px] text-slate-500 font-bold block mb-1">خلاصه خط زمانی روز:</span>
                          <div className="space-y-1">
                            {steps.slice(0, 3).map((st: any, sI: number) => (
                              <div key={sI} className="flex gap-2 text-[10px] text-slate-400">
                                <span className="font-mono text-emerald-400">{st.time}</span>
                                <span className="truncate">{st.title}</span>
                              </div>
                            ))}
                            {steps.length > 3 && <span className="text-[9px] text-indigo-400 block pt-0.5">و {steps.length - 3} مرحله دیگر...</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }))}
            </div>
          </div>
        </div>
      )}

      {/* VIEW: WEEK VIEW */}
      {viewMode === "week" && (
        <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <span className="text-sm font-bold text-white">
              نمای کارتابل هفتگی آفیش‌ها و رزروها
            </span>
            <button
              onClick={handleGoToToday}
              className="text-[11px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/30 px-3 py-1 rounded hover:bg-indigo-500/20"
            >
              امروز
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-4 overflow-x-auto">
            {WEEKDAY_NAMES.map((name, wIdx) => {
              // Calculate date for this weekday in current selected Jalali week
              // For simplicity, let's list 7 days starting from first day of month + weekday offset
              const dNum = Math.min(Math.max(currentJalali.day - firstDayPersianIndex + wIdx, 1), monthLength);
              const gDate = jalaliToGregorian({ year: currentJalali.year, month: currentJalali.month, day: dNum });
              const ymdStr = `${gDate.getFullYear()}-${String(gDate.getMonth() + 1).padStart(2, "0")}-${String(gDate.getDate()).padStart(2, "0")}`;
              const workload = analyzeWorkload(ymdStr);
              const dayEvents = globalEvents.filter(e => e.startTime?.startsWith(ymdStr) && e.eventType === "shooting");

              return (
                <div key={name} className="bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-3 min-w-[130px]">
                  <div className="border-b border-slate-800 pb-1.5 text-center">
                    <span className="text-xs font-bold text-slate-300 block">{name}</span>
                    <span className="text-[10px] font-mono text-slate-500">{toPersianDigits(dNum)} {JALALI_MONTH_NAMES[currentJalali.month]}</span>
                  </div>

                  <div className="space-y-2 max-h-[220px] overflow-y-auto">
                    {dayEvents.length === 0 ? (
                      <span className="text-[10px] text-slate-600 text-center block py-4">بدون برنامه</span>
                    ) : (
                      dayEvents.map(ev => (
                        <button
                          key={ev.id}
                          onClick={() => onOpenProjectWorkspace(ev.projectId)}
                          className="w-full text-right p-2 bg-slate-950/80 rounded border border-slate-800 hover:border-indigo-500 text-[10px] space-y-1 block cursor-pointer transition"
                        >
                          <span className="text-indigo-400 font-mono font-bold block">{ev.projectNumber || "پروژه"}</span>
                          <span className="font-bold text-slate-200 block truncate">{ev.title}</span>
                          <span className="text-slate-400 text-[9px] block">
                            ساعت {new Date(ev.startTime).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW: DAY VIEW */}
      {viewMode === "day" && (
        <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-sm font-bold text-white">
              نمای زمان‌بندی دقیق ۲۴ ساعته روز جاری
            </span>
            <span className="text-xs font-mono text-indigo-400">
              {toJalaliDate(activeYMD)}
            </span>
          </div>

          <div className="space-y-3">
            {["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"].map((hour, hIdx) => {
              // Find events scheduled in or around this hour
              const matches = activeEvents.filter(ev => {
                const evHour = new Date(ev.startTime).getHours();
                const currentH = parseInt(hour.split(":")[0]);
                return evHour >= currentH && evHour < currentH + 2;
              });

              return (
                <div key={hour} className="grid grid-cols-12 gap-3 items-center py-2.5 border-b border-slate-900">
                  <div className="col-span-2 sm:col-span-1 font-mono text-xs font-bold text-emerald-400">
                    {hour}
                  </div>
                  <div className="col-span-10 sm:col-span-11">
                    {matches.length === 0 ? (
                      <span className="text-[11px] text-slate-600">بدون آفیش مشخص</span>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {matches.map(m => (
                          <div key={m.id} className="p-2.5 bg-indigo-500/5 border border-indigo-500/20 rounded-lg text-xs flex justify-between items-center">
                            <div>
                              <span className="font-bold text-slate-200 block">{m.title}</span>
                              <span className="text-[10px] text-slate-400">لوکیشن: {m.location || "-"}</span>
                            </div>
                            <button
                              onClick={() => onOpenProjectWorkspace(m.projectId)}
                              className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold"
                            >
                              مشاهده ←
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export const StudioCRMView: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const [pipelineData, setPipelineData] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEventType, setSelectedEventType] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"pipeline" | "projects" | "customers" | "contracts" | "execution">("pipeline");

  // Personnel & Equipment global lists for production planning
  const [personnelList, setPersonnelList] = useState<any[]>([]);
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [globalEvents, setGlobalEvents] = useState<any[]>([]);
  const [equipmentReservationsList, setEquipmentReservationsList] = useState<any[]>([]);

  // Global Calendar state
  const [calendarView, setCalendarView] = useState<"month" | "week" | "day">("month");
  const [currentJalaliDate, setCurrentJalaliDate] = useState(() => {
    const today = gregorianToJalali(new Date());
    return { year: today.year || 1403, month: today.month || 1, day: today.day || 1 };
  });

  // Project 360 Workspace Modal
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectDetails, setProjectDetails] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [projectWorkspaceTab, setProjectWorkspaceTab] = useState<"info" | "timeline" | "contracts" | "payments" | "expenses" | "execution">("info");

  // Customer 360 Modal
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);

  // Form Modals
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [showAddContractModal, setShowAddContractModal] = useState(false);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [showAddTimelineLogModal, setShowAddTimelineLogModal] = useState(false);
  const [showStageMoveModal, setShowStageMoveModal] = useState<any | null>(null);
  const [showContractPrintModal, setShowContractPrintModal] = useState<any | null>(null);

  // Customer Form State
  const [customerForm, setCustomerForm] = useState({
    name: "",
    mobile: "",
    phone: "",
    address: "",
    socialMedia: "",
    referrer: "",
    notes: "",
    customerType: "wedding",
    groomName: "",
    brideName: "",
    vipLevel: "standard",
    socialConsent: true,
  });

  // Project Form State
  const [projectForm, setProjectForm] = useState(() => ({
    studioCustomerId: "",
    title: "",
    eventType: "wedding",
    packageType: "پکیج طلایی VIP",
    eventDate: new Date().toISOString().split("T")[0],
    mainLocation: "",
    backupLocation: "",
    totalContractValue: 0,
    status: "lead",
    shootingBrief: "",
    notes: "",
  }));

  // Contract Form State
  const [contractForm, setContractForm] = useState(() => ({
    totalAmount: 0,
    depositAmount: 0,
    installmentsCount: 3,
    contractDate: new Date().toISOString().split("T")[0],
    deliveryCommitmentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    signedDocumentUrl: "",
    termsAndConditions: "۱. حفظ شئونات اسلامی و اخلاقی در طول زمان برگزاری جلسه و مراسم.\n۲. مسئولیت تامین امنیت محل برعهده کارفرما است.\n۳. تحویل فایل‌های اصلی پس از تسویه کامل حساب انجام می‌پذیرد.\n۴. مدت زمان تحویل ژورنال حداکثر ۳۰ روز پس از تایید نهایی طراحی است.",
    status: "signed",
  }));

  // Payment Form State
  const [paymentForm, setPaymentForm] = useState(() => ({
    amount: 0,
    paymentType: "deposit",
    paymentMethod: "card_transfer",
    referenceCode: "",
    paidAt: new Date().toISOString().split("T")[0],
    notes: "",
  }));

  // Expense Form State
  const [expenseForm, setExpenseForm] = useState(() => ({
    expenseCategory: "personnel",
    title: "",
    amount: 0,
    recipientName: "",
    paidAt: new Date().toISOString().split("T")[0],
    paymentStatus: "paid",
    notes: "",
  }));

  // Timeline Custom Note State
  const [timelineNoteForm, setTimelineNoteForm] = useState({
    title: "",
    description: "",
    actionType: "NOTE_ADDED",
    authorName: "مدیر استودیو",
  });

  // Stage Move State
  const [stageMoveNote, setStageMoveNote] = useState("");

  // Load Main Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [pipeRes, projRes, custRes, persRes, equipRes, calRes, resRes] = await Promise.all([
        fetch("/api/studio/pipeline").then((r) => r.json()),
        fetch("/api/studio/projects?pageSize=100").then((r) => r.json()),
        fetch("/api/studio/customers?pageSize=100").then((r) => r.json()),
        fetch("/api/studio/personnel?pageSize=100").then((r) => r.json()),
        fetch("/api/studio/equipment?pageSize=100").then((r) => r.json()),
        fetch("/api/studio/calendar").then((r) => r.json()),
        fetch("/api/studio/equipment/reservations?pageSize=200").then((r) => r.json()),
      ]);

      if (pipeRes.success) {
        setPipelineData(pipeRes.pipeline || []);
        setStats(pipeRes.stats || null);
      }
      if (projRes.success) {
        setProjects(projRes.projects || []);
      }
      if (custRes.success) {
        setCustomersList(custRes.customers || []);
      }
      if (persRes.success) {
        setPersonnelList(persRes.personnel || []);
      }
      if (equipRes.success) {
        setEquipmentList(equipRes.equipment || []);
      }
      if (calRes.success) {
        setGlobalEvents(calRes.events || []);
      }
      if (resRes.success) {
        setEquipmentReservationsList(resRes.reservations || []);
      }
    } catch (err) {
      console.error("Error loading CRM data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Load Single Project 360
  const openProjectWorkspace = async (projectId: string, initialTab: "info" | "timeline" | "contracts" | "payments" | "expenses" | "execution" = "info") => {
    setSelectedProjectId(projectId);
    setProjectWorkspaceTab(initialTab);
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/studio/projects/${projectId}`).then((r) => r.json());
      if (res.success) {
        setProjectDetails(res.project);
      }
    } catch (err) {
      console.error("Error loading project details:", err);
    } finally {
      setDetailsLoading(false);
    }
  };

  // Submit Customer (Add/Edit)
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.name.trim() || !customerForm.mobile.trim()) {
      alert("نام و شماره موبایل مشتری الزامی است.");
      return;
    }

    try {
      const url = editingCustomer ? `/api/studio/customers/${editingCustomer.id}` : "/api/studio/customers";
      const method = editingCustomer ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerForm),
      }).then((r) => r.json());

      if (!res.success) throw new Error(res.message || res.error || "خطا در ثبت مشتری");

      setShowAddCustomerModal(false);
      setEditingCustomer(null);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Submit Project (Add/Edit)
  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectForm.studioCustomerId || !projectForm.title.trim()) {
      alert("انتخاب مشتری و عنوان پروژه الزامی است.");
      return;
    }

    try {
      const url = editingProject ? `/api/studio/projects/${editingProject.id}` : "/api/studio/projects";
      const method = editingProject ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectForm),
      }).then((r) => r.json());

      if (!res.success) throw new Error(res.message || res.error || "خطا در ذخیره پروژه");

      setShowAddProjectModal(false);
      setEditingProject(null);
      loadData();
      if (selectedProjectId) {
        openProjectWorkspace(selectedProjectId, projectWorkspaceTab);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Stage Move Execution
  const handleConfirmStageMove = async () => {
    if (!showStageMoveModal) return;
    try {
      const res = await fetch("/api/studio/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: showStageMoveModal.projectId,
          newStage: showStageMoveModal.targetStage,
          note: stageMoveNote.trim() || undefined,
          authorName: "مدیر استودیو",
        }),
      }).then((r) => r.json());

      if (!res.success) throw new Error(res.message || res.error);

      setShowStageMoveModal(null);
      setStageMoveNote("");
      loadData();
      if (selectedProjectId && selectedProjectId === showStageMoveModal.projectId) {
        openProjectWorkspace(selectedProjectId, "timeline");
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Save Contract
  const handleSaveContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) return;
    try {
      const res = await fetch(`/api/studio/projects/${selectedProjectId}/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contractForm),
      }).then((r) => r.json());

      if (!res.success) throw new Error(res.message || res.error);

      setShowAddContractModal(false);
      openProjectWorkspace(selectedProjectId, "contracts");
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Save Payment
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || Number(paymentForm.amount) <= 0) {
      alert("مبلغ پرداختی باید بزرگتر از صفر باشد.");
      return;
    }

    try {
      const res = await fetch(`/api/studio/projects/${selectedProjectId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentForm),
      }).then((r) => r.json());

      if (!res.success) throw new Error(res.message || res.error);

      setShowAddPaymentModal(false);
      openProjectWorkspace(selectedProjectId, "payments");
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Save Expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !expenseForm.title.trim() || Number(expenseForm.amount) <= 0) {
      alert("عنوان و مبلغ هزینه الزامی است.");
      return;
    }

    try {
      const res = await fetch(`/api/studio/projects/${selectedProjectId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(expenseForm),
      }).then((r) => r.json());

      if (!res.success) throw new Error(res.message || res.error);

      setShowAddExpenseModal(false);
      openProjectWorkspace(selectedProjectId, "expenses");
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Save Custom Timeline Log
  const handleSaveTimelineNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !timelineNoteForm.title.trim()) {
      alert("عنوان یادداشت الزامی است.");
      return;
    }

    try {
      const res = await fetch(`/api/studio/projects/${selectedProjectId}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(timelineNoteForm),
      }).then((r) => r.json());

      if (!res.success) throw new Error(res.message || res.error);

      setShowAddTimelineLogModal(false);
      setTimelineNoteForm({ title: "", description: "", actionType: "NOTE_ADDED", authorName: "مدیر استودیو" });
      openProjectWorkspace(selectedProjectId, "timeline");
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Delete Payment
  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm("آیا از حذف این پرداختی اطمینان دارید؟")) return;
    try {
      const res = await fetch(`/api/studio/projects/${selectedProjectId}/payments?paymentId=${paymentId}`, {
        method: "DELETE",
      }).then((r) => r.json());

      if (!res.success) throw new Error(res.message || res.error);
      openProjectWorkspace(selectedProjectId!, "payments");
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Delete Expense
  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm("آیا از حذف این هزینه اطمینان دارید؟")) return;
    try {
      const res = await fetch(`/api/studio/projects/${selectedProjectId}/expenses?expenseId=${expenseId}`, {
        method: "DELETE",
      }).then((r) => r.json());

      if (!res.success) throw new Error(res.message || res.error);
      openProjectWorkspace(selectedProjectId!, "expenses");
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Filtered Projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch =
        !searchQuery.trim() ||
        p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.customerMobile?.includes(searchQuery) ||
        p.projectNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.mainLocation?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType = selectedEventType === "all" || p.eventType === selectedEventType;
      return matchesSearch && matchesType;
    });
  }, [projects, searchQuery, selectedEventType]);

  // Filtered Customers
  const filteredCustomers = useMemo(() => {
    return customersList.filter((c) => {
      return (
        !searchQuery.trim() ||
        c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.mobile?.includes(searchQuery) ||
        c.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.socialMedia?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.referrer?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }, [customersList, searchQuery]);

  return (
    <div className="space-y-6 pb-20" dir="rtl">
      {/* Header & Stats Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-indigo-950/40 p-6 border border-slate-800 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400">
                <FolderKanban className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  مدیریت پروژه‌ها و CRM آتلیه حکمت
                  <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    پایپ‌لاین ۵ مرحله‌ای فعال
                  </span>
                </h1>
                <p className="text-sm text-slate-400 mt-0.5">
                  ردیابی سرنخ‌ها، عقد قراردادهای رسمی، کنترل پرداخت و هزینه‌ها، و ثبت دقیق تایم‌لاین رویدادها
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setCustomerForm({
                  name: "",
                  mobile: "",
                  phone: "",
                  address: "",
                  socialMedia: "",
                  referrer: "",
                  notes: "",
                  customerType: "wedding",
                  groomName: "",
                  brideName: "",
                  vipLevel: "standard",
                  socialConsent: true,
                });
                setEditingCustomer(null);
                setShowAddCustomerModal(true);
              }}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium text-sm flex items-center gap-2 transition shadow-lg"
            >
              <UserPlus className="w-4 h-4 text-purple-400" />
              ثبت مشتری جدید
            </button>

            <button
              onClick={() => {
                setProjectForm({
                  studioCustomerId: customersList[0]?.id || "",
                  title: "",
                  eventType: "wedding",
                  packageType: "پکیج طلایی VIP",
                  eventDate: new Date().toISOString().split("T")[0],
                  mainLocation: "",
                  backupLocation: "",
                  totalContractValue: 0,
                  status: "lead",
                  shootingBrief: "",
                  notes: "",
                });
                setEditingProject(null);
                setShowAddProjectModal(true);
              }}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition shadow-lg shadow-indigo-600/30"
            >
              <Plus className="w-4 h-4" />
              ایجاد پروژه جدید
            </button>
          </div>
        </div>

        {/* Quick KPI Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/60">
            <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
              <span>ارزش کل پایپ‌لاین</span>
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-white">
              {formatMoney(stats?.totalPipelineValue || 0)}
            </div>
          </div>

          <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/60">
            <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
              <span>سرنخ‌های اولیه (Lead)</span>
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            </div>
            <div className="text-lg font-bold text-blue-400">
              {stats?.leadsCount || 0} مورد
            </div>
          </div>

          <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/60">
            <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
              <span>پروژه‌های فعال در حال اجرا</span>
              <Camera className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-emerald-400">
              {stats?.activeProjectsCount || 0} پروژه
            </div>
          </div>

          <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/60">
            <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
              <span>تحویل نهایی شده</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
            </div>
            <div className="text-lg font-bold text-teal-400">
              {stats?.completedCount || 0} مورد
            </div>
          </div>

          <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/60">
            <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
              <span>نرخ تبدیل (Win Rate)</span>
              <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-lg font-bold text-purple-400">
              {stats?.winRate || "0%"}
            </div>
          </div>

          <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/60">
            <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
              <span>کل پرونده‌های مشتریان</span>
              <Users className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="text-lg font-bold text-indigo-400">
              {customersList.length} مشتری
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-slate-800">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("pipeline")}
            className={`px-5 py-3 border-b-2 font-bold text-sm flex items-center gap-2 transition ${
              activeTab === "pipeline"
                ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4" />
            پایپ‌لاین فروش (Sales Funnel)
          </button>

          <button
            onClick={() => setActiveTab("projects")}
            className={`px-5 py-3 border-b-2 font-bold text-sm flex items-center gap-2 transition ${
              activeTab === "projects"
                ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FolderKanban className="w-4 h-4" />
            فهرست پروژه‌ها و کارتابل ({projects.length})
          </button>

          <button
            onClick={() => setActiveTab("customers")}
            className={`px-5 py-3 border-b-2 font-bold text-sm flex items-center gap-2 transition ${
              activeTab === "customers"
                ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="w-4 h-4" />
            مشتریان آتلیه CRM ({customersList.length})
          </button>

          <button
            onClick={() => setActiveTab("execution")}
            className={`px-5 py-3 border-b-2 font-bold text-sm flex items-center gap-2 transition ${
              activeTab === "execution"
                ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Calendar className="w-4 h-4 text-emerald-400" />
            برنامه تولید و تقویم استودیو
          </button>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          title="به‌روزرسانی داده‌ها"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ========================================== */}
      {/* TAB 1: VISUAL PIPELINE (KANBAN FUNNEL)     */}
      {/* ========================================== */}
      {activeTab === "pipeline" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <div className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              پایپ‌لاین ۵ مرحله‌ای آتلیه:
              <span className="text-xs text-slate-400">Lead → Contact → Proposal → Contract → Active Project</span>
            </div>
            <div className="relative max-w-xs w-full">
              <Search className="w-4 h-4 absolute right-3 top-3 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو در سرنخ‌ها و پروژه‌ها..."
                className="w-full pl-3 pr-9 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
            {PIPELINE_STAGES.map((stage, idx) => {
              const stageData = pipelineData.find((p) => p.stageId === stage.id);
              const stageProjects = (stageData?.projects || []).filter((p: any) =>
                !searchQuery.trim() ||
                p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.customerMobile?.includes(searchQuery)
              );

              return (
                <div
                  key={stage.id}
                  className="bg-slate-900/80 rounded-2xl border border-slate-800 p-4 flex flex-col min-w-[260px] shadow-lg flex-1"
                >
                  {/* Stage Header */}
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${stage.bg} border ${stage.border}`}></span>
                      <h3 className="font-bold text-sm text-white">{stage.title}</h3>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-xs font-semibold text-slate-300">
                      {stageProjects.length}
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 mb-3 flex items-center justify-between">
                    <span>ارزش مرحله:</span>
                    <span className="font-semibold text-slate-200">
                      {formatMoney(stageData?.totalValue || 0)}
                    </span>
                  </div>

                  {/* Stage Cards List */}
                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[600px] pr-1">
                    {stageProjects.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                        موردی در این مرحله وجود ندارد
                      </div>
                    ) : (
                      stageProjects.map((item: any) => (
                        <div
                          key={item.id}
                          className="bg-slate-950/90 hover:bg-slate-950 p-4 rounded-xl border border-slate-800/80 hover:border-indigo-500/50 transition shadow-md group relative flex flex-col gap-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                              {item.projectNumber}
                            </span>
                            <span className="text-xs text-slate-400">
                              {EVENT_TYPES[item.eventType] || item.eventType}
                            </span>
                          </div>

                          <div>
                            <h4
                              onClick={() => openProjectWorkspace(item.id)}
                              className="font-bold text-sm text-white hover:text-indigo-400 cursor-pointer transition line-clamp-1"
                            >
                              {item.title}
                            </h4>
                            <div className="text-xs text-slate-300 flex items-center gap-1.5 mt-1">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              <span>{item.customerName}</span>
                              {item.groomName && item.brideName && (
                                <span className="text-slate-500">({item.groomName} & {item.brideName})</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                            <div className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-500" />
                              <span>{item.customerMobile}</span>
                            </div>
                            {item.mainLocation && (
                              <div className="flex items-center gap-1 truncate" title={item.mainLocation}>
                                <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                                <span className="truncate">{item.mainLocation}</span>
                              </div>
                            )}
                          </div>

                          {/* Financial & Status Indicators */}
                          <div className="bg-slate-900/90 p-2.5 rounded-lg flex items-center justify-between text-xs">
                            <div>
                              <div className="text-slate-400 text-[10px]">مبلغ پروژه:</div>
                              <div className="font-bold text-emerald-400">
                                {formatMoney(item.totalContractValue || 0)}
                              </div>
                            </div>
                            <div className="text-left">
                              <div className="text-slate-400 text-[10px]">دریافتی:</div>
                              <div className="font-semibold text-slate-200">
                                {formatMoney(item.paidAmount || 0)}
                              </div>
                            </div>
                          </div>

                          {/* Stage Transition Control Buttons */}
                          <div className="flex items-center justify-between pt-1 gap-1">
                            <button
                              onClick={() => openProjectWorkspace(item.id)}
                              className="text-xs px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition font-medium"
                            >
                              پرونده ۳۶۰°
                            </button>

                            <div className="flex items-center gap-1">
                              {idx > 0 && (
                                <button
                                  onClick={() =>
                                    setShowStageMoveModal({
                                      projectId: item.id,
                                      projectTitle: item.title,
                                      currentStage: stage.id,
                                      targetStage: PIPELINE_STAGES[idx - 1].id,
                                      targetStageTitle: PIPELINE_STAGES[idx - 1].title,
                                    })
                                  }
                                  title={`بازگشت به ${PIPELINE_STAGES[idx - 1].title}`}
                                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition"
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {idx < PIPELINE_STAGES.length - 1 && (
                                <button
                                  onClick={() =>
                                    setShowStageMoveModal({
                                      projectId: item.id,
                                      projectTitle: item.title,
                                      currentStage: stage.id,
                                      targetStage: PIPELINE_STAGES[idx + 1].id,
                                      targetStageTitle: PIPELINE_STAGES[idx + 1].title,
                                    })
                                  }
                                  className="text-xs px-2.5 py-1.5 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-lg transition font-medium flex items-center gap-1"
                                >
                                  <span>مرحله بعد</span>
                                  <ArrowLeft className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 2: PROJECTS DIRECTORY & MANAGEMENT    */}
      {/* ========================================== */}
      {activeTab === "projects" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[260px]">
                <Search className="w-4 h-4 absolute right-3 top-3 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="جستجو در عنوان، شماره پروژه، مشتری و لوکیشن..."
                  className="w-full pl-3 pr-9 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <select
                value={selectedEventType}
                onChange={(e) => setSelectedEventType(e.target.value)}
                className="py-2 px-3 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">همه انواع پروژه‌ها</option>
                {Object.entries(EVENT_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div className="text-xs text-slate-400 font-medium">
              نمایش {filteredProjects.length} پروژه از مجموع {projects.length}
            </div>
          </div>

          <div className="bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-950/80 text-xs text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">شماره و عنوان پروژه</th>
                    <th className="p-3.5">مشتری و مخاطب</th>
                    <th className="p-3.5">نوع رویداد</th>
                    <th className="p-3.5">تاریخ مراسم</th>
                    <th className="p-3.5">لوکیشن</th>
                    <th className="p-3.5">مرحله پایپ‌لاین</th>
                    <th className="p-3.5">مبلغ کل قرارداد</th>
                    <th className="p-3.5 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredProjects.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500 text-sm">
                        هیچ پروژه‌ای مطابق فیلتر یافت نشد.
                      </td>
                    </tr>
                  ) : (
                    filteredProjects.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-800/40 transition">
                        <td className="p-3.5">
                          <div className="font-bold text-white flex items-center gap-2">
                            <span className="font-mono text-xs text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                              {p.projectNumber}
                            </span>
                            {p.title}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">{p.packageType}</div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-medium text-slate-200">{p.customerName}</div>
                          <div className="text-xs text-slate-400">{p.customerMobile}</div>
                        </td>
                        <td className="p-3.5">
                          <span className="text-xs px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                            {EVENT_TYPES[p.eventType] || p.eventType}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-300 text-xs">
                          {toJalaliDate(p.eventDate)}
                        </td>
                        <td className="p-3.5 text-xs text-slate-300 max-w-[150px] truncate" title={p.mainLocation || "-"}>
                          {p.mainLocation || "-"}
                        </td>
                        <td className="p-3.5">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
                            {PIPELINE_STAGES.find((s) => s.id === p.status)?.title || p.status}
                          </span>
                        </td>
                        <td className="p-3.5 font-bold text-emerald-400">
                          {formatMoney(p.totalContractValue || 0)}
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => openProjectWorkspace(p.id)}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
                            >
                              کارتابل ۳۶۰°
                            </button>
                            <button
                              onClick={() => {
                                setEditingProject(p);
                                setProjectForm({
                                  studioCustomerId: p.studioCustomerId,
                                  title: p.title,
                                  eventType: p.eventType,
                                  packageType: p.packageType || "standard",
                                  eventDate: new Date(p.eventDate).toISOString().split("T")[0],
                                  mainLocation: p.mainLocation || "",
                                  backupLocation: p.backupLocation || "",
                                  totalContractValue: Number(p.totalContractValue || 0),
                                  status: p.status,
                                  shootingBrief: p.shootingBrief || "",
                                  notes: p.notes || "",
                                });
                                setShowAddProjectModal(true);
                              }}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition"
                              title="ویرایش پروژه"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 3: STUDIO CUSTOMERS DIRECTORY (CRM)   */}
      {/* ========================================== */}
      {activeTab === "customers" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <div className="relative max-w-sm w-full">
              <Search className="w-4 h-4 absolute right-3 top-3 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو در نام، موبایل، آدرس، شبکه اجتماعی، معرف..."
                className="w-full pl-3 pr-9 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={() => {
                setCustomerForm({
                  name: "",
                  mobile: "",
                  phone: "",
                  address: "",
                  socialMedia: "",
                  referrer: "",
                  notes: "",
                  customerType: "wedding",
                  groomName: "",
                  brideName: "",
                  vipLevel: "standard",
                  socialConsent: true,
                });
                setEditingCustomer(null);
                setShowAddCustomerModal(true);
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold flex items-center gap-2 transition"
            >
              <UserPlus className="w-4 h-4" />
              افزودن مشتری جدید آتلیه
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCustomers.length === 0 ? (
              <div className="col-span-full p-12 text-center text-slate-500 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl">
                هیچ مشتری مطابق با عبارت جستجو یافت نشد.
              </div>
            ) : (
              filteredCustomers.map((c) => (
                <div
                  key={c.id}
                  className="bg-slate-900/80 hover:bg-slate-900 p-5 rounded-2xl border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between gap-4 shadow-lg"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-base text-white">{c.name}</h3>
                        <div className="text-xs text-indigo-400 mt-0.5">
                          {c.customerType === "wedding" ? "عروس و داماد" : c.customerType}
                        </div>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-amber-500/20">
                        {c.vipLevel?.toUpperCase()}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs text-slate-300">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        <span className="font-mono">{c.mobile}</span>
                        {c.phone && <span className="text-slate-500 font-mono">({c.phone})</span>}
                      </div>

                      {c.address && (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{c.address}</span>
                        </div>
                      )}

                      {c.socialMedia && (
                        <div className="flex items-center gap-2">
                          <AtSign className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                          <span className="text-pink-300 font-mono" dir="ltr">{c.socialMedia}</span>
                        </div>
                      )}

                      {c.referrer && (
                        <div className="flex items-center gap-2 text-slate-400">
                          <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">معرف:</span>
                          <span>{c.referrer}</span>
                        </div>
                      )}

                      {c.notes && (
                        <div className="p-2 bg-slate-950/60 rounded-lg text-slate-400 text-xs border border-slate-800/60 line-clamp-2">
                          {c.notes}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                    <button
                      onClick={() => {
                        setProjectForm({
                          studioCustomerId: c.id,
                          title: `پروژه ${c.name}`,
                          eventType: "wedding",
                          packageType: "پکیج طلایی VIP",
                          eventDate: new Date().toISOString().split("T")[0],
                          mainLocation: c.address || "",
                          backupLocation: "",
                          totalContractValue: 0,
                          status: "lead",
                          shootingBrief: "",
                          notes: "",
                        });
                        setShowAddProjectModal(true);
                      }}
                      className="text-xs px-3 py-1.5 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-lg font-medium transition flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      تعریف پروژه
                    </button>

                    <button
                      onClick={() => {
                        setEditingCustomer(c);
                        setCustomerForm({
                          name: c.name,
                          mobile: c.mobile,
                          phone: c.phone || "",
                          address: c.address || "",
                          socialMedia: c.socialMedia || "",
                          referrer: c.referrer || "",
                          notes: c.notes || "",
                          customerType: c.customerType || "wedding",
                          groomName: c.groomName || "",
                          brideName: c.brideName || "",
                          vipLevel: c.vipLevel || "standard",
                          socialConsent: c.socialConsent !== false,
                        });
                        setShowAddCustomerModal(true);
                      }}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition"
                      title="ویرایش مشتری"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "execution" && (
        <GlobalProductionCalendarView
          personnelList={personnelList}
          equipmentList={equipmentList}
          globalEvents={globalEvents}
          equipmentReservationsList={equipmentReservationsList}
          onOpenProjectWorkspace={(id) => openProjectWorkspace(id)}
        />
      )}

      {/* ========================================================================= */}
      {/* 360° PROJECT WORKSPACE MODAL (FULL WORKFLOW, CONTRACTS, TIMELINE, EXPENSES) */}
      {/* ========================================================================= */}
      {selectedProjectId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded">
                    {projectDetails?.projectNumber}
                  </span>
                  <h2 className="text-lg font-bold text-white">
                    {projectDetails?.title || "کارتابل ۳۶۰ درجه پروژه آتلیه"}
                  </h2>
                </div>
                <div className="text-xs text-slate-400 mt-1 flex items-center gap-3">
                  <span>مشتری: <strong className="text-slate-200">{projectDetails?.customerName}</strong></span>
                  <span>موبایل: <strong className="text-slate-200">{projectDetails?.customerMobile}</strong></span>
                  <span>تاریخ: <strong className="text-slate-200">{projectDetails?.eventDate ? toJalaliDate(projectDetails.eventDate) : "-"}</strong></span>
                </div>
              </div>

              <button
                onClick={() => setSelectedProjectId(null)}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Navigation Bar */}
            <div className="bg-slate-950/60 px-5 border-b border-slate-800 flex gap-2 overflow-x-auto">
              <button
                onClick={() => setProjectWorkspaceTab("info")}
                className={`px-4 py-3 border-b-2 font-bold text-xs flex items-center gap-1.5 transition ${
                  projectWorkspaceTab === "info"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <FolderKanban className="w-3.5 h-3.5" />
                مشخصات و سودآوری
              </button>

              <button
                onClick={() => setProjectWorkspaceTab("timeline")}
                className={`px-4 py-3 border-b-2 font-bold text-xs flex items-center gap-1.5 transition ${
                  projectWorkspaceTab === "timeline"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                تایم‌لاین و لاگ تغییرات ({projectDetails?.timelines?.length || 0})
              </button>

              <button
                onClick={() => setProjectWorkspaceTab("contracts")}
                className={`px-4 py-3 border-b-2 font-bold text-xs flex items-center gap-1.5 transition ${
                  projectWorkspaceTab === "contracts"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <FileSignature className="w-3.5 h-3.5" />
                قراردادها ({projectDetails?.contracts?.length || 0})
              </button>

              <button
                onClick={() => setProjectWorkspaceTab("payments")}
                className={`px-4 py-3 border-b-2 font-bold text-xs flex items-center gap-1.5 transition ${
                  projectWorkspaceTab === "payments"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                دریافتی‌ها و پرداخت‌ها ({projectDetails?.payments?.length || 0})
              </button>

              <button
                onClick={() => setProjectWorkspaceTab("expenses")}
                className={`px-4 py-3 border-b-2 font-bold text-xs flex items-center gap-1.5 transition ${
                  projectWorkspaceTab === "expenses"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                هزینه‌ها ({projectDetails?.expenses?.length || 0})
              </button>

              <button
                onClick={() => setProjectWorkspaceTab("execution")}
                className={`px-4 py-3 border-b-2 font-bold text-xs flex items-center gap-1.5 transition ${
                  projectWorkspaceTab === "execution"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                برنامه اجرا و آفیش ({projectDetails?.calendarEvents?.filter((e: any) => e.eventType === "shooting")?.length || 0})
              </button>
            </div>

            {/* Modal Body Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {detailsLoading ? (
                <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
                  <span>در حال بارگذاری اطلاعات پروژه...</span>
                </div>
              ) : projectDetails ? (
                <>
                  {/* TAB: INFO & FINANCIAL SNAPSHOT */}
                  {projectWorkspaceTab === "info" && (
                    <div className="space-y-6">
                      {/* Financial Summary Card */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 bg-slate-950/80 rounded-xl border border-slate-800">
                        <div>
                          <div className="text-xs text-slate-400">مبلغ کل قرارداد</div>
                          <div className="text-lg font-bold text-white mt-1">
                            {formatMoney(projectDetails.financialSummary?.contractTotal || 0)}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-400">کل دریافتی (پیش‌پرداخت/اقساط)</div>
                          <div className="text-lg font-bold text-emerald-400 mt-1">
                            {formatMoney(projectDetails.financialSummary?.totalPaymentsReceived || 0)}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-400">کل هزینه‌های پروژه</div>
                          <div className="text-lg font-bold text-rose-400 mt-1">
                            {formatMoney(projectDetails.financialSummary?.totalCost || 0)}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-400">سود ناخالص و مارجین</div>
                          <div className="text-lg font-bold text-indigo-400 mt-1">
                            {formatMoney(projectDetails.financialSummary?.grossProfit || 0)}
                            <span className="text-xs font-normal text-slate-400 mr-1.5">
                              ({projectDetails.financialSummary?.marginPercent})
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Project Specs */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3 bg-slate-950/40 p-5 rounded-xl border border-slate-800">
                          <h4 className="font-bold text-sm text-white border-b border-slate-800 pb-2 flex items-center gap-2">
                            <FolderKanban className="w-4 h-4 text-indigo-400" />
                            مشخصات رویداد و لوکیشن
                          </h4>
                          <div className="space-y-2 text-xs text-slate-300">
                            <div className="flex justify-between">
                              <span className="text-slate-500">نوع رویداد:</span>
                              <span className="font-medium">{EVENT_TYPES[projectDetails.eventType] || projectDetails.eventType}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">پکیج انتخابی:</span>
                              <span className="font-medium">{projectDetails.packageType}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">لوکیشن اصلی:</span>
                              <span className="font-medium">{projectDetails.mainLocation || "ثبت نشده"}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">لوکیشن بک‌آپ:</span>
                              <span className="font-medium">{projectDetails.backupLocation || "ثبت نشده"}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">مرحله فعلی:</span>
                              <span className="font-semibold text-indigo-400">
                                {PIPELINE_STAGES.find((s) => s.id === projectDetails.status)?.title || projectDetails.status}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3 bg-slate-950/40 p-5 rounded-xl border border-slate-800">
                          <h4 className="font-bold text-sm text-white border-b border-slate-800 pb-2 flex items-center gap-2">
                            <Users className="w-4 h-4 text-purple-400" />
                            اطلاعات تماس و معرف
                          </h4>
                          <div className="space-y-2 text-xs text-slate-300">
                            <div className="flex justify-between">
                              <span className="text-slate-500">نام مشتری:</span>
                              <span className="font-medium">{projectDetails.customerName}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">شماره تماس:</span>
                              <span className="font-mono">{projectDetails.customerMobile}</span>
                            </div>
                            {projectDetails.socialMedia && (
                              <div className="flex justify-between">
                                <span className="text-slate-500">شبکه اجتماعی:</span>
                                <span className="text-pink-400 font-mono" dir="ltr">{projectDetails.socialMedia}</span>
                              </div>
                            )}
                            {projectDetails.referrer && (
                              <div className="flex justify-between">
                                <span className="text-slate-500">معرف:</span>
                                <span>{projectDetails.referrer}</span>
                              </div>
                            )}
                            {projectDetails.shootingBrief && (
                              <div className="pt-2 border-t border-slate-800">
                                <span className="text-slate-500 block mb-1">بریف و سناریوی تصویربرداری:</span>
                                <p className="text-slate-300 text-xs bg-slate-900 p-2 rounded-lg">
                                  {projectDetails.shootingBrief}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB: PROJECT TIMELINE (ALL CHANGES LOGGED) */}
                  {projectWorkspaceTab === "timeline" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Clock className="w-4 h-4 text-indigo-400" />
                            تایم‌لاین و تاریخچه تغییرات پروژه
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            تمام رویدادها، جابجایی مراحل، ثبت قرارداد، پرداخت‌ها و هزینه‌ها به صورت خودکار لاگ می‌شوند.
                          </p>
                        </div>

                        <button
                          onClick={() => setShowAddTimelineLogModal(true)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          ثبت یادداشت / پیگیری
                        </button>
                      </div>

                      <div className="relative border-r-2 border-slate-800 mr-3 space-y-6 pt-2">
                        {projectDetails.timelines?.length === 0 ? (
                          <div className="p-8 text-center text-slate-500 text-xs">
                            هیچ رکوردی در تایم‌لاین این پروژه ثبت نشده است.
                          </div>
                        ) : (
                          projectDetails.timelines.map((log: any) => (
                            <div key={log.id} className="relative pr-6">
                              {/* Dot */}
                              <div className="absolute -right-2 top-1.5 w-4 h-4 rounded-full bg-indigo-600 border-2 border-slate-900"></div>

                              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-bold text-sm text-slate-200">{log.title}</h4>
                                  <span className="text-[11px] text-slate-500 font-mono">
                                    {new Date(log.createdAt).toLocaleDateString("fa-IR")} - {new Date(log.createdAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                </div>

                                {log.description && (
                                  <p className="text-xs text-slate-400 whitespace-pre-line">
                                    {log.description}
                                  </p>
                                )}

                                <div className="text-[10px] text-slate-500 pt-1 flex items-center gap-2">
                                  <span>ثبت توسط: <strong>{log.authorName || "سیستم"}</strong></span>
                                  <span>• نوع اکشن: {log.actionType}</span>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB: CONTRACTS */}
                  {projectWorkspaceTab === "contracts" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <FileSignature className="w-4 h-4 text-amber-400" />
                            قراردادهای رسمی پروژه
                          </h3>
                          <p className="text-xs text-slate-400">مشاهده شروط، مبلغ، بیعانه، تاریخ تعهد و نسخه امضاشده</p>
                        </div>

                        <button
                          onClick={() => {
                            setContractForm({
                              totalAmount: projectDetails.totalContractValue || 0,
                              depositAmount: 0,
                              installmentsCount: 3,
                              contractDate: new Date().toISOString().split("T")[0],
                              deliveryCommitmentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                              signedDocumentUrl: "",
                              termsAndConditions: "۱. حفظ شئونات اخلاقی در طول زمان برگزاری جلسه و مراسم.\n۲. مسئولیت تامین امنیت محل برعهده کارفرما است.\n۳. تحویل فایل‌های اصلی پس از تسویه کامل حساب انجام می‌پذیرد.\n۴. مدت زمان تحویل ژورنال حداکثر ۳۰ روز پس از تایید نهایی طراحی است.",
                              status: "signed",
                            });
                            setShowAddContractModal(true);
                          }}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          تنظیم قرارداد رسمی جدید
                        </button>
                      </div>

                      {projectDetails.contracts?.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                          قراردادی برای این پروژه صادر نشده است.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {projectDetails.contracts.map((ctr: any) => (
                            <div key={ctr.id} className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                  <span className="font-mono text-sm font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                                    {ctr.contractNumber}
                                  </span>
                                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                    وضعیت: {ctr.status === "signed" ? "امضا شده" : ctr.status}
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-slate-300 mt-2">
                                  <div>مبلغ کل: <strong className="text-white">{formatMoney(ctr.totalAmount)}</strong></div>
                                  <div>بیعانه: <strong className="text-emerald-400">{formatMoney(ctr.depositAmount)}</strong></div>
                                  <div>تعهد تحویل: <strong className="text-slate-200">{toJalaliDate(ctr.deliveryCommitmentDate)}</strong></div>
                                  <div>تعداد اقساط: <strong className="text-slate-200">{ctr.installmentsCount} قسط</strong></div>
                                </div>

                                {ctr.termsAndConditions && (
                                  <div className="text-xs text-slate-400 bg-slate-900/80 p-2.5 rounded-lg whitespace-pre-line mt-2 border border-slate-800/60">
                                    {ctr.termsAndConditions}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setShowContractPrintModal({ ...ctr, project: projectDetails })}
                                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  چاپ قرارداد
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB: PAYMENTS (دریافتی‌ها) */}
                  {projectWorkspaceTab === "payments" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Receipt className="w-4 h-4 text-emerald-400" />
                            تراکنش‌های مالی و دریافتی‌های پروژه
                          </h3>
                          <p className="text-xs text-slate-400">ثبت پیش‌پرداخت، اقساط و تسویه نهایی</p>
                        </div>

                        <button
                          onClick={() => {
                            setPaymentForm({
                              amount: 0,
                              paymentType: "installment_1",
                              paymentMethod: "card_transfer",
                              referenceCode: "",
                              paidAt: new Date().toISOString().split("T")[0],
                              notes: "",
                            });
                            setShowAddPaymentModal(true);
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-md"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          ثبت دریافت وجه جدید
                        </button>
                      </div>

                      {projectDetails.payments?.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                          هنوز پرداختی برای این پروژه ثبت نشده است.
                        </div>
                      ) : (
                        <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                          <table className="w-full text-right text-xs">
                            <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                              <tr>
                                <th className="p-3">نوع پرداخت</th>
                                <th className="p-3">مبلغ</th>
                                <th className="p-3">روش پرداخت</th>
                                <th className="p-3">کد پیگیری</th>
                                <th className="p-3">تاریخ واریز</th>
                                <th className="p-3">توضیحات</th>
                                <th className="p-3 text-center">عملیات</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                              {projectDetails.payments.map((p: any) => (
                                <tr key={p.id} className="hover:bg-slate-900/40">
                                  <td className="p-3 font-semibold text-slate-200">
                                    {p.paymentType === "deposit" ? "پیش‌پرداخت" : p.paymentType === "settlement" ? "تسویه نهایی" : "قسط"}
                                  </td>
                                  <td className="p-3 font-bold text-emerald-400">
                                    {formatMoney(p.amount)}
                                  </td>
                                  <td className="p-3 text-slate-300">
                                    {p.paymentMethod === "card_transfer" ? "کارت به کارت" : p.paymentMethod === "pos" ? "کارتخوان POS" : p.paymentMethod}
                                  </td>
                                  <td className="p-3 font-mono text-slate-400">{p.referenceCode || "-"}</td>
                                  <td className="p-3 text-slate-400">{toJalaliDate(p.paidAt)}</td>
                                  <td className="p-3 text-slate-400">{p.notes || "-"}</td>
                                  <td className="p-3 text-center">
                                    <button
                                      onClick={() => handleDeletePayment(p.id)}
                                      className="p-1 text-slate-500 hover:text-rose-400 transition"
                                      title="حذف پرداخت"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB: EXPENSES (هزینه‌ها) */}
                  {projectWorkspaceTab === "expenses" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-rose-400" />
                            هزینه‌های مستقیم و تولید پروژه
                          </h3>
                          <p className="text-xs text-slate-400">هزینه‌های پرسنل، رنت، لوکیشن، چاپ آلبوم ژورنال و ادیت</p>
                        </div>

                        <button
                          onClick={() => {
                            setExpenseForm({
                              expenseCategory: "personnel",
                              title: "",
                              amount: 0,
                              recipientName: "",
                              paidAt: new Date().toISOString().split("T")[0],
                              paymentStatus: "paid",
                              notes: "",
                            });
                            setShowAddExpenseModal(true);
                          }}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-md"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          ثبت هزینه جدید
                        </button>
                      </div>

                      {projectDetails.expenses?.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                          هزینه‌ای برای این پروژه ثبت نشده است.
                        </div>
                      ) : (
                        <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                          <table className="w-full text-right text-xs">
                            <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                              <tr>
                                <th className="p-3">دسته‌بندی</th>
                                <th className="p-3">عنوان هزینه</th>
                                <th className="p-3">مبلغ هزینه</th>
                                <th className="p-3">دریافت‌کننده</th>
                                <th className="p-3">تاریخ پرداخت</th>
                                <th className="p-3">توضیحات</th>
                                <th className="p-3 text-center">عملیات</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                              {projectDetails.expenses.map((e: any) => (
                                <tr key={e.id} className="hover:bg-slate-900/40">
                                  <td className="p-3">
                                    <span className="px-2 py-0.5 bg-slate-800 rounded text-slate-300 font-medium">
                                      {EXPENSE_CATEGORIES[e.expenseCategory] || e.expenseCategory}
                                    </span>
                                  </td>
                                  <td className="p-3 font-semibold text-white">{e.title}</td>
                                  <td className="p-3 font-bold text-rose-400">
                                    {formatMoney(e.amount)}
                                  </td>
                                  <td className="p-3 text-slate-300">{e.recipientName || "-"}</td>
                                  <td className="p-3 text-slate-400">{toJalaliDate(e.paidAt)}</td>
                                  <td className="p-3 text-slate-400">{e.notes || "-"}</td>
                                  <td className="p-3 text-center">
                                    <button
                                      onClick={() => handleDeleteExpense(e.id)}
                                      className="p-1 text-slate-500 hover:text-rose-400 transition"
                                      title="حذف هزینه"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {projectWorkspaceTab === "execution" && (
                    <ProjectExecutionPlanTab
                      projectId={projectDetails.id}
                      projectDetails={projectDetails}
                      personnelList={personnelList}
                      equipmentList={equipmentList}
                      globalEvents={globalEvents}
                      equipmentReservationsList={equipmentReservationsList}
                      onUpdate={() => {
                        openProjectWorkspace(projectDetails.id, "execution");
                        loadData();
                      }}
                    />
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD/EDIT CUSTOMER (ALL SPECIFIED FIELDS)                         */}
      {/* ========================================================================= */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                {editingCustomer ? "ویرایش پرونده مشتری" : "ثبت مشتری جدید آتلیه"}
              </h3>
              <button onClick={() => setShowAddCustomerModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">نام و نام خانوادگی *</label>
                  <input
                    type="text"
                    required
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                    placeholder="مثال: سارا محمدی / علی رضایی"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">شماره همراه (موبایل) *</label>
                  <input
                    type="text"
                    required
                    value={customerForm.mobile}
                    onChange={(e) => setCustomerForm({ ...customerForm, mobile: e.target.value })}
                    placeholder="09121234567"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">آدرس محل سکونت / هماهنگی</label>
                <input
                  type="text"
                  value={customerForm.address}
                  onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                  placeholder="تهران، زعفرانیه..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">شبکه اجتماعی (اینستاگرام / تلگرام)</label>
                  <input
                    type="text"
                    value={customerForm.socialMedia}
                    onChange={(e) => setCustomerForm({ ...customerForm, socialMedia: e.target.value })}
                    placeholder="@username"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">معرف (کانال جذب)</label>
                  <input
                    type="text"
                    value={customerForm.referrer}
                    onChange={(e) => setCustomerForm({ ...customerForm, referrer: e.target.value })}
                    placeholder="مثال: سالن زیبایی، تالار، دوستان، اینستاگرام"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">یادداشت و ترجیحات خاص مشتری</label>
                <textarea
                  rows={2}
                  value={customerForm.notes}
                  onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })}
                  placeholder="نکات مهم، سبک فیلمبرداری مورد علاقه، تایم‌های تماس مناسب..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold transition"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition shadow-lg shadow-indigo-600/30"
                >
                  {editingCustomer ? "ذخیره تغییرات" : "ثبت مشتری"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ADD/EDIT PROJECT                                                 */}
      {/* ========================================================================= */}
      {showAddProjectModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-indigo-400" />
                {editingProject ? "ویرایش مشخصات پروژه" : "ایجاد پروژه جدید آتلیه"}
              </h3>
              <button onClick={() => setShowAddProjectModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">مشتری پروژه *</label>
                <select
                  required
                  disabled={!!editingProject}
                  value={projectForm.studioCustomerId}
                  onChange={(e) => setProjectForm({ ...projectForm, studioCustomerId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                >
                  <option value="">-- انتخاب مشتری --</option>
                  {customersList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.mobile})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">عنوان پروژه *</label>
                <input
                  type="text"
                  required
                  value={projectForm.title}
                  onChange={(e) => setProjectForm({ ...projectForm, title: e.target.value })}
                  placeholder="مثال: عروسی و فرمالیته خانم محمدی و آقای حسینی"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">نوع پروژه *</label>
                  <select
                    value={projectForm.eventType}
                    onChange={(e) => setProjectForm({ ...projectForm, eventType: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    {Object.entries(EVENT_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">تاریخ مراسم / اجرا *</label>
                  <input
                    type="date"
                    required
                    value={projectForm.eventDate}
                    onChange={(e) => setProjectForm({ ...projectForm, eventDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">لوکیشن اصلی (باغ/عمارت/آتلیه)</label>
                  <input
                    type="text"
                    value={projectForm.mainLocation}
                    onChange={(e) => setProjectForm({ ...projectForm, mainLocation: e.target.value })}
                    placeholder="مثال: عمارت دانیال، گرمدره"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">مبلغ برآورد کل قرارداد (تومان)</label>
                  <input
                    type="number"
                    value={projectForm.totalContractValue}
                    onChange={(e) => setProjectForm({ ...projectForm, totalContractValue: Number(e.target.value) })}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-emerald-400 font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">بریف و سناریوی تصویربرداری</label>
                <textarea
                  rows={2}
                  value={projectForm.shootingBrief}
                  onChange={(e) => setProjectForm({ ...projectForm, shootingBrief: e.target.value })}
                  placeholder="تعداد دوربین، سناریوی ورودی، هلی‌شات، موسیقی‌های انتخابی..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddProjectModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold transition"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition shadow-lg shadow-indigo-600/30"
                >
                  {editingProject ? "ذخیره تغییرات" : "ایجاد پروژه"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: STAGE MOVE WITH NOTE & TIMELINE LOGGING                          */}
      {/* ========================================================================= */}
      {showStageMoveModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <ArrowLeft className="w-5 h-5 text-indigo-400" />
                انتقال مرحله در پایپ‌لاین
              </h3>
              <button onClick={() => setShowStageMoveModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                آیا از انتقال پروژه «<strong className="text-white">{showStageMoveModal.projectTitle}</strong>» به مرحله «<strong className="text-indigo-400">{showStageMoveModal.targetStageTitle}</strong>» اطمینان دارید؟
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  توضیح یا یادداشت پیگیری (در تایم‌لاین پروژه Log می‌شود):
                </label>
                <textarea
                  rows={3}
                  value={stageMoveNote}
                  onChange={(e) => setStageMoveNote(e.target.value)}
                  placeholder="مثال: جلسه هماهنگی برگزار شد و پکیج VIP تایید گردید..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowStageMoveModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold transition"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmStageMove}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition shadow-lg shadow-indigo-600/30"
              >
                تایید و انتقال مرحله
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: ADD CONTRACT                                                     */}
      {/* ========================================================================= */}
      {showAddContractModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <FileSignature className="w-5 h-5 text-amber-400" />
                تنظیم قرارداد رسمی آتلیه
              </h3>
              <button onClick={() => setShowAddContractModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveContract} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">مبلغ کل قرارداد (تومان) *</label>
                  <input
                    type="number"
                    required
                    value={contractForm.totalAmount}
                    onChange={(e) => setContractForm({ ...contractForm, totalAmount: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-emerald-400 font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">مبلغ بیعانه دریافتی</label>
                  <input
                    type="number"
                    value={contractForm.depositAmount}
                    onChange={(e) => setContractForm({ ...contractForm, depositAmount: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">تاریخ انعقاد قرارداد</label>
                  <input
                    type="date"
                    value={contractForm.contractDate}
                    onChange={(e) => setContractForm({ ...contractForm, contractDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">تاریخ تعهد تحویل نهایی</label>
                  <input
                    type="date"
                    value={contractForm.deliveryCommitmentDate}
                    onChange={(e) => setContractForm({ ...contractForm, deliveryCommitmentDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">شروط و تعهدات قرارداد</label>
                <textarea
                  rows={4}
                  value={contractForm.termsAndConditions}
                  onChange={(e) => setContractForm({ ...contractForm, termsAndConditions: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddContractModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold transition"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold transition shadow-lg shadow-amber-600/30"
                >
                  ثبت و صدور قرارداد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: ADD PAYMENT                                                      */}
      {/* ========================================================================= */}
      {showAddPaymentModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-400" />
                ثبت دریافت وجه / پیش‌پرداخت
              </h3>
              <button onClick={() => setShowAddPaymentModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">مبلغ دریافتی (تومان) *</label>
                <input
                  type="number"
                  required
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">نوع پرداخت</label>
                  <select
                    value={paymentForm.paymentType}
                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentType: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none"
                  >
                    <option value="deposit">پیش‌پرداخت اولیه</option>
                    <option value="installment_1">قسط اول</option>
                    <option value="installment_2">قسط دوم</option>
                    <option value="settlement">تسویه حساب نهایی</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">شیوه پرداخت</label>
                  <select
                    value={paymentForm.paymentMethod}
                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none"
                  >
                    <option value="card_transfer">کارت به کارت</option>
                    <option value="pos">کارتخوان POS</option>
                    <option value="cash">نقدی</option>
                    <option value="cheque">چک بانکی صیادی</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">کد پیگیری / شماره ارجاع تراکنش</label>
                <input
                  type="text"
                  value={paymentForm.referenceCode}
                  onChange={(e) => setPaymentForm({ ...paymentForm, referenceCode: e.target.value })}
                  placeholder="مثال: 987654321"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">توضیحات</label>
                <input
                  type="text"
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  placeholder="توضیحات بابت این قسط یا واریز..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddPaymentModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold transition"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition shadow-lg"
                >
                  ثبت دریافت وجه
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: ADD EXPENSE                                                      */}
      {/* ========================================================================= */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-rose-400" />
                ثبت هزینه مستقیم پروژه
              </h3>
              <button onClick={() => setShowAddExpenseModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">دسته‌بندی هزینه</label>
                <select
                  value={expenseForm.expenseCategory}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expenseCategory: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none"
                >
                  {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">عنوان هزینه *</label>
                <input
                  type="text"
                  required
                  value={expenseForm.title}
                  onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                  placeholder="مثال: دستمزد تصویربردار دوم، ورودی عمارت، چاپ آلبوم ژورنال"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">مبلغ هزینه (تومان) *</label>
                  <input
                    type="number"
                    required
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-rose-400 font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">دریافت‌کننده / مجری</label>
                  <input
                    type="text"
                    value={expenseForm.recipientName}
                    onChange={(e) => setExpenseForm({ ...expenseForm, recipientName: e.target.value })}
                    placeholder="نام شخص یا شرکت"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddExpenseModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold transition"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-bold transition shadow-lg shadow-rose-600/30"
                >
                  ثبت هزینه
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: ADD TIMELINE NOTE (LOGGING)                                      */}
      {/* ========================================================================= */}
      {showAddTimelineLogModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-400" />
                ثبت رویداد / یادداشت پیگیری در تایم‌لاین
              </h3>
              <button onClick={() => setShowAddTimelineLogModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTimelineNote} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">عنوان رویداد *</label>
                <input
                  type="text"
                  required
                  value={timelineNoteForm.title}
                  onChange={(e) => setTimelineNoteForm({ ...timelineNoteForm, title: e.target.value })}
                  placeholder="مثال: تماس تلفنی جهت هماهنگی ساعت حضور در عمارت"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">شرح کامل رویداد</label>
                <textarea
                  rows={3}
                  value={timelineNoteForm.description}
                  onChange={(e) => setTimelineNoteForm({ ...timelineNoteForm, description: e.target.value })}
                  placeholder="جزئیات مذاکرات، تصمیمات گرفته‌شده و هماهنگی‌های لازم..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddTimelineLogModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold transition"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition shadow-lg shadow-indigo-600/30"
                >
                  ثبت در تایم‌لاین
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 8: OFFICIAL ATELIER CONTRACT PRINT PREVIEW                          */}
      {/* ========================================================================= */}
      {showContractPrintModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-slate-900 rounded-2xl w-full max-w-3xl p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-300 pb-4">
              <div className="text-right">
                <h2 className="text-xl font-black text-slate-900">قرارداد رسمی ارائه خدمات تصویربرداری و عکاسی</h2>
                <p className="text-xs text-slate-600 mt-1">آتلیه و استودیوی فیلم و عکس حکمت - نسخه طرفین قرارداد</p>
              </div>
              <div className="text-left font-mono text-xs text-slate-700">
                <div>شماره: <strong>{showContractPrintModal.contractNumber}</strong></div>
                <div>تاریخ: {toJalaliDate(showContractPrintModal.contractDate)}</div>
              </div>
            </div>

            <div className="bg-slate-100 p-4 rounded-xl text-xs space-y-2 border border-slate-200">
              <div className="grid grid-cols-2 gap-4">
                <div><strong>طرف اول (مجری):</strong> استودیو فیلم و عکس حکمت</div>
                <div><strong>طرف دوم (کارفرما):</strong> {showContractPrintModal.project?.customerName} ({showContractPrintModal.project?.customerMobile})</div>
                <div><strong>عنوان رویداد:</strong> {showContractPrintModal.project?.title}</div>
                <div><strong>تاریخ مراسم:</strong> {toJalaliDate(showContractPrintModal.project?.eventDate)}</div>
                <div><strong>لوکیشن اجرا:</strong> {showContractPrintModal.project?.mainLocation || "طبق هماهنگی"}</div>
                <div><strong>تعهد تحویل نهایی:</strong> {toJalaliDate(showContractPrintModal.deliveryCommitmentDate)}</div>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-slate-900 border-b pb-1">مبلغ و نحوه پرداخت:</h4>
              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-lg border">
                <div>مبلغ کل قرارداد: <strong>{formatMoney(showContractPrintModal.totalAmount)}</strong></div>
                <div>بیعانه نقدی: <strong>{formatMoney(showContractPrintModal.depositAmount)}</strong></div>
                <div>مانده در {showContractPrintModal.installmentsCount} قسط</div>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-slate-900 border-b pb-1">شروط و تعهدات:</h4>
              <p className="text-slate-700 whitespace-pre-line leading-relaxed bg-slate-50 p-3 rounded-lg border">
                {showContractPrintModal.termsAndConditions}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-300 text-center text-xs">
              <div>
                <div className="font-bold mb-10">امضا و اثرانگشت کارفرما</div>
                <div className="border-t border-slate-400 pt-1 text-slate-500">{showContractPrintModal.project?.customerName}</div>
              </div>
              <div>
                <div className="font-bold mb-10">مهر و امضای مدیریت استودیو حکمت</div>
                <div className="border-t border-slate-400 pt-1 text-slate-500">مدیریت آتلیه</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={() => setShowContractPrintModal(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition"
              >
                بستن
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                چاپ رسمی قرارداد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
