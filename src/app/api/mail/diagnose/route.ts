import { NextResponse } from "next/server";
import { mailSecretOk } from "@/lib/mail/auth";
import { Pop3Client, pop3ConfigFromEnv } from "@/lib/mail/pop3";
import { probePlainCapa, probeTls } from "@/lib/mail/popProbe";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

// POP接続の診断。メール本文は読まない・削除しない・DBに書かない。段階的に実行する：
//  1) 既定: 暗号化接続(POP3S)の可否と証明書の確認のみ。ID・パスワードは送らない。
//  2) ?capa=1: ポート110に接続し、STARTTLS対応(CAPA)だけを確認。暗号化前の接続だが、挨拶と機能一覧のみ。ログインしない。
//  3) ?login=1: 設定済みの暗号化方式(tls/starttls)でログインし、件数・UIDL対応を確認。暗号化なし設定では実行しない。
export async function GET(request: Request) {
  if (!mailSecretOk(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const host = process.env.MAIL_POP_HOST;
  if (!host) return NextResponse.json({ ok: false, stage: "config", message: "MAIL_POP_HOST が未設定です。" }, { status: 400 });

  const out: Record<string, unknown> = { host };
  out.pop3s = await probeTls(host, Number(url.searchParams.get("tlsPort") ?? 995));
  if (url.searchParams.get("capa") === "1") out.plainCapa = await probePlainCapa(host, Number(url.searchParams.get("plainPort") ?? 110));

  if (url.searchParams.get("login") === "1") {
    const cfg = pop3ConfigFromEnv();
    if (!cfg) return NextResponse.json({ ...out, ok: false, stage: "config", message: "接続設定が未設定または不正です。" }, { status: 400 });
    if (cfg.secure === "none") {
      return NextResponse.json({ ...out, ok: false, stage: "config", message: "MAIL_POP_SECURE が none のためログイン診断は実行しません（tls または starttls に設定してください）。" }, { status: 400 });
    }
    const client = new Pop3Client(cfg);
    let stage = "connect";
    try {
      await client.connect();
      stage = "stat";
      const { count, octets } = await client.stat();
      stage = "uidl";
      let uidlSupported = true;
      try { await client.uidl(); } catch { uidlSupported = false; }
      out.login = { ok: true, secure: cfg.secure, port: cfg.port, messageCount: count, mailboxBytes: octets, uidlSupported };
    } catch (e) {
      out.login = { ok: false, stage, secure: cfg.secure, port: cfg.port, message: e instanceof Error ? e.message : "unknown" };
    } finally {
      await client.quit();
    }
  }
  return NextResponse.json({ ok: true, ...out });
}
