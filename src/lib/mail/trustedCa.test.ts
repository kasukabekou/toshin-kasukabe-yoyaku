import tls from "node:tls";
import { X509Certificate } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SECTIGO_DV_R36_PEM, SECTIGO_DV_R36_SHA256, trustedCa } from "./trustedCa";

// 同梱した中間証明書が、改ざん・取り違えのない正規のものであることを確認する（ネットワーク不要）。
describe("trustedCa", () => {
  const inter = new X509Certificate(SECTIGO_DV_R36_PEM);

  it("記載どおりの中間証明書で、指紋が一致する", () => {
    expect(inter.subject).toContain("CN=Sectigo Public Server Authentication CA DV R36");
    expect(inter.fingerprint256).toBe(SECTIGO_DV_R36_SHA256);
    expect(inter.ca).toBe(true);
  });

  it("Node.js 標準の信頼ストアにあるルート証明書(R46)が署名している", () => {
    const root = tls.rootCertificates.map((p) => new X509Certificate(p)).find((c) => c.subject.includes("CN=Sectigo Public Server Authentication Root R46"));
    expect(root).toBeDefined();
    expect(inter.checkIssued(root!)).toBe(true);
    expect(inter.verify(root!.publicKey)).toBe(true);
  });

  it("有効期限内である", () => {
    expect(new Date(inter.validTo).getTime()).toBeGreaterThan(Date.now());
  });

  it("信頼ストアは標準ルートを含み、中間証明書を1枚だけ追加する", () => {
    const ca = trustedCa();
    expect(ca.length).toBe(tls.rootCertificates.length + 1);
    expect(ca.at(-1)).toBe(SECTIGO_DV_R36_PEM);
  });
});
