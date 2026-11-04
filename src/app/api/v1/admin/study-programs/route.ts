import { getTaxonomyHandlers } from "@/platform/auth/runtime";

export const GET = (request: Request) => getTaxonomyHandlers().listAdmin(request, "study-programs");
export const POST = (request: Request) => getTaxonomyHandlers().create(request, "study-programs");
