import { getAdminResearcherHandlers } from "@/platform/auth/runtime";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, { params }: Ctx) =>
  getAdminResearcherHandlers().get(request, (await params).id);
export const PATCH = async (request: Request, { params }: Ctx) =>
  getAdminResearcherHandlers().patch(request, (await params).id);
export const DELETE = async (request: Request, { params }: Ctx) =>
  getAdminResearcherHandlers().remove(request, (await params).id);
