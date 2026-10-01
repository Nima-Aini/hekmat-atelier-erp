"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Users,
  UserCheck,
  UserX,
  Phone,
  Calendar,
  Award,
  DollarSign,
  Plus,
  Search,
  CheckCircle2,
  Clock3,
  Edit3,
  Trash2,
  Star,
  ExternalLink,
  Camera,
  Video,
  Film,
  Scissors,
  Activity,
  Briefcase,
  AlertCircle,
  FileText,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  Check,
  X,
  Layers,
  ArrowRight,
} from "lucide-react";
import { formatMoney, toJalaliDate } from "@/lib/dateUtils";

interface SkillItem {
  id: string;
  skillTitle: string;
  proficiencyLevel: "junior" | "mid" | "senior" | "master";
  certified: boolean;
  notes?: string | null;
  createdAt: string;
}

interface SalaryRecord {
  id: string;
  studioProjectId?: string | null;
  salaryType: "fixed_salary" | "per_project" | "per_hour" | "per_photo" | "percentage";
  rateAmount: string;
  unitsCount: string;
  totalCalculated: string;
  paymentStatus: "pending" | "approved" | "paid";
  settlementDate?: string | null;
  notes?: string | null;
  createdAt: string;
  projectTitle?: string | null;
}

interface PersonnelDetail {
  id: string;
  code: string;
  employeeId?: string | null;
  fullName: string;
  mobile: string;
  personnelType: "employee" | "temporary_worker";
  primaryRole?: string | null;
  status: "active" | "on_leave" | "inactive";
  experienceYears?: number | null;
  rating?: number | null;
  portfolioUrl?: string | null;
  notes?: string | null;
  createdAt: string;
  skills: SkillItem[];
  salaryRecords: SalaryRecord[];
  reservations: any[];
  activityLogs?: Array<{
    id: string;
    action: string;
    title: string;
    description: string;
    timestamp: string;
    category: "info" | "skill" | "financial" | "equipment" | "project";
  }>;
}

const POPULAR_SKILLS = [
  "Photography (عکاسی آتلیه و فضای باز)",
  "Videography (تصویربرداری و فیلمبرداری سینمایی)",
  "Editing (تدوین و ادیت ویدیویی)",
  "Drone (تصویربرداری هوایی و هلی‌شات)",
  "Retouch (رتوش پیشرفته چهره و عکس)",
  "Lighting (نورپردازی استودیو و پرتابل)",
  "Color Grading (اصلاح رنگ و نور)",
  "Crane Operator (اپراتور کرین و استدی‌کم)",
  "Directing (سناریونویسی و کارگردانی مراسم)",
  "Sound (صدابرداری و میکروفون‌گذاری)",
];

const ROLE_PRESETS = [
  "عکاس آتلیه و عمارت",
  "عکاس فرمالیته و فضای باز",
  "تصویربردار اصلی مراسم",
  "تصویربردار دوم / رونین",
  "اپراتور هلی‌شات و FPV",
  "تدوین‌گر و کلیپ‌ساز",
  "رتوشور و طراح آلبوم",
  "نورپرداز و دستیار صحنه",
  "کارگردان و هماهنگ‌کننده",
];

