import { getUsersHandlers } from "@/platform/auth/runtime";

export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  getUsersHandlers().resetPassword(request, (await params).id);
