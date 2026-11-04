import { getTaxonomyHandlers } from "@/platform/auth/runtime";

export const GET = () => getTaxonomyHandlers().listPublic("innovation-types");
