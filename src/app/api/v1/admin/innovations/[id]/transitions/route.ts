import { getAdminInnovationHandlers } from "@/platform/auth/runtime";

export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  getAdminInnovationHandlers().transition(request, (await params).id);
