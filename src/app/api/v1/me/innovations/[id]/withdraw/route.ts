import { getInnovationHandlers } from "@/platform/auth/runtime";

export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  getInnovationHandlers().withdraw(request, (await params).id);
