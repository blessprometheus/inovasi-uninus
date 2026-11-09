import { getUsersHandlers } from "@/platform/auth/runtime";

export const PATCH = async (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  getUsersHandlers().patch(request, (await params).id);
