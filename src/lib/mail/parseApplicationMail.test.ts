import { describe, expect, it } from "vitest";
import { parseApplicationMail } from "./parseApplicationMail";

// 実際の通知メールの形式に合わせたダミーデータ（個人情報ではない）
const webForm = (over: { subject: string; kibo: string; lines?: string; webId?: string; grade?: string; stage?: string; rel?: string }) => ({
  subject: over.subject,
  body: `Date = 2026/10/28
Time = 12:53:48
部署 = 東進ハイスクール
希望内容 = ${over.kibo}
希望校舎 = 東進ハイスクール春日部校
氏 = 山田
名 = 太郎
氏(カナ) = ヤマダ
名(カナ) = タロウ
性別 = 男性
生年月日 = 2011/06/26
卒年 = 2030
メールアドレス = taro@example.com
郵便番号 = 〒278-0032
都道府県 = 千葉県
住所 = 野田市桜台１６４－５
電話番号 = 090-0000-0001
携帯電話番号 = 090-0000-0002
学校名 = 東部中学校
学校段階 = ${over.stage ?? "中学校"}
学年 = ${over.grade ?? "3 年"}
ご記入者と生徒の関係 = ${over.rel ?? "母"}
HP 来訪理由 = インターネットメールやメールマガジン
フリースペース = (メールマガジンの配信=希望しない)
(ご記入者と生徒の関係=母)
(webID=${over.webId ?? "event_shotai_hs__20261028_125327___5826___efo_"})
(文理=未定)
(志望校=まだ決まっていない)
(連絡事項)
${over.lines ?? ""}
メール送信型 = ハイスクール`,
});

