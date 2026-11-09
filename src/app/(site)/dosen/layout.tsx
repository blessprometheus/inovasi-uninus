import { notFound } from "next/navigation";
import { isResearcherPortalEnabled } from "@/platform/config/features";

/**
 * Portal dosen dimatikan sejak ADR-008 (hanya operator yang login). Kodenya dipertahankan di balik
 * flag RESEARCHER_PORTAL; saat mati, seluruh /dosen menjawab 404.
 */
export default function DosenLayout({ children }: { children: React.ReactNode }) {
  if (!isResearcherPortalEnabled()) notFound();
  return children;
}
