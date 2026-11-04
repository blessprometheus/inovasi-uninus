import { getAuthHandlers } from "@/platform/auth/runtime";

export const POST = (request: Request) => getAuthHandlers().devLogin(request);
