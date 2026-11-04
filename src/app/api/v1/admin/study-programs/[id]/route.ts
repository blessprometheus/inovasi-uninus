import { getTaxonomyHandlers } from "@/platform/auth/runtime";

export const PATCH = async (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  getTaxonomyHandlers().update(request, "study-programs", (await params).id);
