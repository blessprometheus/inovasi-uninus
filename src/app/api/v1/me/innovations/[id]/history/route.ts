import { getInnovationHandlers } from "@/platform/auth/runtime";

export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  getInnovationHandlers().history(request, (await params).id);
