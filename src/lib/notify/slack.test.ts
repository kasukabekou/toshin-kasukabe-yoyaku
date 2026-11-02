import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { sendSlack } from "./slack";

const URL = "https://hooks.example.invalid/services/TEST";
beforeEach(() => { delete process.env.SLACK_WEBHOOK_URL; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("sendSlack", () => {
  it("URL未設定なら何も送らず false（例外なし）", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect(await sendSlack("x")).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it("設定済みなら text をJSONで送る", async () => {
    process.env.SLACK_WEBHOOK_URL = URL;
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200 }); vi.stubGlobal("fetch", f);
    expect(await sendSlack("こんにちは")).toBe(true);
    expect(f).toHaveBeenCalledWith(URL, expect.objectContaining({ method: "POST", body: JSON.stringify({ text: "こんにちは" }) }));
  });
  it("送信に失敗しても例外を投げず、URLをログに出さない", async () => {
    process.env.SLACK_WEBHOOK_URL = URL;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`connect failed ${URL}`)));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendSlack("x")).toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain("hooks.example");
    log.mockRestore();
  });
  it("Slackが拒否(4xx/5xx)したら false", async () => {
    process.env.SLACK_WEBHOOK_URL = URL;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendSlack("x")).toBe(false);
    log.mockRestore();
  });
});
