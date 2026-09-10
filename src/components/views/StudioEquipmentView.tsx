"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Camera,
  Layers,
  Search,
  Plus,
  Filter,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  Wrench,
  DollarSign,
  Package,
  Calendar,
  Eye,
  Edit3,
  Trash2,
  Check,
  X,
  Sparkles,
  ArrowRightLeft,
  Building2,
  Shield,
  FileSpreadsheet,
  Tag,
  RefreshCw,
  Video,
  Mic,
  Sun,
  Radio,
} from "lucide-react";
import { formatMoney, toJalaliDate } from "@/lib/dateUtils";

const CATEGORIES = [
  { id: "all", label: "همه تجهیزات", icon: Layers },
  { id: "camera", label: "Camera (دوربین)", icon: Camera },
  { id: "lens", label: "Lens (لنز)", icon: Eye },
  { id: "light", label: "Light (نورپردازی)", icon: Sun },
  { id: "audio", label: "Audio (صدا و میکروفون)", icon: Mic },
  { id: "drone", label: "Drone (هلی‌شات و کوادکوپتر)", icon: Radio },
  { id: "studio", label: "Studio (تجهیزات و دکور)", icon: Video },
] as const;

const STATUSES = [
  { id: "all", label: "همه وضعیت‌ها", color: "bg-slate-800 text-slate-300 border-slate-700" },
  { id: "available", label: "Available (آماده در آتلیه)", color: "bg-emerald-950/60 text-emerald-300 border-emerald-800" },
  { id: "reserved", label: "Reserved (رزرو شده)", color: "bg-blue-950/60 text-blue-300 border-blue-800" },
  { id: "project", label: "Project (روی ست / پروژه)", color: "bg-purple-950/60 text-purple-300 border-purple-800" },
  { id: "repair", label: "Repair (تعمیرگاه / سرویس)", color: "bg-red-950/60 text-red-300 border-red-800" },
] as const;

