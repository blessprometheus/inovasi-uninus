import { getUsersHandlers } from "@/platform/auth/runtime";

export const GET = (request: Request) => getUsersHandlers().list(request);
export const POST = (request: Request) => getUsersHandlers().create(request);
