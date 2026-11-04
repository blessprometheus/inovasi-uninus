import { getAdminInnovationHandlers } from "@/platform/auth/runtime";

export const GET = (request: Request) => getAdminInnovationHandlers().list(request);
