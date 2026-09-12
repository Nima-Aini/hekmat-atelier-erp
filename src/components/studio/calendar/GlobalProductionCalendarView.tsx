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

export const GlobalProductionCalendarView: React.FC<GlobalProductionCalendarViewProps> = ({
  personnelList,
  equipmentList,
  globalEvents,
  equipmentReservationsList,
  onOpenProjectWorkspace,
}) => {
  const [viewMode, setViewMode] = useState<"month" | "week" | "day" | "agenda">("month");
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
    setSelectedDayYMD(toBusinessGregorianDateString(new Date()));
  };

  // Workload analyzer for any gregorian date YYYY-MM-DD
  const analyzeWorkload = (ymdStr: string) => {
    const eventsOnDay = globalEvents.filter((e) => {
      if (!e.startTime) return false;
      return toBusinessGregorianDateString(e.startTime) === ymdStr && e.eventType === "shooting";
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
  const firstDayPersianIndex = (getBusinessWeekday(firstDayDate) + 1) % 7;

  const monthCells = [];
  // Empty slots for offset
  for (let i = 0; i < firstDayPersianIndex; i++) {
    monthCells.push({ type: "empty" as const, key: `empty-${i}` });
  }
  // Days of the month
  for (let d = 1; d <= monthLength; d++) {
    const gDate = jalaliToGregorian({ year: currentJalali.year, month: currentJalali.month, day: d });
    const ymdStr = toBusinessGregorianDateString(gDate);
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
    return toBusinessGregorianDateString(e.startTime) === activeYMD;
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
            روزانه
          </button>
          <button
            onClick={() => setViewMode("agenda")}
            className={`px-3 py-1 text-xs font-bold rounded-md transition ${viewMode === "agenda" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            دستورکار
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
              const ymdStr = toBusinessGregorianDateString(gDate);
              const workload = analyzeWorkload(ymdStr);
              const dayEvents = globalEvents.filter(e => e.startTime && toBusinessGregorianDateString(e.startTime) === ymdStr);

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

      {viewMode === "agenda" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
          <h3 className="border-b border-slate-800 pb-3 text-sm font-bold text-white">دستورکار رویدادهای پیش رو</h3>
          <div className="mt-4 space-y-2">
            {globalEvents.filter(event => event.startTime && new Date(event.startTime) >= new Date() && event.status !== "cancelled").sort((a,b) => +new Date(a.startTime) - +new Date(b.startTime)).slice(0, 100).map(event => (
              <button key={event.id} onClick={() => event.projectId && onOpenProjectWorkspace(event.projectId)} className="grid w-full gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3 text-right sm:grid-cols-[160px_1fr_150px] sm:items-center">
                <span className="text-xs font-bold text-indigo-300">{toJalaliDate(event.startTime, { showTime: true })}</span>
                <span><b className="block text-sm text-white">{event.title}</b><small className="text-slate-400">{event.eventType} · {event.location || "بدون لوکیشن"}</small></span>
                <span className="text-xs text-slate-400">{event.projectTitle || "رویداد عمومی"}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
