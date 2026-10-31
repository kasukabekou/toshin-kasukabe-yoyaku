import net from "node:net";
import tls from "node:tls";

// 暗号化POPが使えるかの診断。ID・パスワードは一切送らない（接続して挨拶・機能一覧を見るだけ）。

export interface TlsProbe {
  reachable: boolean;
  error?: string;
  greeting?: string;
  protocol?: string | null;
  certificate?: { authorized: boolean; authorizationError?: string; subjectCN?: string; issuerCN?: string; validTo?: string; hostnameMatches: boolean };
}

// 暗号化接続（POP3S、一般にポート995）を試す。証明書が正しいかも確認する。
export function probeTls(host: string, port: number, timeoutMs = 8000): Promise<TlsProbe> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: TlsProbe) => { if (!done) { done = true; sock.destroy(); resolve(r); } };
    // 診断のためだけに証明書エラーでも接続して内容を報告する（認証情報は送らないので安全）。実運用の接続は証明書検証あり。
    const sock = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
      const cert = sock.getPeerCertificate();
      const info = {
        authorized: sock.authorized,
        authorizationError: sock.authorizationError ? String(sock.authorizationError) : undefined,
        subjectCN: cert?.subject?.CN as string | undefined,
        issuerCN: cert?.issuer?.CN as string | undefined,
        validTo: cert?.valid_to,
        hostnameMatches: tls.checkServerIdentity(host, cert) === undefined,
      };
      let buf = "";
      sock.setEncoding("latin1");
      sock.on("data", (d: string) => {
        buf += d;
        if (buf.includes("\r\n")) {
          sock.write("QUIT\r\n");
          finish({ reachable: true, greeting: buf.split("\r\n")[0].slice(0, 80), protocol: sock.getProtocol(), certificate: info });
        }
      });
    });
    sock.setTimeout(timeoutMs, () => finish({ reachable: false, error: "timeout（外部から接続できない、またはポートが閉じています）" }));
    sock.on("error", (e) => finish({ reachable: false, error: e.message }));
  });
}

export interface PlainCapaProbe { reachable: boolean; error?: string; startTlsAdvertised?: boolean; capabilities?: string[] }

// ポート110に接続し、機能一覧（CAPA）だけを問い合わせて STLS（STARTTLS）対応を確認する。ログインはしない。
// ※ 暗号化前の接続だが、やり取りは挨拶と機能一覧のみ。呼び出し側が明示したときだけ実行する。
export function probePlainCapa(host: string, port: number, timeoutMs = 8000): Promise<PlainCapaProbe> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: PlainCapaProbe) => { if (!done) { done = true; sock.destroy(); resolve(r); } };
    const sock = net.connect({ host, port });
    let buf = "";
    let sent = false;
    sock.setEncoding("latin1");
    sock.setTimeout(timeoutMs, () => finish({ reachable: false, error: "timeout（外部から接続できない、またはポートが閉じています）" }));
    sock.on("error", (e) => finish({ reachable: false, error: e.message }));
    sock.on("data", (d: string) => {
      buf += d;
      if (!sent && buf.includes("\r\n")) { sent = true; buf = ""; sock.write("CAPA\r\n"); return; }
      if (sent && /\r\n\.\r\n$|^-ERR/m.test(buf)) {
        sock.write("QUIT\r\n");
        const caps = buf.split("\r\n").filter((l) => l && l !== "." && !l.startsWith("+OK")).map((l) => l.split(" ")[0].toUpperCase());
        finish({ reachable: true, startTlsAdvertised: caps.includes("STLS"), capabilities: caps });
      }
    });
  });
}
