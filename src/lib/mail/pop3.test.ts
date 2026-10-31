import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { Pop3Client } from "./pop3";

// ローカルの偽 POP3 サーバーで、読み取り専用の動作（DELE を送らない）とドットスタッフィングを確認する。
let server: net.Server | null = null;
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

function start(commands: string[]): Promise<number> {
  const msgs = ["Subject: A\r\n\r\nhello\r\n..dot line\r\n", "Subject: B\r\n\r\nbody2\r\n"];
  return new Promise((resolve) => {
    server = net.createServer((s) => {
      s.on("error", () => {});
      s.write("+OK ready\r\n");
      let buf = "";
      s.on("data", (d) => {
        buf += d.toString();
        let i;
        while ((i = buf.indexOf("\r\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 2);
          commands.push(line);
          if (line.startsWith("USER") || line.startsWith("PASS")) s.write("+OK\r\n");
          else if (line === "STAT") s.write("+OK 2 100\r\n");
          else if (line === "UIDL") s.write("+OK\r\n1 uid-a\r\n2 uid-b\r\n.\r\n");
          else if (line.startsWith("RETR")) s.write(`+OK\r\n${msgs[Number(line.split(" ")[1]) - 1]}.\r\n`);
          else if (line === "QUIT") s.end("+OK bye\r\n");
          else s.write("-ERR unknown\r\n");
        }
      });
    });
    server.listen(0, "127.0.0.1", () => resolve((server!.address() as net.AddressInfo).port));
  });
}

describe("Pop3Client", () => {
  it("STAT/UIDL/RETR を読み、DELE は一切送らない", async () => {
    const commands: string[] = [];
    const port = await start(commands);
    const c = new Pop3Client({ host: "127.0.0.1", port, secure: "none", user: "u", password: "p" });
    await c.connect();
    expect(await c.stat()).toEqual({ count: 2, octets: 100 });
    expect(await c.uidl()).toEqual([{ n: 1, uid: "uid-a" }, { n: 2, uid: "uid-b" }]);
    const m1 = (await c.retr(1)).toString();
    expect(m1).toContain("hello");
    expect(m1).toContain("\r\n.dot line"); // ".." は "." に戻る
    expect((await c.retr(2)).toString()).toContain("body2");
    await c.quit();
    expect(commands.some((l) => l.startsWith("DELE"))).toBe(false);
  });
  it("ログイン失敗はパスワードを含まないエラーにする", async () => {
    const port = await new Promise<number>((resolve) => {
      server = net.createServer((s) => {
        s.on("error", () => {});
        s.write("+OK ready\r\n");
        s.on("data", (d) => s.write(d.toString().startsWith("PASS") ? "-ERR bad secret-pass\r\n" : "+OK\r\n"));
      });
      server.listen(0, "127.0.0.1", () => resolve((server!.address() as net.AddressInfo).port));
    });
    const c = new Pop3Client({ host: "127.0.0.1", port, secure: "none", user: "u", password: "secret-pass" });
    await expect(c.connect()).rejects.toThrow(/POP3 error: -ERR bad \*\*\*/);
    await c.quit();
  });
});

describe("暗号化の強制", () => {
  it("本番環境では暗号化なし(none)の接続を拒否する", async () => {
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      const c = new Pop3Client({ host: "127.0.0.1", port: 1, secure: "none", user: "u", password: "p" });
      await expect(c.connect()).rejects.toThrow(/暗号化なし/);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
    }
  });
});
