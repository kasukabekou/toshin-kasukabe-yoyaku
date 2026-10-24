import { describe, it, expect } from "vitest";
import { clientIp } from "./clientIp";

describe("申込元IPの取得", () => {
  it("x-real-ip を優先し、利用者が書ける X-Forwarded-For の先頭は使わない", () => {
    const h = new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.5", "x-real-ip": "203.0.113.5" });
    expect(clientIp(h)).toBe("203.0.113.5");
  });
  it("x-real-ip が無ければ X-Forwarded-For の最後の値を使う", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.5" }))).toBe("203.0.113.5");
  });
  it("どちらも無ければ unknown", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
