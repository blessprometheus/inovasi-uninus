import { getInnovationHandlers } from "@/platform/auth/runtime";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, { params }: Ctx) =>
  getInnovationHandlers().get(request, (await params).id);
export const PATCH = async (request: Request, { params }: Ctx) =>
  getInnovationHandlers().patch(request, (await params).id);
export const DELETE = async (request: Request, { params }: Ctx) =>
  getInnovationHandlers().remove(request, (await params).id);
