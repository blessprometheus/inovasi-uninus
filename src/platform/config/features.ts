/**
 * Feature flag. Dibaca saat dipanggil (bukan saat modul dimuat) supaya tes dapat mengubahnya.
 * Portal dosen dimatikan sejak ADR-008: hanya operator yang login dan menginput konten.
 * Kodenya dipertahankan (D-20) supaya bisa dibuka lagi bila dosen kelak diberi akses.
 */
export function isResearcherPortalEnabled(): boolean {
  return process.env.RESEARCHER_PORTAL === "1";
}
