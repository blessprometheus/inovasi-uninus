import { pgEnum } from "drizzle-orm/pg-core";
import { INNOVATION_STATUSES } from "../../../modules/workflow/transitions";

export const innovationStatus = pgEnum("innovation_status", INNOVATION_STATUSES);
export const memberRole = pgEnum("member_role", ["lead", "member"]);
export const fileKind = pgEnum("file_kind", ["image", "document", "video_link"]);
export const fileVisibility = pgEnum("file_visibility", ["public", "restricted"]);
export const ipKind = pgEnum("ip_kind", ["hki", "paten", "lainnya"]);
export const collabStatus = pgEnum("collab_status", ["new", "in_progress", "closed"]);
