"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { applyAppearance, validAppearance } from "@/lib/appearance";
import { AppearanceSettings } from "./AppearanceSettings";
import { AppLayout } from "@/components/layout/AppLayout";
import { FinalDashboard } from "@/components/atelier/FinalDashboard";
import { ContractsView } from "@/components/atelier/ContractsView";
import { SimpleRecordsView } from "@/components/atelier/SimpleRecordsView";
import { PlanningView } from "@/components/atelier/PlanningView";
import { FinalCalendar } from "@/components/atelier/FinalCalendar";
import { ContractCustomersView } from "@/components/atelier/ContractCustomersView";
import {
  EquipmentView,
  PersonnelView,
} from "@/components/atelier/MasterDataViews";
import { FinalNotificationsView } from "@/components/atelier/FinalNotificationsView";
import { FinalSettingsView } from "@/components/atelier/FinalSettingsView";
import { AiAssistantView } from "@/components/views/AiAssistantView";
import { AtelierFinanceView } from "@/components/atelier/AtelierFinanceView";
import { canSeeAtelierSection, visibleAtelierSections } from "@/lib/atelierNavigation";

const SECTION_IDS = ["dashboard", "contracts", "daily_visits", "reservations", "planning", "calendar", "customers", "personnel", "equipment", "finance", "notifications", "ai", "settings"] as const;

export default function HomePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [authReady, setAuthReady] = useState(false);
  const [me, setMe] = useState<any>(null);
  useEffect(() => {
    fetch("/api/auth/employee-me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) router.replace(`/employee-login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        else { setMe(data); fetch("/api/me/appearance").then(r => r.json()).then(body => { if (validAppearance(body.appearance)) applyAppearance(body.appearance); }).catch(() => undefined); }
        setAuthReady(true);
      })
      .catch(() => router.replace(`/employee-login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`));
  }, [router]);
  const routeParts = pathname.split("/").filter(Boolean);
  const activeTab = routeParts[0] || "dashboard";
  const customerProfileId = activeTab === "customers" ? routeParts[1] || null : null;
  const navigateTab = (tab: string) => router.push(`/${tab}`);
  const viewCustomer = (id: string | null) => router.push(id ? `/customers/${encodeURIComponent(id)}` : "/customers");
  const navigateItem = (section: string, id?: string | null) => router.push(`/${section}${id ? `/${encodeURIComponent(id)}` : ""}`);
  useEffect(() => {
    // Preserve old customer links while canonicalizing all new navigation.
    if (window.location.hash.startsWith("#customers")) router.replace(window.location.hash.slice(1).replace(/^/, "/"));
  }, [router]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const selectedFinanceContractId = activeTab === "finance" ? routeParts[1] || searchParams.get("contract") : null;
  const permissionValues: string[] = me?.navigationPermissions || me?.permissions || [];
  const availableSections = visibleAtelierSections(SECTION_IDS, permissionValues);
  const effectiveActiveTab = canSeeAtelierSection(activeTab, permissionValues)
    ? activeTab
    : availableSections[0] || "";
  const renderActiveView = () => {
    if (activeTab !== effectiveActiveTab) return <p role="alert">دسترسی به این بخش مجاز نیست.</p>;
    switch (effectiveActiveTab) {
      case "dashboard":
        return <FinalDashboard onNavigate={navigateTab} userName={me?.employee?.name} permissions={permissionValues} />;
      case "contracts":
        return <ContractsView onNavigateFinance={(contractId) => navigateItem("finance", contractId)} />;
      case "daily_visits":
        return <SimpleRecordsView kind="daily-visits" />;
      case "reservations":
        return <SimpleRecordsView kind="reservations" />;
      case "planning":
        return <PlanningView onEditContract={(id) => navigateItem("contracts", id)} />;
      case "calendar":
        return <FinalCalendar onOpenPlanning={(id) => navigateItem("planning", id)} />;
      case "customers":
        return <ContractCustomersView customerId={customerProfileId} onViewCustomer={viewCustomer} onNavigate={navigateItem} />;
      case "personnel":
        return <PersonnelView />;
      case "equipment":
        return <EquipmentView />;
      case "finance":
        return <AtelierFinanceView initialContractId={selectedFinanceContractId} />;
      case "notifications":
        return <FinalNotificationsView onNavigate={navigateTab} />;
      case "ai":
        return <AiAssistantView selectedProjectId={selectedProjectId} />;
      case "appearance":
        return <AppearanceSettings />;
      case "settings":
        return <FinalSettingsView />;
      default:
        return <div className="atelier-panel p-6 text-sm text-zinc-400">هیچ بخشی برای این حساب فعال نشده است. با مدیر سیستم تماس بگیرید.</div>;
    }
  };

  if (!authReady)
    return (
      <main className="min-h-screen bg-[var(--app-bg)] text-white flex items-center justify-center">
        در حال بررسی دسترسی…
      </main>
    );
  if (!me) return null;

  return (
    <AppLayout
      activeTab={effectiveActiveTab}
      setActiveTab={navigateTab}
      selectedProjectId={selectedProjectId}
      setSelectedProjectId={setSelectedProjectId}
      me={me}
    >
      {renderActiveView()}
    </AppLayout>
  );
}
