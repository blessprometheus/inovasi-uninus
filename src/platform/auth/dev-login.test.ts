import { describe, expect, it } from "vitest";
import { assertDevLoginSafe, isDevLoginEnabled } from "./dev-login";

const DEV = { DEV_LOGIN: "1", APP_ENV: "development", NODE_ENV: "development" };

describe("login pengembangan", () => {
  it("aktif hanya bila diminta DAN lingkungan pengembangan", () => {
    expect(isDevLoginEnabled(DEV)).toBe(true);
    expect(isDevLoginEnabled({ ...DEV, DEV_LOGIN: undefined })).toBe(false);
    expect(isDevLoginEnabled({ ...DEV, DEV_LOGIN: "true" })).toBe(false);
    expect(isDevLoginEnabled({ ...DEV, APP_ENV: "production" })).toBe(false);
    expect(isDevLoginEnabled({ ...DEV, APP_ENV: "staging" })).toBe(false);
    expect(isDevLoginEnabled({ ...DEV, NODE_ENV: "production" })).toBe(false);
  });

  it("server menolak start bila DEV_LOGIN=1 di luar pengembangan", () => {
    expect(() => assertDevLoginSafe({ ...DEV, APP_ENV: "production" })).toThrow(/DEV_LOGIN/);
    expect(() => assertDevLoginSafe({ ...DEV, APP_ENV: "staging" })).toThrow();
    expect(() => assertDevLoginSafe({ ...DEV, NODE_ENV: "production" })).toThrow();
  });

  it("start normal bila tidak diminta atau aman", () => {
    expect(() => assertDevLoginSafe({})).not.toThrow();
    expect(() => assertDevLoginSafe({ APP_ENV: "production", NODE_ENV: "production" })).not.toThrow();
    expect(() => assertDevLoginSafe(DEV)).not.toThrow();
  });
});
