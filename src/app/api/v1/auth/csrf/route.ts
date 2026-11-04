import { getAuthHandlers } from "@/platform/auth/runtime";

export const GET = (request: Request) => getAuthHandlers().csrf(request);
