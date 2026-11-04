import { getTaxonomyHandlers } from "@/platform/auth/runtime";

export const GET = (request: Request) => getTaxonomyHandlers().listAdmin(request, "innovation-types");
export const POST = (request: Request) => getTaxonomyHandlers().create(request, "innovation-types");
