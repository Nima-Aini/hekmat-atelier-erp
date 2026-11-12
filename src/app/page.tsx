import { Suspense } from "react";
import AtelierApp from "@/components/atelier/AtelierApp";
export default function Page() { return <Suspense fallback={<p>در حال بارگذاری…</p>}><AtelierApp /></Suspense>; }
