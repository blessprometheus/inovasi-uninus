import { getTaxonomyHandlers } from "@/platform/auth/runtime";

export const GET = (request: Request) => getTaxonomyHandlers().listAdmin(request, "faculties");
export const POST = (request: Request) => getTaxonomyHandlers().create(request, "faculties");