export function StudioEquipmentView({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  // Main Tab: "studio_equipment" vs "rental_equipment"
  const [activeMainTab, setActiveMainTab] = useState<"inventory" | "rentals">("inventory");

  // Equipment List State
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [loadingEquip, setLoadingEquip] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Rental Equipment List State
  const [rentalList, setRentalList] = useState<any[]>([]);
  const [loadingRentals, setLoadingRentals] = useState(false);
  const [rentalSearch, setRentalSearch] = useState("");
  const [rentalStatusFilter, setRentalStatusFilter] = useState("all");

  // Studio Projects List (for linking equipment or rentals)
  const [projects, setProjects] = useState<any[]>([]);

  // Modals
  const [showCreateEquipModal, setShowCreateEquipModal] = useState(false);
  const [editingEquip, setEditingEquip] = useState<any | null>(null);
  const [equipForm, setEquipForm] = useState({
    title: "",
    category: "camera",
    brand: "",
    model: "",
    serialNumber: "",
    purchaseCost: "",
    status: "available" as "available" | "reserved" | "project" | "repair",
    requiresInsurance: false,
    notes: "",
  });
  const [savingEquip, setSavingEquip] = useState(false);

  // Rental Equipment Modal
  const [showCreateRentalModal, setShowCreateRentalModal] = useState(false);
  const [editingRental, setEditingRental] = useState<any | null>(null);
  const [rentalForm, setRentalForm] = useState(() => ({
    accountId: "",
    itemTitle: "",
    rentalCompany: "",
    rentalCost: "",
    depositGuarantee: "چک ضمانت صیادی و کارت ملی",
    pickupDate: new Date().toISOString().split("T")[0],
    returnDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
    studioProjectId: "",
    status: "rented" as "planned" | "rented" | "returned" | "settled",
    notes: "",
  }));
  const [savingRental, setSavingRental] = useState(false);
  const [financialAccounts, setFinancialAccounts] = useState<any[]>([]);

  // Selected Equipment Detail modal
  const [selectedEquipDetail, setSelectedEquipDetail] = useState<any | null>(null);

  // Load Studio Equipment
  const loadEquipment = async () => {
    try {
      setLoadingEquip(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/studio/equipment?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setEquipmentList(data.equipment || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingEquip(false);
    }
  };

  // Load Rental Equipment
  const loadRentals = async () => {
    try {
      setLoadingRentals(true);
      const params = new URLSearchParams();
      if (rentalSearch) params.set("search", rentalSearch);
      if (rentalStatusFilter !== "all") params.set("status", rentalStatusFilter);

      const res = await fetch(`/api/studio/equipment/rentals?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setRentalList(data.rentals || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRentals(false);
    }
  };

  // Load Projects
  useEffect(() => {
    fetch("/api/studio/projects?pageSize=50")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setProjects(d.projects || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then((d) => { if (d.success) setFinancialAccounts(d.accounts || []); }).catch(() => {});
  }, []);

  useEffect(() => {
    loadEquipment();
  }, [search, categoryFilter, statusFilter]);

  useEffect(() => {
    if (activeMainTab === "rentals") {
      loadRentals();
    }
  }, [activeMainTab, rentalSearch, rentalStatusFilter]);

  // Handle Create or Update Equipment
  const handleSaveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipForm.title.trim()) {
      alert("عنوان یا نام تجهیز الزامی است.");
      return;
    }

    try {
      setSavingEquip(true);
      const payload = {
        title: equipForm.title.trim(),
        category: equipForm.category,
        brand: equipForm.brand.trim() || undefined,
        model: equipForm.model.trim() || undefined,
        serialNumber: equipForm.serialNumber.trim() || undefined,
        purchaseCost: equipForm.purchaseCost ? Number(equipForm.purchaseCost) : 0,
        status: equipForm.status,
        requiresInsurance: equipForm.requiresInsurance,
        notes: equipForm.notes.trim() || undefined,
      };

      const url = editingEquip ? `/api/studio/equipment/${editingEquip.id}` : "/api/studio/equipment";
      const method = editingEquip ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setShowCreateEquipModal(false);
        setEditingEquip(null);
        setEquipForm({
          title: "",
          category: "camera",
          brand: "",
          model: "",
          serialNumber: "",
          purchaseCost: "",
          status: "available",
          requiresInsurance: false,
          notes: "",
        });
        await loadEquipment();
      } else {
        alert(data.error || "خطا در ذخیره تجهیز");
      }
    } catch (err) {
      console.error(err);
      alert("خطا در برقراری ارتباط با سرور");
    } finally {
      setSavingEquip(false);
    }
  };

  // Quick Change Equipment Status
  const handleQuickStatusChange = async (equipmentId: string, newStatus: "available" | "reserved" | "project" | "repair") => {
    try {
      const res = await fetch(`/api/studio/equipment/${equipmentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        await loadEquipment();
        if (selectedEquipDetail && selectedEquipDetail.id === equipmentId) {
          setSelectedEquipDetail({ ...selectedEquipDetail, status: newStatus });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Create or Update Rental Equipment
  const handleSaveRental = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rentalForm.itemTitle.trim() || !rentalForm.rentalCompany.trim()) {
      alert("عنوان تجهیز و نام شرکت رنتال الزامی است.");
      return;
    }

    try {
      setSavingRental(true);
      const payload = {
        itemTitle: rentalForm.itemTitle.trim(),
        rentalCompany: rentalForm.rentalCompany.trim(),
        rentalCost: Number(rentalForm.rentalCost) || 0,
        depositGuarantee: rentalForm.depositGuarantee.trim() || undefined,
        pickupDate: rentalForm.pickupDate,
        returnDate: rentalForm.returnDate,
        studioProjectId: rentalForm.studioProjectId || undefined,
        accountId: rentalForm.accountId || undefined,
        status: rentalForm.status,
        notes: rentalForm.notes.trim() || undefined,
      };

      const url = editingRental
        ? `/api/studio/equipment/rentals/${editingRental.id}`
        : "/api/studio/equipment/rentals";
      const method = editingRental ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setShowCreateRentalModal(false);
        setEditingRental(null);
        setRentalForm({
          itemTitle: "",
          accountId: "",
          rentalCompany: "",
          rentalCost: "",
          depositGuarantee: "چک ضمانت صیادی و کارت ملی",
          pickupDate: new Date().toISOString().split("T")[0],
          returnDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
          studioProjectId: "",
          status: "rented",
          notes: "",
        });
        await loadRentals();
      } else {
        alert(data.error || "خطا در ذخیره تجهیز اجاره‌ای");
      }
    } catch (err) {
      console.error(err);
      alert("خطا در برقراری ارتباط با سرور");
    } finally {
      setSavingRental(false);
    }
  };

  // Delete Equipment (Logical Archive)
  const handleDeleteEquipment = async (id: string) => {
    if (!confirm("آیا از حذف یا بازنشستگی این تجهیز اطمینان دارید؟")) return;
    try {
      const res = await fetch(`/api/studio/equipment/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        await loadEquipment();
        setSelectedEquipDetail(null);
      } else {
        alert(data.error || "خطا در حذف تجهیز");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Rental
  const handleDeleteRental = async (id: string) => {
    if (!confirm("آیا از حذف این رکورد تجهیز اجاره‌ای اطمینان دارید؟")) return;
    try {
      const res = await fetch(`/api/studio/equipment/rentals/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        await loadRentals();
      } else {
        alert(data.error || "خطا در حذف تجهیز اجاره‌ای");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = equipmentList.length;
    const available = equipmentList.filter((e) => e.status === "available").length;
    const reserved = equipmentList.filter((e) => e.status === "reserved").length;
    const project = equipmentList.filter((e) => e.status === "project").length;
    const repair = equipmentList.filter((e) => e.status === "repair").length;
    const totalValue = equipmentList.reduce((sum, e) => sum + Number(e.purchaseCost || 0), 0);
    return { total, available, reserved, project, repair, totalValue };
  }, [equipmentList]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return { label: "Available (آماده)", cls: "bg-emerald-950/60 text-emerald-300 border-emerald-800" };
      case "reserved":
        return { label: "Reserved (رزرو شده)", cls: "bg-blue-950/60 text-blue-300 border-blue-800" };
      case "project":
        return { label: "Project (روی ست / آفیش)", cls: "bg-purple-950/60 text-purple-300 border-purple-800" };
      case "repair":
        return { label: "Repair (تعمیرگاه)", cls: "bg-red-950/60 text-red-300 border-red-800" };
      default:
        return { label: status, cls: "bg-slate-800 text-slate-400 border-slate-700" };
    }
  };

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-600/10 border border-purple-500/20 text-purple-400">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">تجهیزات و رنتال آتلیه (Equipment & Rentals)</h1>
              <p className="text-xs text-slate-400">
                مدیریت جامع دوربین‌ها، لنزها، نور، صدا، هلی‌شات و ثبت تجهیزات اجاره‌ای پروژه‌های آتلیه حکمت
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {activeMainTab === "inventory" ? (
            <button
              onClick={() => {
                setEditingEquip(null);
                setEquipForm({
                  title: "",
                  category: "camera",
                  brand: "",
                  model: "",
                  serialNumber: "",
                  purchaseCost: "",
                  status: "available",
                  requiresInsurance: false,
                  notes: "",
                });
                setShowCreateEquipModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition shadow-lg shadow-blue-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>ثبت تجهیز جدید</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setEditingRental(null);
                setRentalForm({
                  accountId: "",
                  itemTitle: "",
                  rentalCompany: "",
                  rentalCost: "",
                  depositGuarantee: "چک ضمانت صیادی و کارت ملی",
                  pickupDate: new Date().toISOString().split("T")[0],
                  returnDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
                  studioProjectId: "",
                  status: "rented",
                  notes: "",
                });
                setShowCreateRentalModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-medium transition shadow-lg shadow-purple-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>ثبت تجهیز اجاره‌ای جدید (Rental)</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Mode Switcher: Studio Equipment vs Rental Equipment */}
      <div className="flex border-b border-slate-800 gap-4">
        <button
          onClick={() => setActiveMainTab("inventory")}
          className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 transition ${
            activeMainTab === "inventory"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Camera className="w-4 h-4" />
          <span>تجهیزات آتلیه (Studio Equipment)</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
            {equipmentList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveMainTab("rentals")}
          className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 transition ${
            activeMainTab === "rentals"
              ? "border-purple-500 text-purple-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          <span>تجهیزات اجاره‌ای و رنتال (Rental Equipment)</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
            {rentalList.length}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: STUDIO EQUIPMENT */}
      {/* ========================================================================= */}
      {activeMainTab === "inventory" && (
        <div className="space-y-6">
          {/* Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3.5">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>کل تجهیزات آتلیه</span>
                <Package className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-xl font-bold text-white">{metrics.total} <span className="text-xs font-normal text-slate-500">قلم</span></div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3.5">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Available (آماده)</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-emerald-400">{metrics.available} <span className="text-xs font-normal text-slate-500">قلم</span></div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3.5">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Reserved (رزرو شده)</span>
                <Clock3 className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-xl font-bold text-blue-400">{metrics.reserved} <span className="text-xs font-normal text-slate-500">قلم</span></div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3.5">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Project (روی ست)</span>
                <Video className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-xl font-bold text-purple-400">{metrics.project} <span className="text-xs font-normal text-slate-500">قلم</span></div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3.5 col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Repair (تعمیرگاه)</span>
                <Wrench className="w-4 h-4 text-red-400" />
              </div>
              <div className="text-xl font-bold text-red-400">{metrics.repair} <span className="text-xs font-normal text-slate-500">قلم</span></div>
            </div>
          </div>

          {/* Category Chips Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = categoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition border ${
                    isSelected
                      ? "bg-blue-600/20 border-blue-500 text-blue-300"
                      : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-850"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search and Status Filters */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="جستجوی نام، مدل، برند، یا شماره سریال تجهیز..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Status Quick Select */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {STATUSES.map((st) => (
                <button
                  key={st.id}
                  onClick={() => setStatusFilter(st.id)}
                  className={`text-xs px-3 py-1.5 rounded-xl border transition ${
                    statusFilter === st.id
                      ? `${st.color} font-bold ring-2 ring-blue-500/30`
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Equipment Grid */}
          {loadingEquip ? (
            <div className="text-center py-16 text-slate-500 text-sm">در حال دریافت فهرست تجهیزات...</div>
          ) : equipmentList.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl">
              <Camera className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <div className="text-base font-semibold text-slate-300">هیچ تجهیزی یافت نشد</div>
              <p className="text-xs text-slate-500 mt-1">با زدن دکمه «ثبت تجهیز جدید» دوربین‌ها یا تجهیزات آتلیه را وارد نمایید.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {equipmentList.map((item) => {
                const statusBadge = getStatusBadge(item.status);
                return (
                  <div
                    key={item.id}
                    className="bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col justify-between transition"
                  >
                    <div>
                      {/* Top status & category */}
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-blue-400 border border-slate-700/50">
                          {item.code}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] px-2.5 py-0.5 rounded-full border ${statusBadge.cls}`}>
                            {statusBadge.label}
                          </span>
                        </div>
                      </div>

                      {/* Title & Specs */}
                      <h2 className="text-sm font-bold text-white mb-1">{item.title}</h2>
                      <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 mb-3">
                        {item.brand && <span className="font-semibold text-slate-300">{item.brand}</span>}
                        {item.model && <span>مدل: {item.model}</span>}
                        {item.serialNumber && (
                          <span className="font-mono text-slate-500 text-[11px]" dir="ltr">
                            S/N: {item.serialNumber}
                          </span>
                        )}
                      </div>

                      {/* Price & Insurance */}
                      <div className="flex items-center justify-between text-xs bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 mb-3">
                        <span className="text-slate-400">ارزش / قیمت خرید:</span>
                        <span className="font-bold text-slate-200">
                          {item.purchaseCost && Number(item.purchaseCost) > 0
                            ? formatMoney(item.purchaseCost)
                            : "نامشخص"}
                        </span>
                      </div>

                      {item.notes && (
                        <p className="text-[11px] text-slate-500 line-clamp-2 mb-3">{item.notes}</p>
                      )}
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      {/* Quick Status Changer Dropdown */}
                      <select
                        value={item.status}
                        onChange={(e) => handleQuickStatusChange(item.id, e.target.value as any)}
                        aria-label="تغییر وضعیت سریع تجهیز"
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-blue-500"
                      >
                        <option value="available">Available (آماده)</option>
                        <option value="reserved">Reserved (رزرو)</option>
                        <option value="project">Project (روی ست)</option>
                        <option value="repair">Repair (تعمیرگاه)</option>
                      </select>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingEquip(item);
                            setEquipForm({
                              title: item.title,
                              category: item.category,
                              brand: item.brand || "",
                              model: item.model || "",
                              serialNumber: item.serialNumber || "",
                              purchaseCost: item.purchaseCost ? String(item.purchaseCost) : "",
                              status: item.status,
                              requiresInsurance: Boolean(item.requiresInsurance),
                              notes: item.notes || "",
                            });
                            setShowCreateEquipModal(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition"
                          title="ویرایش تجهیز"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDeleteEquipment(item.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                          title="حذف / آرشیو تجهیز"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: RENTAL EQUIPMENT (تجهیزات اجاره‌ای) */}
      {/* ========================================================================= */}
      {activeMainTab === "rentals" && (
        <div className="space-y-6">
          <div className="bg-purple-950/20 border border-purple-500/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-purple-400" />
                <span>مدیریت تجهیزات اجاره‌ای و استودیوهای همکار (Rental Management)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                ثبت کرایه کرین، لنزهای خاص، دوربین پشتیبان، نورپردازی ویژه مراسم و پیگیری ضمانت‌ها و تاریخ‌های عودت
              </p>
            </div>

            <button
              onClick={() => {
                setEditingRental(null);
                setShowCreateRentalModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-medium transition"
            >
              <Plus className="w-4 h-4" />
              <span>ثبت تجهیز اجاره‌ای جدید</span>
            </button>
          </div>

          {/* Search & Status Filters for Rentals */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="جستجوی عنوان تجهیز اجاره‌ای، شرکت رنتال، یا ضمانت..."
                value={rentalSearch}
                onChange={(e) => setRentalSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={rentalStatusFilter}
                onChange={(e) => setRentalStatusFilter(e.target.value)}
                aria-label="فیلتر وضعیت تجهیز اجاره‌ای"
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-purple-500"
              >
                <option value="all">همه وضعیت‌ها</option>
                <option value="rented">در حال استفاده (Rented)</option>
                <option value="returned">عودت داده شده (Returned)</option>
                <option value="settled">تسویه مالی شده (Settled)</option>
                <option value="planned">برنامه‌ریزی شده (Planned)</option>
              </select>
            </div>
          </div>

          {/* Rentals List */}
          {loadingRentals ? (
            <div className="text-center py-16 text-slate-500 text-sm">در حال دریافت تجهیزات اجاره‌ای...</div>
          ) : rentalList.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl">
              <ArrowRightLeft className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <div className="text-base font-semibold text-slate-300">هیچ تجهیز اجاره‌ای ثبت نشده است</div>
              <p className="text-xs text-slate-500 mt-1">با زدن دکمه «ثبت تجهیز اجاره‌ای جدید» تجهیزات رنتال از همکاران را ثبت کنید.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rentalList.map((rent) => (
                <div
                  key={rent.id}
                  className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col justify-between transition"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-xs font-bold text-white">{rent.itemTitle}</span>
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full border ${
                          rent.status === "rented"
                            ? "bg-purple-950/60 text-purple-300 border-purple-800"
                            : rent.status === "returned"
                            ? "bg-blue-950/60 text-blue-300 border-blue-800"
                            : rent.status === "settled"
                            ? "bg-emerald-950/60 text-emerald-300 border-emerald-800"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}
                      >
                        {rent.status === "rented"
                          ? "در اختیار / روی ست"
                          : rent.status === "returned"
                          ? "عودت به رنتال"
                          : rent.status === "settled"
                          ? "تسویه کامل"
                          : "برنامه‌ریزی"}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-300 mb-3">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>شرکت / مرکز رنتال:</span>
                        <span className="font-semibold text-slate-200">{rent.rentalCompany}</span>
                      </div>

                      <div className="flex items-center justify-between text-slate-400">
                        <span>هزینه کرایه:</span>
                        <span className="font-bold text-emerald-400">{formatMoney(rent.rentalCost)}</span>
                      </div>

                      {rent.projectTitle && (
                        <div className="flex items-center justify-between text-slate-400">
                          <span>پروژه منتسب:</span>
                          <span className="text-blue-400">{rent.projectTitle}</span>
                        </div>
                      )}

                      {rent.depositGuarantee && (
                        <div className="flex items-center justify-between text-slate-400">
                          <span>ضمانت / ودیعه:</span>
                          <span className="text-amber-400 text-[11px]">{rent.depositGuarantee}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-slate-500 text-[11px] pt-1">
                        <span>تحویل: {toJalaliDate(rent.pickupDate)}</span>
                        <span>عودت: {toJalaliDate(rent.returnDate)}</span>
                      </div>
                    </div>

                    {rent.notes && (
                      <p className="text-[11px] text-slate-500 mb-3 bg-slate-950/50 p-2 rounded-lg border border-slate-800/80">
                        {rent.notes}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {rent.status === "rented" && (
                        <button
                          onClick={async () => {
                            await fetch(`/api/studio/equipment/rentals/${rent.id}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "returned" }),
                            });
                            await loadRentals();
                          }}
                          className="px-2.5 py-1 bg-blue-950/60 hover:bg-blue-900/60 text-blue-300 border border-blue-800 rounded-lg text-[11px] transition"
                        >
                          عودت داده شد
                        </button>
                      )}

                      {rent.status === "returned" && (
                        <button
                          onClick={async () => {
                            await fetch(`/api/studio/equipment/rentals/${rent.id}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "settled" }),
                            });
                            await loadRentals();
                          }}
                          className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800 rounded-lg text-[11px] transition"
                        >
                          تسویه مالی شد
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingRental(rent);
                          setRentalForm({
                            accountId: rent.accountId || "",
                            itemTitle: rent.itemTitle,
                            rentalCompany: rent.rentalCompany,
                            rentalCost: String(rent.rentalCost),
                            depositGuarantee: rent.depositGuarantee || "",
                            pickupDate: new Date(rent.pickupDate).toISOString().split("T")[0],
                            returnDate: new Date(rent.returnDate).toISOString().split("T")[0],
                            studioProjectId: rent.studioProjectId || "",
                            status: rent.status,
                            notes: rent.notes || "",
                          });
                          setShowCreateRentalModal(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-blue-400 transition"
                        title="ویرایش"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleDeleteRental(rent.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 transition"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE / EDIT STUDIO EQUIPMENT */}
      {/* ========================================================================= */}
      {showCreateEquipModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-400" />
                <span>{editingEquip ? "ویرایش مشخصات تجهیز" : "ثبت تجهیز جدید آتلیه"}</span>
              </h3>
              <button
                onClick={() => setShowCreateEquipModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEquipment} className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1 font-medium">نام و عنوان تجهیز *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: Sony Alpha 7 IV یا DJI Mavic 3 Pro"
                  value={equipForm.title}
                  onChange={(e) => setEquipForm({ ...equipForm, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">حساب پرداخت (اختیاری)</label>
                  <select value={rentalForm.accountId} onChange={(e) => setRentalForm({ ...rentalForm, accountId: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white">
                    <option value="">فقط ثبت هزینه تعهدی</option>
                    {financialAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">دسته‌بندی تجهیز *</label>
                  <select
                    value={equipForm.category}
                    onChange={(e) => setEquipForm({ ...equipForm, category: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="camera">Camera (دوربین)</option>
                    <option value="lens">Lens (لنز)</option>
                    <option value="light">Light (نورپردازی و فلاش)</option>
                    <option value="audio">Audio (صدا و میکروفون)</option>
                    <option value="drone">Drone (هلی‌شات و پروازی)</option>
                    <option value="studio">Studio (استودیو و اکسسوری)</option>
                    <option value="gimbal_stabilizer">استابلایزر و گیمبال</option>
                    <option value="crane_jib">کرین و ریل</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">وضعیت اولیه *</label>
                  <select
                    value={equipForm.status}
                    onChange={(e) => setEquipForm({ ...equipForm, status: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="available">Available (آماده در استودیو)</option>
                    <option value="reserved">Reserved (رزرو شده)</option>
                    <option value="project">Project (روی ست / پروژه)</option>
                    <option value="repair">Repair (تعمیرگاه / سرویس)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">برند (Brand)</label>
                  <input
                    type="text"
                    placeholder="مثال: Sony, Canon, Godox, DJI"
                    value={equipForm.brand}
                    onChange={(e) => setEquipForm({ ...equipForm, brand: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">مدل دقیق (Model)</label>
                  <input
                    type="text"
                    placeholder="مثال: ILCE-7M4 یا 24-70mm GM II"
                    value={equipForm.model}
                    onChange={(e) => setEquipForm({ ...equipForm, model: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">شماره سریال (Serial)</label>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="SN-12345678"
                    value={equipForm.serialNumber}
                    onChange={(e) => setEquipForm({ ...equipForm, serialNumber: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500 text-left font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">قیمت خرید / ارزش (تومان)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="مثال: ۱۲۰,۰۰۰,۰۰۰"
                    value={equipForm.purchaseCost}
                    onChange={(e) => setEquipForm({ ...equipForm, purchaseCost: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1 font-medium">توضیحات و اقلام همراه</label>
                <textarea
                  rows={2}
                  placeholder="باتری اضافی، کاستور، شارژر، کیس ضدضربه و..."
                  value={equipForm.notes}
                  onChange={(e) => setEquipForm({ ...equipForm, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateEquipModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white transition"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={savingEquip}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition"
                >
                  {savingEquip ? "در حال ذخیره..." : "ذخیره تجهیز"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE / EDIT RENTAL EQUIPMENT */}
      {/* ========================================================================= */}
      {showCreateRentalModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-purple-400" />
                <span>{editingRental ? "ویرایش تجهیز اجاره‌ای" : "ثبت تجهیز اجاره‌ای (رنتال)"}</span>
              </h3>
              <button
                onClick={() => setShowCreateRentalModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRental} className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1 font-medium">عنوان تجهیز اجاره‌ای *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: کرین ۱۲ متری با اپراتور یا لنز Master Prime"
                  value={rentalForm.itemTitle}
                  onChange={(e) => setRentalForm({ ...rentalForm, itemTitle: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">شرکت / تأمین‌کننده رنتال *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: رنتال سینمایی پرشیا"
                    value={rentalForm.rentalCompany}
                    onChange={(e) => setRentalForm({ ...rentalForm, rentalCompany: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">هزینه کرایه (تومان) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="مثال: ۴,۵۰۰,۰۰۰"
                    value={rentalForm.rentalCost}
                    onChange={(e) => setRentalForm({ ...rentalForm, rentalCost: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1 font-medium">ودیعه یا ضمانت سپرده‌شده</label>
                <input
                  type="text"
                  placeholder="مثال: چک صیادی به مبلغ ۵۰ میلیون تومان + کارت ملی"
                  value={rentalForm.depositGuarantee}
                  onChange={(e) => setRentalForm({ ...rentalForm, depositGuarantee: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">تاریخ تحویل (Pickup)</label>
                  <input
                    type="date"
                    required
                    value={rentalForm.pickupDate}
                    onChange={(e) => setRentalForm({ ...rentalForm, pickupDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 text-left"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">تاریخ عودت (Return)</label>
                  <input
                    type="date"
                    required
                    value={rentalForm.returnDate}
                    onChange={(e) => setRentalForm({ ...rentalForm, returnDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 text-left"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">پروژه مرتبط (اختیاری)</label>
                  <select
                    value={rentalForm.studioProjectId}
                    onChange={(e) => setRentalForm({ ...rentalForm, studioProjectId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">بدون انتساب به پروژه خاص</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.projectNumber} - {p.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">وضعیت رنتال</label>
                  <select
                    value={rentalForm.status}
                    onChange={(e) => setRentalForm({ ...rentalForm, status: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="rented">در اختیار / روی ست (Rented)</option>
                    <option value="returned">عودت داده شده به رنتال (Returned)</option>
                    <option value="settled">تسویه مالی کامل (Settled)</option>
                    <option value="planned">برنامه‌ریزی شده (Planned)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1 font-medium">یادداشت‌ها</label>
                <textarea
                  rows={2}
                  placeholder="ساعت تحویل، متعلقات، اپراتور اعزامی و..."
                  value={rentalForm.notes}
                  onChange={(e) => setRentalForm({ ...rentalForm, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateRentalModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white transition"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={savingRental}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition"
                >
                  {savingRental ? "در حال ذخیره..." : "ثبت تجهیز اجاره‌ای"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
