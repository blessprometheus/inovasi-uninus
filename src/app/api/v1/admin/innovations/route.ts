import { getAdminInnovationHandlers } from "@/platform/auth/runtime";

export const GET = (request: Request) => getAdminInnovationHandlers().list(request);
export const POST = (request: Request) => getAdminInnovationHandlers().create(request);