describe("parseApplicationMail (Web申込フォーム)", () => {
  it("冬期特別招待講習を読み取る。中学生は中3、携帯番号を優先、本人以外は保護者", () => {
    const r = parseApplicationMail(webForm({ subject: "[登録] 東進ハイスクール お申込み(冬期特別招待講習) 春日部校", kibo: "お申込み(冬期特別招待講習)" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({
      rawType: "special_invite", eventLabel: "冬期特別招待講習", name: "山田 太郎", nameKana: "ヤマダ タロウ",
      grade: "中3", phone: "090-0000-0002", relation: "parent", school: "東部中学校", email: "taro@example.com",
      sourceKey: "web:event_shotai_hs__20261028_125327___5826___efo_", submittedAt: "2026-10-28T12:53:48+09:00",
    });
    expect(r.data.missing).toEqual([]);
    expect(r.data.comment).toContain("来訪理由: インターネットメールやメールマガジン"); // キー名の空白差を吸収
  });
  it("招待状請求(夏期)・新年度も特別招待講習として扱う", () => {
    const a = parseApplicationMail(webForm({ subject: "[登録] 東進ハイスクール 招待状請求(夏期特別招待講習) 春日部校", kibo: "招待状請求(夏期特別招待講習)" }));
    expect(a.ok && a.data.rawType).toBe("special_invite");
    const b = parseApplicationMail(webForm({ subject: "[登録] 東進ハイスクール お申込み(新年度特別招待講習) 春日部校", kibo: "お申込み(新年度特別招待講習)" }));
    expect(b.ok && b.data.rawType).toBe("special_invite");
  });
  it("特別公開授業・資料請求・個別説明会・高校対応別指導コースを判別する", () => {
    const t = (subject: string, kibo: string) => {
      const r = parseApplicationMail(webForm({ subject, kibo }));
      return r.ok ? r.data.rawType : "ERR";
    };
    expect(t("[登録] 東進ハイスクール お申込み(特別公開授業) 春日部校", "お申込み(特別公開授業)")).toBe("open_class");
    expect(t("[登録] 東進ハイスクール 資料請求 春日部校", "資料請求")).toBe("document_request");
    expect(t("[登録] 東進ハイスクール お申込み(個別説明会) 春日部校", "お申込み(個別説明会)")).toBe("briefing");
    expect(t("[登録] 東進ハイスクール お申込み(高校対応別指導コース個別説明会) 春日部校", "お申込み(高校対応別指導コース個別説明会)")).toBe("school_course_briefing");
  });
  it("「新3年(現2年)」は現在の学年(高2)として扱い、連絡事項と希望資料をコメントに残す", () => {
    const r = parseApplicationMail(webForm({
      subject: "[登録] 東進ハイスクール お申込み(特別公開授業) 春日部校", kibo: "お申込み(特別公開授業)",
      grade: "新 3 年(現２年)", stage: "高等学校", rel: "本人", lines: "7/16(木)19:30 春日部校 高3・高2",
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.grade).toBe("高2");
    expect(r.data.relation).toBe("self");
    expect(r.data.comment).toContain("連絡事項: 7/16(木)19:30 春日部校 高3・高2");
  });
  it("webID が無いメールは取り込まない（確認待ち）", () => {
    const r = parseApplicationMail({ subject: "[登録] 東進ハイスクール 資料請求", body: "氏 = 山田" });
    expect(r.ok).toBe(false);
  });
  it("webID にハイフンなどが含まれても途中で切れず、別の申込が同じIDにならない", () => {
    const a = parseApplicationMail(webForm({ subject: "[登録] 東進ハイスクール 資料請求 春日部校", kibo: "資料請求", webId: "shiryo-hs_1-a" }));
    const b = parseApplicationMail(webForm({ subject: "[登録] 東進ハイスクール 資料請求 春日部校", kibo: "資料請求", webId: "shiryo-hs_1-b" }));
    expect(a.ok && b.ok && a.data.sourceKey).toBe("web:shiryo-hs_1-a");
    expect(a.ok && b.ok && b.data.sourceKey).toBe("web:shiryo-hs_1-b");
  });
  it("項目が欠けても推測で埋めず missing に出す", () => {
    const r = parseApplicationMail({ subject: "[登録] 東進ハイスクール 資料請求 春日部校", body: "氏 = 山田\n名 = 花子\n希望内容 = 資料請求\n(webID=shiryo_hs__1)" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.missing).toEqual(expect.arrayContaining(["学校", "学年", "メール", "電話"]));
    expect(r.data.grade).toBe("");
  });
});

describe("parseApplicationMail (受験登録完了)", () => {
  const exam = (subject: string, heading: string) => ({
    subject,
    body: `${heading}

大塚 奏空 様

受験番号 :84502266
受験会場 : 0028:春日部校
氏名 : 大塚 奏空
フリガナ : オオツカ ソラ
生年月日 : 2011/3/25
性別 : 男性
試験科目 : 英語(リスニング)・英語(リーディング)・数学・国語
高校名 : 越谷北高等学校
学年 : 高1
郵便番号 : 344-0116
住所 : 埼玉県 春日部市 大衾 344－0116
携帯電話番号 : 070-0000-0003
メールアドレス : taro2@example.com
在籍区分 : 一般生`,
  });
  it("全国統一高校生テストを読み取る（受験番号が重複防止キー）", () => {
    const r = parseApplicationMail(exam("全国統一高校生テスト(高1生部門) 登録完了のお知らせ", "★11 月 1 日(日)全国統一高校生テスト(高１生部門)お申込み完了メール"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ rawType: "national_test", name: "大塚 奏空", grade: "高1", phone: "070-0000-0003", school: "越谷北高等学校", email: "taro2@example.com" });
    expect(r.data.sourceKey).toBe("exam:84502266:national_test:全国統一高校生テスト(高1生部門)");
    expect(r.data.missing).toEqual([]);
  });
  it("共通テスト体験受験を判別する", () => {
    const r = parseApplicationMail(exam("共通テスト体験受験登録完了のお知らせ", "★1月18日(日)、1月19日(月)共通テスト体験受験お申込み完了メール"));
    expect(r.ok && r.data.rawType).toBe("common_test_trial");
  });
});
