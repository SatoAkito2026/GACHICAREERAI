/**
 * 営業ロープレの資料：ブラウザでファイルから文字を取り出す（サーバーには文字だけを送る）
 * 対応：PDF・Word（.docx）・テキスト（.txt .md .csv）と、それらをまとめた ZIP
 * テキストは UTF-8 で読めなければ Shift_JIS（Windows のメモ帳・Excel の CSV）として読む
 */
import { unzipSync } from "fflate";
import { extractPdfText } from "@/lib/pdf-text";

export type MaterialText = { name: string; text: string };

const TEXT_EXT = ["txt", "md", "csv", "tsv"];
export const MATERIAL_ACCEPT =
  ".pdf,.docx,.txt,.md,.csv,.tsv,.zip,application/pdf,application/zip,text/plain";

function ext(name: string): string {
  return name.toLowerCase().split(".").pop() ?? "";
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("shift_jis").decode(bytes);
  }
}

/** Word（.docx）の本文：中の word/document.xml から段落ごとに文字を取る */
function docxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) return "";
  return new TextDecoder()
    .decode(xml)
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>|<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Windows で作った ZIP は名前が Shift_JIS のことがあるので、読み直す */
function fixZipName(name: string): string {
  const codes = Array.from(name, (c) => c.charCodeAt(0));
  // 全部 1 バイトの文字で、0x80 以上が含まれるときだけ（UTF-8 で読めている名前はそのまま）
  if (!codes.some((c) => c >= 0x80) || codes.some((c) => c > 0xff)) return name;
  try {
    const bytes = Uint8Array.from(codes);
    return decodeText(bytes);
  } catch {
    return name;
  }
}

async function fromBytes(name: string, bytes: Uint8Array): Promise<string> {
  const e = ext(name);
  if (e === "pdf")
    return extractPdfText(new File([new Uint8Array(bytes)], name, { type: "application/pdf" }));
  if (e === "docx") return docxText(bytes);
  if (TEXT_EXT.includes(e)) return decodeText(bytes);
  return "";
}

/** 選ばれたファイルから資料の文字を取り出す。ZIP は中のファイルごとに1件ずつ */
export async function readMaterialFile(file: File): Promise<MaterialText[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (ext(file.name) !== "zip") {
    const text = (await fromBytes(file.name, bytes)).trim();
    return text ? [{ name: file.name, text }] : [];
  }
  const entries = unzipSync(bytes, {
    // フォルダ・Mac の隠しファイル・対応していない種類は飛ばす
    filter: (f) =>
      !f.name.endsWith("/") &&
      !f.name.startsWith("__MACOSX/") &&
      !f.name.split("/").pop()!.startsWith(".") &&
      ["pdf", "docx", ...TEXT_EXT].includes(ext(f.name)),
  });
  const out: MaterialText[] = [];
  for (const [rawName, data] of Object.entries(entries)) {
    const name = fixZipName(rawName).split("/").pop() ?? rawName;
    try {
      const text = (await fromBytes(name, data)).trim();
      if (text) out.push({ name, text });
    } catch {
      // 読めないファイルは飛ばす
    }
  }
  return out;
}
