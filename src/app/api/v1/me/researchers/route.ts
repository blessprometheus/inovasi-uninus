import { getResearcherLookupHandler } from "@/platform/auth/runtime";

export const GET = (request: Request) => getResearcherLookupHandler()(request);
