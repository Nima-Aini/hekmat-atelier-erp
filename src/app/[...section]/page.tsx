import { notFound } from "next/navigation";
import Page from "../page";
const sections = new Set(["dashboard", "contracts", "daily_visits", "reservations", "planning", "calendar", "customers", "personnel", "equipment", "finance", "notifications", "ai", "settings", "appearance"]);
const details = new Set(["contracts", "customers", "planning", "finance"]);
export default async function SectionPage({ params }: { params: Promise<{ section: string[] }> }) {
 const { section } = await params;
 if (!sections.has(section[0]) || section.length > 2 || (section.length === 2 && (!details.has(section[0]) || !/^[0-9a-f-]{36}$/i.test(section[1])))) notFound();
 return <Page />;
}
