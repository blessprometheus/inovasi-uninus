import { getFilesHandlers } from "@/platform/auth/runtime";

export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  getFilesHandlers().servePublic(request, (await params).id);
