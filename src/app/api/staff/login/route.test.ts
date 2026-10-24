import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const throttle = vi.hoisted(() => ({ isLoginLocked: vi.fn(), recordLoginFailure: vi.fn() }));
vi.mock("@/lib/staff/loginThrottle", () => throttle);

import { POST } from "./route";

function request(code: string): NextRequest {
  return new Request("http://localhost/api/staff/login", {
    method: "POST",
    headers: { "x-real-ip": "203.0.113.5" },
    body: JSON.stringify({ code }),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STAFF_SESSION_SECRET = "test-secret";
  process.env.STAFF_ACCESS_CODE = "correct-code";
  throttle.isLoginLocked.mockResolvedValue(false);
});

describe("POST /api/staff/login", () => {
  it("正しいコードでセッションCookieを発行する", async () => {
    const res = await POST(request("correct-code"));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("staff_session=");
    expect(throttle.recordLoginFailure).not.toHaveBeenCalled();
  });

  it("誤ったコードは失敗を記録して401", async () => {
    const res = await POST(request("wrong"));
    expect(res.status).toBe(401);
    expect(throttle.recordLoginFailure).toHaveBeenCalledWith("203.0.113.5");
  });

  it("失敗が続いたIPは正しいコードでも429", async () => {
    throttle.isLoginLocked.mockResolvedValue(true);
    const res = await POST(request("correct-code"));
    expect(res.status).toBe(429);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
