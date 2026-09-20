"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Bot,
  CalendarDays,
  Camera,
  ClipboardCheck,
  FileSignature,
  Gauge,
  Menu,
  Search,
  WalletCards,
  Settings,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { canSeeAtelierSection } from "@/lib/atelierNavigation";
import { AtelierFeedbackHost } from "@/components/atelier/AtelierFeedbackHost";

interface AppLayoutProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  me: any;
  children: React.ReactNode;
}

const NAVIGATION = [
  { id: "dashboard", label: "داشبورد", icon: Gauge },
  { id: "contracts", label: "قرارداد", icon: FileSignature },
  { id: "daily_visits", label: "مراجعات روزانه", icon: ClipboardCheck },
  { id: "reservations", label: "رزرو", icon: CalendarDays },
  { id: "planning", label: "برنامه ریزی", icon: Sparkles },
  { id: "calendar", label: "تقویم", icon: CalendarDays },
  { id: "customers", label: "مشتریان", icon: UsersRound },
  { id: "personnel", label: "پرسنل", icon: UserRound },
  { id: "equipment", label: "تجهیزات", icon: Camera },
  { id: "finance", label: "مالی", icon: WalletCards },
  { id: "notifications", label: "اعلانات", icon: Bell },
  { id: "ai", label: "دستیار هوش مصنوعی", icon: Bot },
  { id: "settings", label: "تنظیمات", icon: Settings },
] as const;

