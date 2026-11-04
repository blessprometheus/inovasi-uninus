import { getAdminInnovationHandlers } from "@/platform/auth/runtime";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, { params }: Ctx) =>
  getAdminInnovationHandlers().get(request, (await params).id);
export const PATCH = async (request: Request, { params }: Ctx) =>
  getAdminInnovationHandlers().patch(request, (await params).id);
export const DELETE = async (request: Request, { params }: Ctx) =>
  getAdminInnovationHandlers().remove(request, (await params).id);
