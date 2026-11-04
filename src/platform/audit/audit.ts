import type { Database } from "@/platform/db/client";
import { auditLogs } from "@/platform/db/schema";

export interface AuditEntry {
  actorId: string | null;
  /** Kode tindakan stabil, mis. `auth.login`, `auth.logout`. */
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Tanpa data sensitif (password, token, isi dokumen). */
  changes?: Record<string, unknown>;
  userAgent?: string | null;
}

/** Tabel audit_logs append-only (docs/SECURITY.md §7). Hanya ada insert, tidak ada update/delete. */
export async function recordAudit(db: Database, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    changes: entry.changes ?? null,
    userAgent: entry.userAgent?.slice(0, 300) ?? null,
  });
}
