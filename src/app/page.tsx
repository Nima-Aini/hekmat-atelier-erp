"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const [authReady, setAuthReady] = useState(false);
  const [me, setMe] = useState<any>(null);
  useEffect(() => {
    fetch("/api/auth/employee-me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) router.replace("/employee-login");
        else setMe(data);
        setAuthReady(true);
      })
      .catch(() => router.replace("/employee-login"));
  }, [router]);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [selectedFinanceContractId, setSelectedFinanceContractId] = useState<string | null>(null);
  const permissionValues: string[] = me?.navigationPermissions || me?.permissions || [];
  const availableSections = visibleAtelierSections(SECTION_IDS, permissionValues);
  const effectiveActiveTab = canSeeAtelierSection(activeTab, permissionValues)
    ? activeTab
    : availableSections[0] || "";
  const renderActiveView = () => {
    switch (effectiveActiveTab) {
      case "dashboard":
        return <FinalDashboard onNavigate={setActiveTab} />;
      case "contracts":
        return <ContractsView onNavigateFinance={(contractId) => { setSelectedFinanceContractId(contractId); setActiveTab("finance"); }} />;
      case "daily_visits":
        return <SimpleRecordsView kind="daily-visits" />;
      case "reservations":
        return <SimpleRecordsView kind="reservations" />;
      case "planning":
        return <PlanningView />;
      case "calendar":
        return <FinalCalendar />;
      case "customers":
        return <ContractCustomersView />;
      case "personnel":
        return <PersonnelView />;
      case "equipment":
        return <EquipmentView />;
      case "finance":
        return <AtelierFinanceView initialContractId={selectedFinanceContractId} />;
      case "notifications":
        return <FinalNotificationsView onNavigate={setActiveTab} />;
      case "ai":
        return <AiAssistantView selectedProjectId={selectedProjectId} />;
      case "settings":
        return <FinalSettingsView />;
      default:
        return <div className="atelier-panel p-6 text-sm text-zinc-400">هیچ بخشی برای این حساب فعال نشده است. با مدیر سیستم تماس بگیرید.</div>;
    }
  };

  if (!authReady)
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        در حال بررسی دسترسی…
      </main>
    );
  if (!me) return null;

  return (
    <AppLayout
      activeTab={effectiveActiveTab}
      setActiveTab={setActiveTab}
      selectedProjectId={selectedProjectId}
      setSelectedProjectId={setSelectedProjectId}
      me={me}
    >
      {renderActiveView()}
    </AppLayout>
  );
}