export function StudioPersonnelView({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [personnelList, setPersonnelList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Selected Personnel Details
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PersonnelDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "skills" | "calendar" | "logs" | "salary">("info");

  // Edit / Form states for Detail Modal
  const [editInfo, setEditInfo] = useState<any>(null);
  const [savingInfo, setSavingInfo] = useState(false);

  // New Skill Form
  const [newSkillTitle, setNewSkillTitle] = useState("");
  const [newSkillLevel, setNewSkillLevel] = useState<"junior" | "mid" | "senior" | "master">("mid");
  const [newSkillCertified, setNewSkillCertified] = useState(false);
  const [newSkillNotes, setNewSkillNotes] = useState("");
  const [addingSkill, setAddingSkill] = useState(false);

  // New Salary Form
  const [salaryType, setSalaryType] = useState<"fixed_salary" | "per_project" | "per_hour" | "per_photo" | "percentage">("per_project");
  const [salaryRate, setSalaryRate] = useState<number | string>("");
  const [salaryUnits, setSalaryUnits] = useState<number | string>("1");
  const [salaryProjectId, setSalaryProjectId] = useState("");
  const [salaryNotes, setSalaryNotes] = useState("");
  const [submittingSalary, setSubmittingSalary] = useState(false);
  const [settlementAccountId, setSettlementAccountId] = useState("");
  const [financialAccounts, setFinancialAccounts] = useState<any[]>([]);

  // New Activity Log note
  const [logNote, setLogNote] = useState("");
  const [addingLog, setAddingLog] = useState(false);

  // Create Personnel Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    fullName: "",
    mobile: "",
    employeeId: "",
    personnelType: "temporary_worker",
    primaryRole: "عکاس آتلیه و عمارت",
    experienceYears: 3,
    portfolioUrl: "",
    notes: "",
    skills: [{ skillTitle: "Photography (عکاسی آتلیه و فضای باز)", skillCategory: "shooting", proficiencyLevel: "senior" }],
  });
  const [creatingPersonnel, setCreatingPersonnel] = useState(false);

  // Studio projects list for selector
  const [projects, setProjects] = useState<any[]>([]);
  const [employeesList, setEmployeesList] = useState<any[]>([]);

  // Load Personnel List
  const loadPersonnel = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/studio/personnel?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setPersonnelList(data.personnel || []);
      }
    } catch (err) {
      console.error("Error loading personnel:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPersonnel();
  }, [search, typeFilter, statusFilter]);

  // Load Projects for dropdowns
  useEffect(() => {
    fetch("/api/studio/projects?pageSize=50")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setProjects(d.projects || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/employees?status=active")
      .then((r) => r.json())
      .then((d) => { if (d.success) setEmployeesList(d.employees || []); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then((d) => { if (d.success) setFinancialAccounts(d.accounts || []); }).catch(() => {});
  }, []);

  // Load Personnel Details
  const loadDetail = async (id: string) => {
    try {
      setLoadingDetail(true);
      const res = await fetch(`/api/studio/personnel/${id}`);
      const data = await res.json();
      if (data.success && data.personnel) {
        setDetail(data.personnel);
        setEditInfo({
          fullName: data.personnel.fullName,
          mobile: data.personnel.mobile,
          employeeId: data.personnel.employeeId || "",
          primaryRole: data.personnel.primaryRole || "",
          personnelType: data.personnel.personnelType,
          status: data.personnel.status,
          experienceYears: data.personnel.experienceYears || 0,
          rating: data.personnel.rating || 5,
          portfolioUrl: data.personnel.portfolioUrl || "",
          notes: data.personnel.notes || "",
        });
      }
    } catch (err) {
      console.error("Error loading personnel detail:", err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleOpenDetail = (p: any, defaultTab: "info" | "skills" | "calendar" | "logs" | "salary" = "info") => {
    setSelectedId(p.id);
    setActiveTab(defaultTab);
    loadDetail(p.id);
  };

  // Save Info
  const handleSaveInfo = async () => {
    if (!selectedId || !editInfo) return;
    try {
      setSavingInfo(true);
      const res = await fetch(`/api/studio/personnel/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editInfo),
      });
      const data = await res.json();
      if (data.success) {
        await loadDetail(selectedId);
        await loadPersonnel();
      } else {
        alert(data.error || "خطا در ذخیره اطلاعات");
      }
    } catch (err) {
      console.error(err);
      alert("خطا در ارتباط با سرور");
    } finally {
      setSavingInfo(false);
    }
  };

  // Add Skill
  const handleAddSkill = async () => {
    if (!selectedId || !newSkillTitle.trim()) {
      alert("لطفاً عنوان مهارت را وارد یا انتخاب نمایید.");
      return;
    }
    try {
      setAddingSkill(true);
      const res = await fetch(`/api/studio/personnel/${selectedId}/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillTitle: newSkillTitle.trim(),
          proficiencyLevel: newSkillLevel,
          certified: newSkillCertified,
          notes: newSkillNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewSkillTitle("");
        setNewSkillNotes("");
        setNewSkillCertified(false);
        await loadDetail(selectedId);
        await loadPersonnel();
      } else {
        alert(data.error || "خطا در ثبت مهارت");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAddingSkill(false);
    }
  };

  // Delete Skill
  const handleDeleteSkill = async (skillId: string) => {
    if (!selectedId || !confirm("آیا از حذف این مهارت اطمینان دارید؟")) return;
    try {
      const res = await fetch(`/api/studio/personnel/${selectedId}/skills/${skillId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        await loadDetail(selectedId);
        await loadPersonnel();
      } else {
        alert(data.error || "خطا در حذف مهارت");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Add Salary
  const handleRecordSalary = async () => {
    if (!selectedId || !salaryRate) {
      alert("لطفاً نرخ دستمزد را مشخص کنید.");
      return;
    }
    try {
      setSubmittingSalary(true);
      const res = await fetch(`/api/studio/personnel/${selectedId}/salary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salaryType,
          rateAmount: Number(salaryRate),
          unitsCount: Number(salaryUnits) || 1,
          studioProjectId: salaryProjectId || undefined,
          notes: salaryNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSalaryRate("");
        setSalaryUnits("1");
        setSalaryNotes("");
        await loadDetail(selectedId);
      } else {
        alert(data.error || "خطا در ثبت دستمزد");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingSalary(false);
    }
  };

  // Update Salary Status (e.g. Paid)
  const handleUpdateSalaryStatus = async (salaryId: string, status: "pending" | "approved" | "paid") => {
    if (!selectedId) return;
    if (status === "paid" && !settlementAccountId) { alert("حساب پرداخت دستمزد را انتخاب کنید."); return; }
    try {
      const res = await fetch(`/api/studio/personnel/${selectedId}/salary/${salaryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ paymentStatus: status, accountId: settlementAccountId }),
      });
      const data = await res.json();
      if (data.success) {
        await loadDetail(selectedId);
      } else {
        alert(data.error || "خطا در تغییر وضعیت دستمزد");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Salary Record
  const handleDeleteSalaryRecord = async (salaryId: string) => {
    if (!selectedId || !confirm("آیا از حذف این رکورد مالی اطمینان دارید؟")) return;
    try {
      const res = await fetch(`/api/studio/personnel/${selectedId}/salary/${salaryId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        await loadDetail(selectedId);
      } else {
        alert(data.error || "خطا در حذف رکورد دستمزد");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Create Personnel Submit
  const handleCreatePersonnel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.fullName.trim() || !createForm.mobile.trim()) {
      alert("نام و شماره موبایل الزامی است.");
      return;
    }
    try {
      setCreatingPersonnel(true);
      const res = await fetch("/api/studio/personnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        setCreateForm({
          fullName: "",
          mobile: "",
          employeeId: "",
          personnelType: "temporary_worker",
          primaryRole: "عکاس آتلیه و عمارت",
          experienceYears: 3,
          portfolioUrl: "",
          notes: "",
          skills: [{ skillTitle: "Photography (عکاسی آتلیه و فضای باز)", skillCategory: "shooting", proficiencyLevel: "senior" }],
        });
        await loadPersonnel();
        if (data.personnel?.id) {
          handleOpenDetail(data.personnel);
        }
      } else {
        alert(data.error || "خطا در ثبت پرسنل جدید");
      }
    } catch (err) {
      console.error(err);
      alert("خطا در برقراری ارتباط با سرور");
    } finally {
      setCreatingPersonnel(false);
    }
  };

  // Filtered personnel
  const filteredPersonnel = useMemo(() => {
    return personnelList.filter((p) => {
      if (roleFilter !== "all" && p.primaryRole !== roleFilter) return false;
      return true;
    });
  }, [personnelList, roleFilter]);

  // Quick stats
  const stats = useMemo(() => {
    const total = personnelList.length;
    const active = personnelList.filter((p) => p.status === "active").length;
    const freelancers = personnelList.filter((p) => p.personnelType === "temporary_worker").length;
    const employees = personnelList.filter((p) => p.personnelType === "employee").length;
    return { total, active, freelancers, employees };
  }, [personnelList]);

  // Skill level visual helper
  const getSkillLevelBadge = (level: string) => {
    switch (level) {
      case "master":
        return { label: "استادکار / ارشد (Master)", bg: "bg-purple-950/60 border-purple-800 text-purple-300", percent: 100 };
      case "senior":
        return { label: "حرفه‌ای / پیشرفته (Senior)", bg: "bg-blue-950/60 border-blue-800 text-blue-300", percent: 75 };
      case "mid":
        return { label: "متوسط (Mid-Level)", bg: "bg-emerald-950/60 border-emerald-800 text-emerald-300", percent: 50 };
      default:
        return { label: "مقدماتی (Junior)", bg: "bg-amber-950/60 border-amber-800 text-amber-300", percent: 25 };
    }
  };

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Top Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">عوامل و پرسنل آتلیه (Personnel & Crew)</h1>
              <p className="text-xs text-slate-400">
                مدیریت جامع پرونده عوامل، مهارت‌ها با سطوح تسلط، تقویم کاری و آفیش‌ها، سوابق فعالیت و محاسبات دستمزد
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition shadow-lg shadow-blue-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>ثبت نیروی جدید آتلیه</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>کل عوامل و کادر</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white">{stats.total} <span className="text-xs font-normal text-slate-500">نفر</span></div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>نیروهای فعال و آماده آفیش</span>
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{stats.active} <span className="text-xs font-normal text-slate-500">نفر</span></div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>آزادکار و پروژه‌ای (Freelancer)</span>
            <Briefcase className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-400">{stats.freelancers} <span className="text-xs font-normal text-slate-500">نفر</span></div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>پرسنل استخدامی ثابت</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400">{stats.employees} <span className="text-xs font-normal text-slate-500">نفر</span></div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="جستجوی نام، شماره تماس، تخصص، یا توضیحات..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="فیلتر نقش تخصصی"
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="all">همه نقش‌ها و تخصص‌ها</option>
          {ROLE_PRESETS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="فیلتر نوع همکاری"
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="all">نوع همکاری (همه)</option>
          <option value="freelancer">آزادکار / پروژه‌ای</option>
          <option value="employee">استخدامی ثابت</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="فیلتر وضعیت پرسنل"
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="all">وضعیت (همه)</option>
          <option value="active">فعال</option>
          <option value="on_leave">مرخصی</option>
          <option value="inactive">غیرفعال</option>
        </select>
      </div>

      {/* Personnel Grid */}
      {loading ? (
        <div className="text-center py-16 text-slate-500 text-sm">در حال بارگذاری فهرست عوامل آتلیه...</div>
      ) : filteredPersonnel.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl">
          <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <div className="text-base font-semibold text-slate-300">هیچ نیرویی با این مشخصات یافت نشد</div>
          <p className="text-xs text-slate-500 mt-1">با زدن دکمه «ثبت نیروی جدید آتلیه» پرونده نخستین فرد را ایجاد کنید.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPersonnel.map((p) => (
            <div
              key={p.id}
              onClick={() => handleOpenDetail(p)}
              className="group bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-blue-500/40 rounded-2xl p-5 transition cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600/30 to-purple-600/30 border border-blue-500/20 flex items-center justify-center text-base font-bold text-white">
                      {p.fullName.slice(0, 1)}
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white group-hover:text-blue-400 transition flex items-center gap-2">
                        <span>{p.fullName}</span>
                        {p.rating && (
                          <span className="flex items-center text-[10px] text-amber-400">
                            <Star className="w-3 h-3 fill-amber-400 ml-0.5" />
                            {p.rating}
                          </span>
                        )}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">{p.primaryRole || "عوامل استودیو"}</p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      p.status === "active"
                        ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                        : p.status === "on_leave"
                        ? "bg-amber-950/60 border-amber-800 text-amber-300"
                        : "bg-slate-800/80 border-slate-700 text-slate-400"
                    }`}
                  >
                    {p.status === "active" ? "فعال" : p.status === "on_leave" ? "مرخصی" : "غیرفعال"}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400 mb-3">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-slate-500" />
                    <span dir="ltr">{p.mobile}</span>
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300">
                    {p.personnelType === "employee" ? "استخدامی ثابت" : "آزادکار / پروژه‌ای"}
                  </span>
                </div>

                {/* Skills tags preview */}
                {p.skills && p.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 my-2">
                    {p.skills.slice(0, 4).map((s: any) => (
                      <span
                        key={s.id}
                        className="text-[10px] px-2 py-0.5 bg-slate-800/70 border border-slate-700/60 rounded-md text-slate-300"
                      >
                        {s.skillTitle.split(" ")[0]}
                        <span className="text-slate-500 mr-1">({s.proficiencyLevel})</span>
                      </span>
                    ))}
                    {p.skills.length > 4 && (
                      <span className="text-[10px] text-slate-500 px-1 py-0.5">+{p.skills.length - 4}</span>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic my-2">هنوز مهارتی ثبت نشده است</p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span className="text-slate-500">کد: {p.code}</span>
                <span className="text-blue-400 group-hover:translate-x-[-2px] transition flex items-center gap-1 font-medium">
                  مدیریت پرونده و سوابق
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* DETAIL DRAWER / MODAL WITH THE 5 TABS: اطلاعات, مهارت‌ها, تقویم کاری, Log فعالیت, دستمزد */}
      {/* ========================================================================= */}
      {selectedId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center font-bold text-blue-400">
                  {detail?.fullName.slice(0, 1) || "؟"}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {detail?.fullName}
                    <span className="text-xs font-normal text-slate-400">({detail?.primaryRole || "عوامل استودیو"})</span>
                  </h3>
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <span dir="ltr">{detail?.mobile}</span>
                    <span>•</span>
                    <span className="text-blue-400 font-mono text-[11px]">{detail?.code}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedId(null);
                  setDetail(null);
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal 5 Tabs Header */}
            <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 overflow-x-auto">
              <button
                onClick={() => setActiveTab("info")}
                className={`py-3 px-4 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition flex items-center gap-2 ${
                  activeTab === "info"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>اطلاعات</span>
              </button>

              <button
                onClick={() => setActiveTab("skills")}
                className={`py-3 px-4 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition flex items-center gap-2 ${
                  activeTab === "skills"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Award className="w-4 h-4" />
                <span>مهارت‌ها ({detail?.skills?.length || 0})</span>
              </button>

              <button
                onClick={() => setActiveTab("calendar")}
                className={`py-3 px-4 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition flex items-center gap-2 ${
                  activeTab === "calendar"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>تقویم کاری</span>
              </button>

              <button
                onClick={() => setActiveTab("logs")}
                className={`py-3 px-4 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition flex items-center gap-2 ${
                  activeTab === "logs"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>Log فعالیت</span>
              </button>

              <button
                onClick={() => setActiveTab("salary")}
                className={`py-3 px-4 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition flex items-center gap-2 ${
                  activeTab === "salary"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <DollarSign className="w-4 h-4" />
                <span>دستمزد ({detail?.salaryRecords?.length || 0})</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
              {loadingDetail ? (
                <div className="text-center py-12 text-slate-500 text-sm">در حال دریافت اطلاعات جامع پرونده...</div>
              ) : !detail ? (
                <div className="text-center py-12 text-red-400 text-sm">اطلاعات پرسنل در دسترس نیست.</div>
              ) : (
                <>
                  {/* TAB 1: اطلاعات (Info) */}
                  {activeTab === "info" && editInfo && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1.5 font-medium">نام و نام خانوادگی</label>
                          <input
                            type="text"
                            value={editInfo.fullName}
                            onChange={(e) => setEditInfo({ ...editInfo, fullName: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-slate-400 mb-1.5 font-medium">شماره موبایل</label>
                          <input
                            type="text"
                            dir="ltr"
                            value={editInfo.mobile}
                            onChange={(e) => setEditInfo({ ...editInfo, mobile: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 text-left"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-slate-400 mb-1.5 font-medium">نقش اصلی در آتلیه</label>
                          <select
                            value={editInfo.primaryRole}
                            onChange={(e) => setEditInfo({ ...editInfo, primaryRole: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                          >
                            {ROLE_PRESETS.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs text-slate-400 mb-1.5 font-medium">نوع همکاری</label>
                          <select
                            value={editInfo.personnelType}
                            onChange={(e) => setEditInfo({ ...editInfo, personnelType: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                          >
                            <option value="temporary_worker">آزادکار / پروژه‌ای (Freelancer)</option>
                            <option value="employee">پرسنل استخدامی ثابت (Full-time)</option>
                          </select>
                        </div>

                        {employeesList.length > 0 && (
                          <div>
                            <label className="block text-xs text-slate-400 mb-1.5 font-medium">حساب سازمانی / دسترسی سیستم</label>
                            <select value={editInfo.employeeId || ""} onChange={(e) => setEditInfo({ ...editInfo, employeeId: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500">
                              <option value="">بدون حساب ورود</option>
                              {employeesList.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} — {employee.mobile}</option>)}
                            </select>
                          </div>
                        )}

                        <div>
                          <label className="block text-xs text-slate-400 mb-1.5 font-medium">سابقه کار تخصصی (سال)</label>
                          <input
                            type="number"
                            min="0"
                            max="40"
                            value={editInfo.experienceYears}
                            onChange={(e) => setEditInfo({ ...editInfo, experienceYears: Number(e.target.value) })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-slate-400 mb-1.5 font-medium">امتیاز و رتبه کیفی (۱ تا ۵)</label>
                          <input
                            type="number"
                            min="1"
                            max="5"
                            step="0.5"
                            value={editInfo.rating}
                            onChange={(e) => setEditInfo({ ...editInfo, rating: Number(e.target.value) })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-slate-400 mb-1.5 font-medium">لینک نمونه کارها / پورتفولیو</label>
                          <input
                            type="text"
                            dir="ltr"
                            placeholder="https://instagram.com/... یا لینک گوگل درایو"
                            value={editInfo.portfolioUrl}
                            onChange={(e) => setEditInfo({ ...editInfo, portfolioUrl: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 text-left"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-slate-400 mb-1.5 font-medium">وضعیت حضور و فعالیت</label>
                          <select
                            value={editInfo.status}
                            onChange={(e) => setEditInfo({ ...editInfo, status: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                          >
                            <option value="active">فعال (آماده آفیش)</option>
                            <option value="on_leave">مرخصی موقت</option>
                            <option value="inactive">غیرفعال / قطع همکاری</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400 mb-1.5 font-medium">توضیحات تکمیلی و یادداشت‌ها</label>
                        <textarea
                          rows={3}
                          value={editInfo.notes}
                          onChange={(e) => setEditInfo({ ...editInfo, notes: e.target.value })}
                          placeholder="تجهیزات اختصاصی همراه، تجربیات ویژه، نکات هماهنگی با عروس و داماد..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                        <button
                          onClick={handleSaveInfo}
                          disabled={savingInfo}
                          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition"
                        >
                          <Check className="w-4 h-4" />
                          <span>{savingInfo ? "در حال ذخیره..." : "ذخیره تغییرات پرونده"}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: مهارت‌ها (Skills System) */}
                  {activeTab === "skills" && (
                    <div className="space-y-6">
                      {/* Add new skill form */}
                      <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 space-y-4">
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <Plus className="w-4 h-4 text-blue-400" />
                          <span>افزودن مهارت تخصصی جدید</span>
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block text-xs text-slate-400 mb-1 font-medium">انتخاب یا تایپ مهارت</label>
                            <input
                              type="text"
                              list="popular-skills-list"
                              placeholder="مثال: Photography یا Drone یا تایپ دلخواه..."
                              value={newSkillTitle}
                              onChange={(e) => setNewSkillTitle(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                            />
                            <datalist id="popular-skills-list">
                              {POPULAR_SKILLS.map((ps) => (
                                <option key={ps} value={ps} />
                              ))}
                            </datalist>
                          </div>

                          <div>
                            <label className="block text-xs text-slate-400 mb-1 font-medium">سطح تسلط (Skill Level)</label>
                            <select
                              value={newSkillLevel}
                              onChange={(e) => setNewSkillLevel(e.target.value as any)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                            >
                              <option value="junior">مقدماتی (Junior - ۲۵٪)</option>
                              <option value="mid">متوسط (Mid-Level - ۵۰٪)</option>
                              <option value="senior">پیشرفته / حرفه‌ای (Senior - ۷۵٪)</option>
                              <option value="master">استادکار / ارشد (Master - ۱۰۰٪)</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={newSkillCertified}
                              onChange={(e) => setNewSkillCertified(e.target.checked)}
                              className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-blue-600 focus:ring-0"
                            />
                            <span className="flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                              دارای مدرک رسمی یا سرتیفیکیت معتبر (Certified)
                            </span>
                          </label>

                          <button
                            onClick={handleAddSkill}
                            disabled={addingSkill || !newSkillTitle.trim()}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{addingSkill ? "در حال ثبت..." : "افزودن به مهارت‌های پرسنل"}</span>
                          </button>
                        </div>
                      </div>

                      {/* Current skills list */}
                      <div>
                        <h4 className="text-xs font-semibold text-slate-400 mb-3">مهارت‌های ثبت‌شده این نیرو:</h4>
                        {detail.skills.length === 0 ? (
                          <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                            هنوز هیچ مهارتی برای این نیرو ثبت نگردیده است.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {detail.skills.map((s) => {
                              const badge = getSkillLevelBadge(s.proficiencyLevel);
                              return (
                                <div
                                  key={s.id}
                                  className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <div className="text-sm font-bold text-white flex items-center gap-2">
                                        <span>{s.skillTitle}</span>
                                        {s.certified && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-300 flex items-center gap-0.5">
                                            <ShieldCheck className="w-3 h-3" />
                                            مدرک‌دار
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-slate-400 mt-1">
                                        سطح تسلط: <span className="text-slate-200">{badge.label}</span>
                                      </div>
                                    </div>

                                    <button
                                      onClick={() => handleDeleteSkill(s.id)}
                                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition"
                                      title="حذف مهارت"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  {/* Progress bar */}
                                  <div>
                                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                      <div
                                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                                        style={{ width: `${badge.percent}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: تقویم کاری (Calendar) */}
                  {activeTab === "calendar" && (
                    <div className="space-y-6">
                      <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3 text-xs text-slate-300">
                          <Calendar className="w-4 h-4 text-blue-400" />
                          <span>برنامه کاری، آفیش‌ها، پروژه‌های تحت همکاری و رویدادهای تقویم</span>
                        </div>
                      </div>

                      {/* Associated Reservations & Shoots */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-slate-400">آفیش‌ها و رزروهای تجهیزات و صحنه:</h4>
                        {detail.reservations && detail.reservations.length > 0 ? (
                          <div className="space-y-2">
                            {detail.reservations.map((r) => (
                              <div
                                key={r.id}
                                className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs"
                              >
                                <div>
                                  <div className="font-bold text-white">{r.projectTitle || "پروژه آتلیه"}</div>
                                  <div className="text-slate-400 text-[11px] mt-0.5">
                                    بازه زمانی: {toJalaliDate(r.reservedFrom)} تا {toJalaliDate(r.reservedTo)}
                                  </div>
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] border ${
                                    r.status === "checked_out"
                                      ? "bg-purple-950/60 border-purple-800 text-purple-300"
                                      : r.status === "returned"
                                      ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                                      : "bg-blue-950/60 border-blue-800 text-blue-300"
                                  }`}
                                >
                                  {r.status === "checked_out"
                                    ? "روی ست / در حال استفاده"
                                    : r.status === "returned"
                                    ? "عودت داده شده"
                                    : "رزرو شده"}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                            در حال حاضر آفیش یا رزرو فعالی برای این نیرو ثبت نشده است.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 4: Log فعالیت (Activity Log) */}
                  {activeTab === "logs" && (
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-slate-400">تایم‌لاین رویدادها و فعالیت‌های ثبت‌شده:</h4>

                        {detail.activityLogs && detail.activityLogs.length > 0 ? (
                          <div className="relative border-r border-slate-800 pr-5 space-y-4">
                            {detail.activityLogs.map((log) => (
                              <div key={log.id} className="relative">
                                {/* Dot indicator */}
                                <div className="absolute -right-[25px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-slate-900" />
                                <div>
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs font-bold text-white">{log.title}</div>
                                    <div className="text-[10px] text-slate-500">
                                      {toJalaliDate(log.timestamp, { showTime: true })}
                                    </div>
                                  </div>
                                  <div className="text-xs text-slate-400 mt-1">{log.description}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                            هنوز لاگ فعالیتی ثبت نشده است.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 5: دستمزد (Salary) */}
                  {activeTab === "salary" && (
                    <div className="space-y-6">
                      {/* Financial Summary Cards */}
                      {(() => {
                        const totalCalculated = detail.salaryRecords.reduce(
                          (sum, r) => sum + Number(r.totalCalculated || 0),
                          0
                        );
                        const paidTotal = detail.salaryRecords
                          .filter((r) => r.paymentStatus === "paid")
                          .reduce((sum, r) => sum + Number(r.totalCalculated || 0), 0);
                        const pendingTotal = totalCalculated - paidTotal;

                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
                              <div className="text-slate-400 text-xs">مجموع دستمزد محاسبه‌شده</div>
                              <div className="text-lg font-bold text-white mt-1">
                                {formatMoney(totalCalculated)}
                              </div>
                            </div>

                            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
                              <div className="text-slate-400 text-xs">مبالغ تسویه‌شده (پرداخت‌شده)</div>
                              <div className="text-lg font-bold text-emerald-400 mt-1">
                                {formatMoney(paidTotal)}
                              </div>
                            </div>

                            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
                              <div className="text-slate-400 text-xs">مطالبات در انتظار پرداخت</div>
                              <div className="text-lg font-bold text-amber-400 mt-1">
                                {formatMoney(pendingTotal)}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* New Salary Record Form */}
                      <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 space-y-4">
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-emerald-400" />
                          <span>ثبت کارکرد / محاسبه دستمزد جدید</span>
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs text-slate-400 mb-1 font-medium">نوع دستمزد</label>
                            <select
                              value={salaryType}
                              onChange={(e) => setSalaryType(e.target.value as any)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                            >
                              <option value="per_project">پروژه‌ای (Per Project - دستمزد مقطوع)</option>
                              <option value="per_hour">فعالیتی / ساعتی (Per Hour - بر اساس ساعت آفیش)</option>
                              <option value="per_photo">فعالیتی / قطعه‌ای (Per Photo - به ازای هر عکس/فریم)</option>
                              <option value="fixed_salary">حقوق ثابت (Fixed Salary - حقوق ماهانه پایه)</option>
                              <option value="percentage">درصدی (Percentage - درصد از قرارداد)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs text-slate-400 mb-1 font-medium">نرخ واحد (تومان)</label>
                            <input
                              type="number"
                              min="0"
                              placeholder="مثال: ۵۰۰,۰۰۰"
                              value={salaryRate}
                              onChange={(e) => setSalaryRate(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-slate-400 mb-1 font-medium">
                              تعداد واحد / ساعت کارکرد
                            </label>
                            <input
                              type="number"
                              min="0.5"
                              step="0.5"
                              value={salaryUnits}
                              onChange={(e) => setSalaryUnits(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-slate-400 mb-1 font-medium">انتساب به پروژه (اختیاری)</label>
                            <select
                              value={salaryProjectId}
                              onChange={(e) => setSalaryProjectId(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                            >
                              <option value="">بدون انتساب به پروژه خاص</option>
                              {projects.map((pr) => (
                                <option key={pr.id} value={pr.id}>
                                  {pr.projectNumber} - {pr.title}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-xs text-slate-400 mb-1 font-medium">شرح کارکرد</label>
                            <input
                              type="text"
                              placeholder="مثال: ۸ ساعت تصویربرداری فرمالیته شمال یا ادیت کلیپ روز عروسی..."
                              value={salaryNotes}
                              onChange={(e) => setSalaryNotes(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>

                        {/* Live calculation preview */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                          <div className="text-xs text-slate-300">
                            مبلغ کل محاسبه‌شده:{" "}
                            <span className="font-bold text-emerald-400 text-sm">
                              {formatMoney((Number(salaryRate) || 0) * (Number(salaryUnits) || 1))}
                            </span>
                          </div>

                          <button
                            onClick={handleRecordSalary}
                            disabled={submittingSalary || !salaryRate}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{submittingSalary ? "در حال محاسبه..." : "ثبت کارکرد مالی در سرور"}</span>
                          </button>
                        </div>
                      </div>

                      {/* Salary Records List */}
                      <div>
                        <div className="mb-3">
                          <label className="mb-1 block text-xs font-medium text-slate-400">حساب پرداخت دستمزد</label>
                          <select value={settlementAccountId} onChange={(e) => setSettlementAccountId(e.target.value)} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white">
                            <option value="">انتخاب حساب بانکی یا صندوق</option>
                            {financialAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {formatMoney(account.balance)}</option>)}
                          </select>
                        </div>
                        <h4 className="text-xs font-semibold text-slate-400 mb-3">سوابق دستمزد و کارکردها:</h4>

                        {detail.salaryRecords.length === 0 ? (
                          <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                            هنوز رکوردی برای دستمزد این نیرو ثبت نگردیده است.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {detail.salaryRecords.map((sr) => (
                              <div
                                key={sr.id}
                                className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                              >
                                <div>
                                  <div className="font-bold text-white flex items-center gap-2">
                                    <span>{formatMoney(sr.totalCalculated)}</span>
                                    <span className="text-[11px] font-normal text-slate-400">
                                      ({Number(sr.rateAmount).toLocaleString("fa-IR")} × {Number(sr.unitsCount)} واحد)
                                    </span>
                                  </div>
                                  <div className="text-slate-400 text-[11px] mt-0.5 flex flex-wrap items-center gap-2">
                                    <span>
                                      نوع:{" "}
                                      {sr.salaryType === "fixed_salary"
                                        ? "حقوق ثابت"
                                        : sr.salaryType === "per_project"
                                        ? "پروژه‌ای"
                                        : sr.salaryType === "per_hour"
                                        ? "ساعتی"
                                        : sr.salaryType === "per_photo"
                                        ? "قطعه‌ای"
                                        : "درصدی"}
                                    </span>
                                    {sr.projectTitle && <span>• پروژه: {sr.projectTitle}</span>}
                                    <span>• تاریخ: {toJalaliDate(sr.createdAt)}</span>
                                    {sr.notes && <span className="text-slate-500">• {sr.notes}</span>}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-center">
                                  <span
                                    className={`px-2.5 py-0.5 rounded-full text-[10px] border ${
                                      sr.paymentStatus === "paid"
                                        ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                                        : sr.paymentStatus === "approved"
                                        ? "bg-blue-950/60 border-blue-800 text-blue-300"
                                        : "bg-amber-950/60 border-amber-800 text-amber-300"
                                    }`}
                                  >
                                    {sr.paymentStatus === "paid"
                                      ? "تسویه شده"
                                      : sr.paymentStatus === "approved"
                                      ? "تایید شده"
                                      : "در انتظار پرداخت"}
                                  </span>

                                  {sr.paymentStatus !== "paid" && (
                                    <button
                                      onClick={() => handleUpdateSalaryStatus(sr.id, "paid")}
                                      className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-[11px] font-medium transition"
                                    >
                                      تسویه شد
                                    </button>
                                  )}

                                  <button
                                    onClick={() => handleDeleteSalaryRecord(sr.id)}
                                    className="p-1 text-slate-500 hover:text-red-400 transition"
                                    title="حذف رکورد"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE NEW PERSONNEL */}
      {/* ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                <span>ثبت نیروی جدید در کادر آتلیه</span>
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePersonnel} className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1 font-medium">نام و نام خانوادگی *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: علی رضایی"
                  value={createForm.fullName}
                  onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">شماره موبایل *</label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    placeholder="0912..."
                    value={createForm.mobile}
                    onChange={(e) => setCreateForm({ ...createForm, mobile: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500 text-left"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">نوع همکاری</label>
                  <select
                    value={createForm.personnelType}
                    onChange={(e) => setCreateForm({ ...createForm, personnelType: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="temporary_worker">آزادکار / پروژه‌ای</option>
                    <option value="employee">پرسنل استخدامی ثابت</option>
                  </select>
                </div>
              </div>

              {employeesList.length > 0 && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">حساب سازمانی مرتبط (اختیاری)</label>
                  <select
                    value={createForm.employeeId}
                    onChange={(e) => setCreateForm({ ...createForm, employeeId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">بدون حساب ورود</option>
                    {employeesList.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} — {employee.mobile}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-400 mb-1 font-medium">نقش اصلی</label>
                <select
                  value={createForm.primaryRole}
                  onChange={(e) => setCreateForm({ ...createForm, primaryRole: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  {ROLE_PRESETS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1 font-medium">لینک نمونه کارها / اینستاگرام</label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="https://..."
                  value={createForm.portfolioUrl}
                  onChange={(e) => setCreateForm({ ...createForm, portfolioUrl: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500 text-left"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white transition"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={creatingPersonnel}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition"
                >
                  {creatingPersonnel ? "در حال ثبت..." : "ثبت و ایجاد پرونده"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
