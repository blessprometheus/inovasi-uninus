import { getAdminResearcherHandlers } from "@/platform/auth/runtime";

export const GET = (request: Request) => getAdminResearcherHandlers().list(request);
export const POST = (request: Request) => getAdminResearcherHandlers().create(request);
