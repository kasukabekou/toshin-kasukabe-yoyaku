import net from "node:net";
import tls from "node:tls";

// 最小限の POP3 クライアント。読み取り専用：DELE（サーバーからの削除）は意図的に実装しない。
// Outlook など他のクライアントが同じメールボックスを使っていても、メールを消さない。

export interface Pop3Config {
  host: string;
  port: number;
  secure: "tls" | "starttls" | "none"; // tls=暗号化接続(995) / starttls=平文で開始して暗号化 / none=暗号化なし(非推奨)
  user: string;
  password: string;
  timeoutMs?: number;
}

export class Pop3Client {
  private socket!: net.Socket;
  private buffer = "";
  private waiter: (() => void) | null = null;
  private closed = false;
  private error: Error | null = null;

  constructor(private cfg: Pop3Config) {}

  private attach(sock: net.Socket) {
    this.socket = sock;
    sock.setEncoding("latin1"); // 本文はバイト列のまま扱い、文字コード変換は mailparser に任せる
    sock.setTimeout(this.cfg.timeoutMs ?? 15000, () => sock.destroy(new Error("POP3 timeout")));
    sock.on("data", (d: string) => { this.buffer += d; this.waiter?.(); });
    sock.on("error", (e) => { this.error = e; this.waiter?.(); });
    sock.on("close", () => { this.closed = true; this.waiter?.(); });
  }

  private async waitFor(pred: () => number): Promise<number> {
    for (;;) {
      if (this.error) throw this.error;
      const idx = pred();
      if (idx >= 0) return idx;
      if (this.closed) throw new Error("POP3 connection closed");
      await new Promise<void>((r) => { this.waiter = r; });
    }
  }

  private async readLine(): Promise<string> {
    const i = await this.waitFor(() => this.buffer.indexOf("\r\n"));
    const line = this.buffer.slice(0, i);
    this.buffer = this.buffer.slice(i + 2);
    return line;
  }

  private async expectOk(): Promise<string> {
    const line = await this.readLine();
    if (!line.startsWith("+OK")) throw new Error(`POP3 error: ${line.replace(this.cfg.password, "***").slice(0, 120)}`);
    return line;
  }

  private async command(cmd: string): Promise<string> {
    this.socket.write(`${cmd}\r\n`, "latin1");
    return this.expectOk();
  }

  // 複数行の応答（終端は "." だけの行）を読む。行頭の ".." は "." に戻す（ドットスタッフィング）。
  private async readMultiline(): Promise<string> {
    const end = await this.waitFor(() => {
      if (this.buffer.startsWith(".\r\n")) return 0;
      return this.buffer.indexOf("\r\n.\r\n");
    });
    const raw = this.buffer.startsWith(".\r\n") ? "" : this.buffer.slice(0, end + 2);
    this.buffer = this.buffer.slice(this.buffer.startsWith(".\r\n") ? 3 : end + 5);
    return raw.replace(/^\.\./gm, ".");
  }

  async connect(): Promise<void> {
    const { host, port, secure } = this.cfg;
    // 本番では暗号化なしの接続を一切行わない（ID・パスワード・本文が平文で流れるため）。ローカルの試験用サーバーのみ許可。
    if (secure === "none" && process.env.NODE_ENV === "production") {
      throw new Error("本番環境では暗号化なしのPOP接続は許可されていません（MAIL_POP_SECURE=tls または starttls を使用してください）。");
    }
    const sock = await new Promise<net.Socket>((resolve, reject) => {
      const s = secure === "tls" ? tls.connect({ host, port, servername: host }, () => resolve(s)) : net.connect({ host, port }, () => resolve(s));
      s.once("error", reject);
    });
    this.attach(sock);
    await this.expectOk(); // グリーティング
    if (secure === "starttls") {
      await this.command("STLS");
      const upgraded = tls.connect({ socket: this.socket, servername: host });
      await new Promise<void>((res, rej) => { upgraded.once("secureConnect", res); upgraded.once("error", rej); });
      this.buffer = "";
      this.attach(upgraded);
    }
    await this.command(`USER ${this.cfg.user}`);
    await this.command(`PASS ${this.cfg.password}`);
  }

  async stat(): Promise<{ count: number; octets: number }> {
    const m = (await this.command("STAT")).match(/\+OK\s+(\d+)\s+(\d+)/);
    return { count: Number(m?.[1] ?? 0), octets: Number(m?.[2] ?? 0) };
  }

  // 番号 → サーバー上の固有ID（UIDL）。UIDL 非対応のサーバーでは例外。
  async uidl(): Promise<{ n: number; uid: string }[]> {
    await this.command("UIDL");
    return (await this.readMultiline())
      .split("\r\n")
      .filter(Boolean)
      .map((l) => { const [n, uid] = l.split(" "); return { n: Number(n), uid }; });
  }

  async retr(n: number): Promise<Buffer> {
    await this.command(`RETR ${n}`);
    return Buffer.from(await this.readMultiline(), "latin1");
  }

  async top(n: number, lines = 0): Promise<Buffer> {
    await this.command(`TOP ${n} ${lines}`);
    return Buffer.from(await this.readMultiline(), "latin1");
  }

  async quit(): Promise<void> {
    try {
      if (!this.closed) this.socket.write("QUIT\r\n");
    } finally {
      this.socket?.destroy();
    }
  }
}

export function pop3ConfigFromEnv(): Pop3Config | null {
  const { MAIL_POP_HOST: host, MAIL_POP_USER: user, MAIL_POP_PASSWORD: password } = process.env;
  if (!host || !user || !password) return null;
  const rawSecure = process.env.MAIL_POP_SECURE ?? "tls";
  if (!(["tls", "starttls", "none"] as string[]).includes(rawSecure)) return null; // 不正な値は接続しない
  const secure = rawSecure as Pop3Config["secure"];
  const port = Number(process.env.MAIL_POP_PORT ?? (secure === "tls" ? 995 : 110));
  return { host, port, secure, user, password };
}
