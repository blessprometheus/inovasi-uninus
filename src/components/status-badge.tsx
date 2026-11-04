import {
  BadgeCheck,
  CircleDashed,
  EyeOff,
  FileEdit,
  Globe,
  Hourglass,
  PencilLine,
  Send,
  type LucideIcon,
} from "lucide-react";
import type { InnovationStatus } from "@/modules/workflow/transitions";

interface StatusStyle {
  label: string;
  Icon: LucideIcon;
  className: string;
}

/** Teks + ikon + warna: status tidak pernah disampaikan hanya lewat warna (UI_UX_GUIDELINES §2, §7). */
const STATUS: Record<InnovationStatus, StatusStyle> = {
  draft: {
    label: "Draft",
    Icon: FileEdit,
    className: "bg-status-draft-bg text-status-draft-fg",
  },
  submitted: {
    label: "Diajukan",
    Icon: Send,
    className: "bg-status-submitted-bg text-status-submitted-fg",
  },
  under_review: {
    label: "Sedang diperiksa",
    Icon: Hourglass,
    className: "bg-status-under-review-bg text-status-under-review-fg",
  },
  revision_required: {
    label: "Perlu revisi",
    Icon: PencilLine,
    className: "bg-status-revision-bg text-status-revision-fg",
  },
  approved: {
    label: "Disetujui",
    Icon: BadgeCheck,
    className: "bg-status-approved-bg text-status-approved-fg",
  },
  published: {
    label: "Terbit",
    Icon: Globe,
    className: "bg-status-published-bg text-status-published-fg",
  },
  unpublished: {
    label: "Ditarik",
    Icon: EyeOff,
    className: "border border-dashed border-border-input bg-status-unpublished-bg text-status-unpublished-fg",
  },
};

export const STATUS_LABEL: Record<InnovationStatus, string> = Object.fromEntries(
  Object.entries(STATUS).map(([key, value]) => [key, value.label]),
) as Record<InnovationStatus, string>;

export function StatusBadge({ status }: { status: InnovationStatus }) {
  const { label, Icon, className } = STATUS[status] ?? {
    label: status,
    Icon: CircleDashed,
    className: "bg-status-draft-bg text-status-draft-fg",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-control px-2.5 py-1 text-sm font-semibold ${className}`}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
