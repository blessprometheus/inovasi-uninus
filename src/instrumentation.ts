import { assertDevLoginSafe } from "@/platform/auth/dev-login";

/** Dijalankan sekali saat server start: konfigurasi berbahaya menggagalkan start, bukan diam-diam diabaikan. */
export function register() {
  assertDevLoginSafe();
}
