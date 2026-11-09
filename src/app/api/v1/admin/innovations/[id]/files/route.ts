import { getFilesHandlers } from "@/platform/auth/runtime";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, { params }: Ctx) => getFilesHandlers().list(request, (await params).id);
export const POST = async (request: Request, { params }: Ctx) => getFilesHandlers().upload(request, (await params).id);
