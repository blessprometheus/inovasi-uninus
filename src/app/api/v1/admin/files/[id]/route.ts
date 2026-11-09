import { getFilesHandlers } from "@/platform/auth/runtime";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, { params }: Ctx) => getFilesHandlers().serveAdmin(request, (await params).id);
export const PATCH = async (request: Request, { params }: Ctx) => getFilesHandlers().patch(request, (await params).id);
export const DELETE = async (request: Request, { params }: Ctx) => getFilesHandlers().remove(request, (await params).id);
