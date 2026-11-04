import { getInnovationHandlers } from "@/platform/auth/runtime";

export const GET = (request: Request) => getInnovationHandlers().list(request);
export const POST = (request: Request) => getInnovationHandlers().create(request);