export const AppLayout: React.FC<AppLayoutProps> = ({
  activeTab,
  setActiveTab,
  me,
  children,
}) => {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const sidebarRef = useRef<HTMLElement>(null);
  const permissions = new Set<string>(
    me?.navigationPermissions || me?.permissions || [],
  );
  const visibleNavigation = NAVIGATION.filter(({ id }) =>
    canSeeAtelierSection(id, permissions),
  );
  const canViewNotifications = canSeeAtelierSection("notifications", permissions);

  useEffect(() => {
    if (!canViewNotifications) {
      setNotificationCount(0);
      return;
    }
    const load = () =>
      fetch("/api/atelier/notifications")
        .then((response) => response.json())
        .then((data) => {
          if (data.success)
            setNotificationCount(
              (data.notifications || []).filter(
                (item: any) =>
                  item.priority === "critical" || item.priority === "warning",
              ).length,
            );
        })
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [canViewNotifications]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && setSidebarOpen(false);
    document.addEventListener("keydown", close);
    sidebarRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", close);
    };
  }, [sidebarOpen]);

  const handleSearch = async (value: string) => {
    setSearchQuery(value);
    if (value.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const data = await fetch(
        `/api/search?q=${encodeURIComponent(value.trim())}`,
      ).then((response) => response.json());
      setSearchResults(data.success ? data.results || [] : []);
    } finally {
      setIsSearching(false);
    }
  };

  const openSearchResult = (item: any) => {
    const targets: Record<string, string> = {
      studio_contract: "contracts",
      studio_customer: "customers",
      studio_personnel: "personnel",
      studio_equipment: "equipment",
      studio_daily_visit: "daily_visits",
      studio_reservation: "reservations",
    };
    setActiveTab(targets[item.type] || "dashboard");
    setSearchQuery("");
    setSearchResults([]);
    setMobileSearchOpen(false);
    window.setTimeout(
      () =>
        window.dispatchEvent(
          new CustomEvent("akma:navigate-item", {
            detail: { type: item.type, id: item.id, item },
          }),
        ),
      50,
    );
  };

  const searchBox = (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
      <input
        value={searchQuery}
        onChange={(event) => void handleSearch(event.target.value)}
        placeholder="قرارداد، مشتری، پرسنل، تجهیزات، رزرو…"
        className="atelier-input w-full py-2.5 pr-9 text-sm"
        aria-label="جستجوی آتلیه"
      />
      {isSearching && (
        <span className="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 animate-pulse rounded-full bg-red-500" />
      )}
      {searchResults.length > 0 && (
        <div className="absolute inset-x-0 top-[calc(100%+8px)] z-[70] max-h-80 overflow-y-auto rounded-2xl border border-red-950 bg-[#0b0b0d]/98 p-2 shadow-2xl shadow-black">
          {searchResults.map((item) => (
            <button
              key={`${item.type}:${item.id}`}
              onClick={() => openSearchResult(item)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-right hover:bg-red-950/35"
            >
              <span>
                <span className="block text-sm font-bold text-zinc-100">
                  {item.title}
                </span>
                <span className="block text-xs text-zinc-500">
                  {item.code || item.detail || ""}
                </span>
              </span>
              <span className="rounded-full border border-red-900/60 bg-red-950/30 px-2 py-1 text-[10px] text-red-300">
                {item.typeLabel}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div
      className="app-shell min-h-screen min-w-0 bg-[#050506] text-zinc-100"
      dir="rtl"
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(185,15,35,.13),transparent_30%),radial-gradient(circle_at_70%_100%,rgba(98,7,20,.08),transparent_35%)]" />
      <header className="sticky top-0 z-40 flex min-h-16 items-center gap-3 border-b border-red-950/60 bg-[#070708]/92 px-3 pb-2 pt-[max(.5rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-6 lg:ml-[17rem]">
        <button
          onClick={() => setSidebarOpen(true)}
          className="atelier-icon-button lg:hidden"
          aria-label="باز کردن منوی اصلی"
        >
          <Menu className="h-5 w-5" />
        </button>
        <button
          onClick={() => setMobileSearchOpen((open) => !open)}
          className="atelier-icon-button sm:hidden"
          aria-label="جستجو"
        >
          {mobileSearchOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Search className="h-5 w-5" />
          )}
        </button>
        <div className="hidden min-w-0 flex-1 sm:block sm:max-w-md">
          {searchBox}
        </div>
        <div className="mr-auto flex items-center gap-2">
          <div className="hidden text-left sm:block">
            <p className="max-w-36 truncate text-xs font-bold">
              {me?.employee?.name || "کاربر آتلیه"}
            </p>
            <p className="text-[10px] text-zinc-500">{me?.role?.name || ""}</p>
          </div>
          <button
            onClick={async () => {
              await fetch("/api/auth/employee-logout", { method: "POST" });
              router.push("/employee-login");
            }}
            className="rounded-xl border border-zinc-800 px-3 py-2 text-xs text-zinc-400 transition hover:border-red-900 hover:text-white"
          >
            خروج
          </button>
        </div>
        {mobileSearchOpen && (
          <div className="absolute inset-x-3 top-[calc(100%+4px)] sm:hidden">
            {searchBox}
          </div>
        )}
      </header>

      {sidebarOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="بستن منو"
        />
      )}
      <aside
        ref={sidebarRef}
        tabIndex={-1}
        className={`fixed bottom-0 left-0 top-0 z-50 flex w-[min(86vw,17rem)] flex-col border-r border-red-950/70 bg-[#080809]/98 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] shadow-[18px_0_60px_rgba(0,0,0,.6)] outline-none transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="منوی اصلی"
      >
        <div className="mb-5 flex items-center gap-3 border-b border-red-950/60 px-2 pb-5">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-700/70 bg-red-950/50 shadow-[0_0_24px_rgba(239,35,60,.22)]">
            <Camera className="h-5 w-5 text-red-400" />
            <span className="absolute -bottom-1 h-px w-7 bg-red-400 shadow-[0_0_8px_#ef233c]" />
          </div>
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-black tracking-tight text-white">
              حکمت آتلیه
            </p>
            <p className="mt-1 truncate text-[10px] text-zinc-500">
              مدیریت یکپارچه آتلیه
            </p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="atelier-icon-button mr-auto lg:hidden"
            aria-label="بستن منو"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-1">
          {visibleNavigation.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setActiveTab(id);
                  setSidebarOpen(false);
                }}
                className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-right text-xs font-bold transition ${active ? "border border-red-800/70 bg-gradient-to-l from-red-950/75 to-zinc-950 text-white shadow-[0_0_22px_rgba(220,20,45,.13)]" : "border border-transparent text-zinc-500 hover:bg-zinc-900/80 hover:text-zinc-200"}`}
              >
                {active && (
                  <span className="absolute bottom-2 right-0 top-2 w-0.5 rounded-full bg-red-400 shadow-[0_0_10px_#ef233c]" />
                )}
                <Icon
                  className={`h-4 w-4 shrink-0 ${active ? "text-red-400" : "text-zinc-600 group-hover:text-red-400"}`}
                />
                <span>{label}</span>
                {id === "notifications" && notificationCount > 0 && (
                  <span className="mr-auto min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[9px] text-white shadow-[0_0_12px_rgba(239,35,60,.45)]">
                    {notificationCount > 99
                      ? "۹۹+"
                      : notificationCount.toLocaleString("fa-IR")}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="mt-4 rounded-2xl border border-red-950/60 bg-gradient-to-br from-zinc-950 to-red-950/20 p-3">
          <p className="text-[10px] font-bold text-zinc-300">
            BLACK + RED LIGHT
          </p>
          <p className="mt-1 text-[9px] leading-5 text-zinc-600">
            محیط عملیاتی حرفه‌ای عکاسی و فیلمبرداری
          </p>
        </div>
      </aside>
      <main className="app-main relative min-w-0 overflow-x-clip p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 lg:ml-[17rem] lg:p-7">
        {children}
      </main>
      <AtelierFeedbackHost />
    </div>
  );
};
