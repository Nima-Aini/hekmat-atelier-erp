"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { StudioDashboard } from "@/components/studio/dashboard/StudioDashboard";
import { AiAssistantView } from "@/components/views/AiAssistantView";
import { BackupView } from "@/components/views/BackupView";
import { SettingsView } from "@/components/views/SettingsView";
import { AuditLogsView } from "@/components/views/AuditLogsView";
import { StudioPersonnelView } from "@/components/views/StudioPersonnelView";
import { StudioEquipmentView } from "@/components/views/StudioEquipmentView";
import { StudioCRMView } from "@/components/views/StudioCRMView";
import { LeadPipeline } from "@/components/studio/crm/LeadPipeline";
import { StudioWorkboard } from "@/components/studio/tasks/StudioWorkboard";
import { StudioCatalogView } from "@/components/studio/catalog/StudioCatalogView";
import { AtelierFinancialCenter } from "@/components/studio/finance/AtelierFinancialCenter";
import { AtelierReportsView } from "@/components/studio/reports/AtelierReportsView";
import { StudioNotificationsView } from "@/components/studio/notifications/StudioNotificationsView";
import { StudioVendorsView } from "@/components/studio/vendors/StudioVendorsView";

export default function HomePage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [me, setMe] = useState<any>(null);
  useEffect(() => { fetch("/api/auth/employee-me").then((r) => r.json()).then((data) => { if (!data.success) router.replace("/employee-login"); else setMe(data); setAuthReady(true); }).catch(() => router.replace("/employee-login")); }, [router]);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedStudioProjectId, setSelectedStudioProjectId] = useState<string | null>(null);

  const renderActiveView = () => {
    switch (activeTab) {
      case "dashboard":
        return <StudioDashboard onNavigate={setActiveTab} />;
      case "studio_crm":
        return <LeadPipeline onOpenProject={(id) => { setSelectedStudioProjectId(id); setActiveTab("projects"); }} />;
      case "audit_logs":
        return <AuditLogsView selectedProjectId={selectedProjectId} onNavigate={setActiveTab} />;
      case "customers":
        return <StudioCRMView key="customers" initialTab="customers" onNavigate={setActiveTab} />;
      case "calendar":
        return <StudioCRMView key="calendar" initialTab="execution" onNavigate={setActiveTab} />;
      case "tasks":
        return <StudioWorkboard />;
      case "catalog":
        return <StudioCatalogView />;
      case "financial":
        return <AtelierFinancialCenter selectedProjectId={selectedProjectId} />;
      case "vendors":
        return <StudioVendorsView />;
      case "studio_personnel":
        return <StudioPersonnelView onNavigate={setActiveTab} />;
      case "studio_equipment":
        return <StudioEquipmentView onNavigate={setActiveTab} />;
      case "projects":
        return <StudioCRMView key="projects" initialProjectId={selectedStudioProjectId} initialTab="projects" onNavigate={setActiveTab} />;
      case "reports":
        return <AtelierReportsView />;
      case "alerts":
        return <StudioNotificationsView />;
      case "ai":
        return <AiAssistantView selectedProjectId={selectedProjectId} />;
      case "backup":
        return <BackupView />;
      case "settings":
        return <SettingsView />;
      default:
        return <StudioDashboard onNavigate={setActiveTab} />;
    }
  };

  if (!authReady) return <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">در حال بررسی دسترسی…</main>;
  if (!me) return null;

  return (
    <AppLayout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      selectedProjectId={selectedProjectId}
      setSelectedProjectId={setSelectedProjectId}
      me={me}
    >
      {renderActiveView()}
    </AppLayout>
  );
}
