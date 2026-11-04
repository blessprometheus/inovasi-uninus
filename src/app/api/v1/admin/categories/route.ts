import { getTaxonomyHandlers } from "@/platform/auth/runtime";

export const GET = (request: Request) => getTaxonomyHandlers().listAdmin(request, "categories");
export const POST = (request: Request) => getTaxonomyHandlers().create(request, "categories");
