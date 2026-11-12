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
import { MoneyInput } from "@/components/ui/MoneyInput";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { toJalaliDate, formatMoney, formatNumber, gregorianToJalali, jalaliToGregorian, getJalaliMonthLength, toPersianDigits, getBusinessWeekday, toBusinessGregorianDateString } from "@/lib/dateUtils";

import { ProjectExecutionPlanTab } from "@/components/studio/projects/ProjectExecutionPlanTab";
import { GlobalProductionCalendarView } from "@/components/studio/calendar/GlobalProductionCalendarView";
import { ProjectOperationsPanel } from "@/components/studio/projects/ProjectOperationsPanel";
import { ClientProfile } from "@/components/studio/clients/ClientProfile";
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

export const StudioCRMView: React.FC<{ onNavigate?: (tab: string) => void; initialTab?: "projects" | "customers" | "contracts" | "execution"; initialProjectId?: string | null }> = ({ onNavigate, initialTab = "projects", initialProjectId }) => {
  const [stats, setStats] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEventType, setSelectedEventType] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"projects" | "customers" | "contracts" | "execution">(initialTab);

  // Personnel & Equipment global lists for production planning
  const [personnelList, setPersonnelList] = useState<any[]>([]);
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [financialAccounts, setFinancialAccounts] = useState<any[]>([]);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
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
  const [projectWorkspaceTab, setProjectWorkspaceTab] = useState<"info" | "workflow" | "timeline" | "contracts" | "payments" | "expenses" | "execution">("info");

  // Customer 360 Modal
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const openCustomer = async (id: string) => { const response = await fetch(`/api/studio/customers/${id}`); const data = await response.json(); if (data.success) setSelectedCustomer(data.customer); };

  // Form Modals
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [showAddContractModal, setShowAddContractModal] = useState(false);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [showAddTimelineLogModal, setShowAddTimelineLogModal] = useState(false);
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
    socialConsent: false,
  });

  // Project Form State
  const [projectForm, setProjectForm] = useState(() => ({
    studioCustomerId: "",
    catalogItemId: "",
    title: "",
    eventType: "wedding",
    packageType: "پکیج طلایی VIP",
    eventDate: new Date().toISOString().split("T")[0],
    mainLocation: "",
    backupLocation: "",
    totalContractValue: 0,
    status: "booked",
    shootingBrief: "",
    notes: "",
  }));

  // Contract Form State
  const [contractForm, setContractForm] = useState(() => ({
    totalAmount: 0,
    packageId: "",
    addons: [] as Array<{ id: string; quantity: number }>,
    discount: 0,
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
    accountId: "",
    amount: 0,
    paymentType: "deposit",
    paymentMethod: "card_transfer",
    referenceCode: "",
    paidAt: new Date().toISOString().split("T")[0],
    notes: "",
  }));

  // Expense Form State
  const [expenseForm, setExpenseForm] = useState(() => ({
    accountId: "",
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

  // Load Main Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [pipeRes, projRes, custRes, persRes, equipRes, calRes, resRes, accountRes, catalogRes] = await Promise.all([
        fetch("/api/studio/pipeline").then((r) => r.json()),
        fetch("/api/studio/projects?pageSize=100").then((r) => r.json()),
        fetch("/api/studio/customers?pageSize=100").then((r) => r.json()),
        fetch("/api/studio/personnel?pageSize=100").then((r) => r.json()),
        fetch("/api/studio/equipment?pageSize=100").then((r) => r.json()),
        fetch("/api/studio/calendar").then((r) => r.json()),
        fetch("/api/studio/equipment/reservations?pageSize=200").then((r) => r.json()),
        fetch("/api/accounts").then((r) => r.json()),
        fetch("/api/studio/catalog").then((r) => r.json()),
      ]);

      if (pipeRes.success) {
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
      if (accountRes.success) setFinancialAccounts(accountRes.accounts || []);
      if (catalogRes.success) setCatalogItems(catalogRes.items || []);
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
  const openProjectWorkspace = async (projectId: string, initialTab: "info" | "workflow" | "timeline" | "contracts" | "payments" | "expenses" | "execution" = "info") => {
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

  useEffect(() => { if (initialProjectId) void openProjectWorkspace(initialProjectId); }, [initialProjectId]);
  useEffect(() => {
    const navigate = (event: Event) => {
      const item = (event as CustomEvent).detail;
      if (item?.type === "studio_project") void openProjectWorkspace(item.id);
      if (item?.type === "studio_contract" && item.item?.projectId) void openProjectWorkspace(item.item.projectId, "contracts");
    };
    window.addEventListener("akma:navigate-item", navigate);
    return () => window.removeEventListener("akma:navigate-item", navigate);
  }, []);

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

  // Save Contract
  const handleSaveContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) return;
    try {
      const res = await fetch(`/api/studio/projects/${selectedProjectId}/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
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
    if (!selectedProjectId || !paymentForm.accountId || Number(paymentForm.amount) <= 0) {
      alert("مبلغ و حساب دریافت الزامی است.");
      return;
    }

    try {
      const res = await fetch(`/api/studio/projects/${selectedProjectId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
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
    if (!selectedProjectId || !expenseForm.title.trim() || (expenseForm.paymentStatus === "paid" && !expenseForm.accountId) || Number(expenseForm.amount) <= 0) {
      alert("عنوان، مبلغ و حساب پرداخت هزینه الزامی است.");
      return;
    }

    try {
      const res = await fetch(`/api/studio/projects/${selectedProjectId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
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
                  پرونده‌های حکمت آتلیه
                  <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    پروژه، مشتری و برنامه
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
                  socialConsent: false,
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
                  catalogItemId: "",
                  title: "",
                  eventType: "wedding",
                  packageType: "پکیج طلایی VIP",
                  eventDate: new Date().toISOString().split("T")[0],
                  mainLocation: "",
                  backupLocation: "",
                  totalContractValue: 0,
                  status: "booked",
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
                                  catalogItemId: p.catalogItemId || "",
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
                  socialConsent: false,
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
                    <button onClick={() => openCustomer(c.id)} className="text-xs font-bold text-cyan-300">پرونده ۳۶۰°</button>
                    <button
                      onClick={() => {
                        setProjectForm({
                        studioCustomerId: c.id,
                        catalogItemId: "",
                          title: `پروژه ${c.name}`,
                          eventType: "wedding",
                          packageType: "پکیج طلایی VIP",
                          eventDate: new Date().toISOString().split("T")[0],
                          mainLocation: c.address || "",
                          backupLocation: "",
                          totalContractValue: 0,
                          status: "booked",
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
      {selectedCustomer && <ClientProfile client={selectedCustomer} onClose={() => setSelectedCustomer(null)} onOpenProject={(id) => { setSelectedCustomer(null); void openProjectWorkspace(id); }} />}

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
                onClick={() => setProjectWorkspaceTab("workflow")}
                className={`px-4 py-3 border-b-2 font-bold text-xs flex items-center gap-1.5 transition ${projectWorkspaceTab === "workflow" ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-slate-200"}`}
              >
                <Layers className="w-3.5 h-3.5" />
                گردش‌کار و تحویل ({projectDetails?.tasks?.length || 0})
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
                  {projectWorkspaceTab === "workflow" && <ProjectOperationsPanel project={projectDetails} onReload={() => openProjectWorkspace(projectDetails.id, "workflow")} />}

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
                                    {toJalaliDate(log.createdAt, { showTime: true })}
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
                              packageId: projectDetails.catalogItemId || "",
                              addons: [],
                              discount: 0,
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
                        accountId: "",
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

                      {projectDetails.installments?.length > 0 && (
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {projectDetails.installments.map((installment: any) => (
                            <div key={installment.id} className={`rounded-xl border p-3 ${installment.status === "overdue" ? "border-rose-500/40 bg-rose-950/20" : "border-slate-800 bg-slate-950"}`}>
                              <div className="flex items-center justify-between"><b className="text-sm text-white">{installment.title}</b><span className={installment.status === "paid" ? "text-xs text-emerald-300" : installment.status === "overdue" ? "text-xs text-rose-300" : "text-xs text-amber-300"}>{installment.status === "paid" ? "تسویه" : installment.status === "partial" ? "پرداخت ناقص" : installment.status === "overdue" ? "سررسید گذشته" : "در انتظار"}</span></div>
                              <p className="mt-2 text-xs text-slate-400">سررسید {toJalaliDate(installment.dueDate)}</p>
                              <p className="mt-1 text-xs text-slate-300">{formatMoney(installment.paidAmount)} از {formatMoney(installment.amount)}</p>
                            </div>
                          ))}
                        </div>
                      )}

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
                        accountId: "",
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

              <div><label className="block text-xs font-semibold text-slate-300 mb-1">خدمت / پکیج و گردش‌کار</label><select value={projectForm.catalogItemId} onChange={(e) => { const selected = catalogItems.find((item) => item.id === e.target.value); setProjectForm({ ...projectForm, catalogItemId: e.target.value, eventType: selected?.jobType || projectForm.eventType, packageType: selected?.name || "سفارشی", totalContractValue: selected ? Number(selected.basePrice) : projectForm.totalContractValue }); }} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"><option value="">پروژه سفارشی</option>{catalogItems.filter((item) => item.active && item.kind !== "addon").map((item) => <option key={item.id} value={item.id}>{item.name} — {formatMoney(item.basePrice)}</option>)}</select></div>

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
                  <JalaliDatePicker required value={projectForm.eventDate} onChange={(date) => setProjectForm({ ...projectForm, eventDate: date?.toISOString() || "" })} />
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
                  <MoneyInput
                    value={projectForm.totalContractValue}
                    onChange={(totalContractValue) => setProjectForm({ ...projectForm, totalContractValue })}
                    placeholder="0"
                    unit="تومان"
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
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">پکیج خدمت</label>
                <select value={contractForm.packageId} onChange={(e) => { const selected = catalogItems.find((item) => item.id === e.target.value); setContractForm({ ...contractForm, packageId: e.target.value, totalAmount: selected ? Number(selected.basePrice) : contractForm.totalAmount, addons: [] }); }} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white">
                  <option value="">قرارداد سفارشی بدون پکیج</option>{catalogItems.filter((item) => item.active && item.kind !== "addon").map((item) => <option key={item.id} value={item.id}>{item.name} — {formatMoney(item.basePrice)}</option>)}
                </select>
              </div>
              {contractForm.packageId && <div><p className="mb-2 text-xs font-semibold text-slate-300">افزونه‌ها</p><div className="grid gap-2 sm:grid-cols-2">{catalogItems.filter((item) => item.active && item.kind === "addon" && (!item.parentId || item.parentId === contractForm.packageId)).map((item) => { const checked = contractForm.addons.some((row) => row.id === item.id); return <label key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-800 p-2 text-xs text-slate-300"><input type="checkbox" checked={checked} onChange={() => { const addons = checked ? contractForm.addons.filter((row) => row.id !== item.id) : [...contractForm.addons, { id: item.id, quantity: 1 }]; const selected = catalogItems.find((row) => row.id === contractForm.packageId); const totalAmount = Number(selected?.basePrice || 0) + addons.reduce((sum, row) => sum + Number(catalogItems.find((item) => item.id === row.id)?.basePrice || 0) * row.quantity, 0) - Number(contractForm.discount || 0); setContractForm({ ...contractForm, addons, totalAmount }); }} />{item.name} ({formatMoney(item.basePrice)})</label> })}</div></div>}
              {contractForm.packageId && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="block text-xs font-semibold text-slate-300 mb-1">تخفیف</label><MoneyInput value={contractForm.discount} onChange={(discount) => { const selected = catalogItems.find((row) => row.id === contractForm.packageId); const subtotal = Number(selected?.basePrice || 0) + contractForm.addons.reduce((sum, row) => sum + Number(catalogItems.find((item) => item.id === row.id)?.basePrice || 0) * row.quantity, 0); setContractForm({ ...contractForm, discount, totalAmount: Math.max(0, subtotal - discount) }); }} unit="تومان" /></div><div><label className="block text-xs font-semibold text-slate-300 mb-1">تعداد اقساط مانده</label><input type="number" min={1} max={24} value={contractForm.installmentsCount} onChange={(e) => setContractForm({ ...contractForm, installmentsCount: Number(e.target.value) })} className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white" /></div></div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">مبلغ کل قرارداد (تومان) *</label>
                  <MoneyInput
                    required
                    value={contractForm.totalAmount}
                    onChange={(totalAmount) => setContractForm({ ...contractForm, totalAmount })}
                    disabled={!!contractForm.packageId}
                    unit="تومان"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-emerald-400 font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">مبلغ بیعانه دریافتی</label>
                  <MoneyInput
                    value={contractForm.depositAmount}
                    onChange={(depositAmount) => setContractForm({ ...contractForm, depositAmount })}
                    unit="تومان"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <JalaliDatePicker label="تاریخ انعقاد قرارداد" value={contractForm.contractDate} onChange={(date) => setContractForm({ ...contractForm, contractDate: date?.toISOString() || "" })}/>
                <JalaliDatePicker label="تاریخ تعهد تحویل نهایی" value={contractForm.deliveryCommitmentDate} onChange={(date) => setContractForm({ ...contractForm, deliveryCommitmentDate: date?.toISOString() || "" })}/>
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
                <MoneyInput
                  required
                  value={paymentForm.amount}
                  onChange={(amount) => setPaymentForm({ ...paymentForm, amount })}
                  unit="تومان"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">حساب دریافت‌کننده *</label>
                <select required value={paymentForm.accountId} onChange={(e) => setPaymentForm({ ...paymentForm, accountId: e.target.value })} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white">
                  <option value="">انتخاب حساب بانکی یا صندوق</option>
                  {financialAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {formatMoney(account.balance)}</option>)}
                </select>
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

              <JalaliDatePicker label="تاریخ دریافت" value={paymentForm.paidAt} onChange={(date) => setPaymentForm({ ...paymentForm, paidAt: date?.toISOString() || "" })}/>

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
                <label className="block text-xs font-semibold text-slate-300 mb-1">حساب پرداخت‌کننده *</label>
                <select required value={expenseForm.accountId} onChange={(e) => setExpenseForm({ ...expenseForm, accountId: e.target.value })} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white">
                  <option value="">انتخاب حساب بانکی یا صندوق</option>
                  {financialAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {formatMoney(account.balance)}</option>)}
                </select>
              </div>
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
                  <MoneyInput
                    required
                    value={expenseForm.amount}
                    onChange={(amount) => setExpenseForm({ ...expenseForm, amount })}
                    unit="تومان"
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

              <JalaliDatePicker label="تاریخ پرداخت هزینه" value={expenseForm.paidAt} onChange={(date) => setExpenseForm({ ...expenseForm, paidAt: date?.toISOString() || "" })}/>

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
