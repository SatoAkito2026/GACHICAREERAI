/**
 * 生成した書類をPDFとして書き出すためのテンプレート。
 * - 履歴書(resume): 実際に提出できる表形式のレイアウト
 * - それ以外: タイトル+本文の整形されたプロ文書レイアウト
 *
 * html2canvas + jsPDF で、白背景・印刷向けのスタイルでキャプチャする
 * (company側の書類選考AI結果PDF出力と同じライブラリ・方式)。
 */

type Education = { school_name: string; degree: string; status: string };
type Certification = { name: string; acquired_on: string };
type WorkHistory = { company_name: string; position: string; period: string; description: string };
type BasicInfo = {
  name?: string;
  furigana?: string;
  birthdate?: string;
  phone?: string;
  postal_code?: string;
  address?: string;
  current_status?: string;
  school_name?: string;
  grade?: string;
};

export const PAGE_STYLE: React.CSSProperties = {
  width: 794, // A4 @96dpi相当
  minHeight: 1123,
  background: "#FFFFFF",
  color: "#111111",
  padding: 48,
  fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
  boxSizing: "border-box",
};

export const CELL: React.CSSProperties = {
  border: "1px solid #333333",
  padding: "8px 10px",
  fontSize: 12,
  verticalAlign: "top",
};
export const TH: React.CSSProperties = {
  ...CELL,
  background: "#F0F0F0",
  fontWeight: 700,
  width: 110,
};

const EDITABLE_BOX: React.CSSProperties = {
  display: "block",
  width: "100%",
  border: "1px dashed #9AB",
  outline: "none",
  background: "#FFFDF0",
  fontFamily: "inherit",
  color: "#111111",
  resize: "vertical",
  padding: "6px 8px",
  borderRadius: 4,
  cursor: "text",
};

export function ResumeTemplate({
  basicInfo,
  education,
  workHistory,
  certifications,
  selfPr,
}: {
  basicInfo: BasicInfo;
  education: Education[];
  workHistory: WorkHistory[];
  certifications: Certification[];
  selfPr: string;
}) {
  return (
    <div style={PAGE_STYLE}>
      <h1
        style={{
          textAlign: "center",
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 24,
          letterSpacing: 4,
        }}
      >
        履歴書
      </h1>
      <p style={{ textAlign: "right", fontSize: 12, marginBottom: 12 }}>
        {new Date().toLocaleDateString("ja-JP")} 現在
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
        <tbody>
          <tr>
            <td style={TH}>氏名</td>
            <td style={{ ...CELL, width: "70%" }}>
              <div style={{ fontSize: 11, color: "#666" }}>{basicInfo.furigana}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{basicInfo.name}</div>
            </td>
          </tr>
          <tr>
            <td style={TH}>生年月日</td>
            <td style={CELL}>{basicInfo.birthdate || "―"}</td>
          </tr>
          <tr>
            <td style={TH}>現住所</td>
            <td style={CELL}>
              {basicInfo.postal_code ? `〒${basicInfo.postal_code} ` : ""}
              {basicInfo.address || "―"}
            </td>
          </tr>
          <tr>
            <td style={TH}>電話番号</td>
            <td style={CELL}>{basicInfo.phone || "―"}</td>
          </tr>
          {basicInfo.school_name && (
            <tr>
              <td style={TH}>現在の学校</td>
              <td style={CELL}>
                {basicInfo.grade ? `${basicInfo.grade} / ` : ""}
                {basicInfo.school_name}
              </td>
            </tr>
          )}
          {basicInfo.current_status && (
            <tr>
              <td style={TH}>現在の状況</td>
              <td style={CELL}>{basicInfo.current_status}</td>
            </tr>
          )}
        </tbody>
      </table>

      <h2
        style={{
          fontSize: 14,
          fontWeight: 700,
          borderBottom: "2px solid #333",
          paddingBottom: 4,
          marginBottom: 8,
        }}
      >
        学歴
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
        <thead>
          <tr>
            <th style={{ ...CELL, background: "#F0F0F0", width: 60 }}>年</th>
            <th style={{ ...CELL, background: "#F0F0F0", width: 40 }}>月</th>
            <th style={{ ...CELL, background: "#F0F0F0" }}>学校名・学部</th>
            <th style={{ ...CELL, background: "#F0F0F0", width: 80 }}>状況</th>
          </tr>
        </thead>
        <tbody>
          {education.length === 0 ? (
            <tr>
              <td style={CELL} colSpan={4}>
                ―
              </td>
            </tr>
          ) : (
            education.map((ed, i) => (
              <tr key={i}>
                <td style={CELL}>―</td>
                <td style={CELL}>―</td>
                <td style={CELL}>
                  {ed.school_name}
                  {ed.degree ? ` ${ed.degree}` : ""}
                </td>
                <td style={CELL}>{ed.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {workHistory.length > 0 && (
        <>
          <h2
            style={{
              fontSize: 14,
              fontWeight: 700,
              borderBottom: "2px solid #333",
              paddingBottom: 4,
              marginBottom: 8,
            }}
          >
            職歴
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
            <tbody>
              {workHistory.map((w, i) => (
                <tr key={i}>
                  <td style={{ ...CELL, width: "30%" }}>
                    <div style={{ fontWeight: 700 }}>{w.company_name}</div>
                    <div style={{ fontSize: 11, color: "#666" }}>{w.period}</div>
                  </td>
                  <td style={CELL}>
                    <div>{w.position}</div>
                    {w.description && (
                      <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>
                        {w.description}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2
        style={{
          fontSize: 14,
          fontWeight: 700,
          borderBottom: "2px solid #333",
          paddingBottom: 4,
          marginBottom: 8,
        }}
      >
        資格・免許
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
        <tbody>
          {certifications.length === 0 ? (
            <tr>
              <td style={CELL}>―</td>
            </tr>
          ) : (
            certifications.map((c, i) => (
              <tr key={i}>
                <td style={{ ...CELL, width: 140 }}>{c.acquired_on || "―"}</td>
                <td style={CELL}>{c.name}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h2
        style={{
          fontSize: 14,
          fontWeight: 700,
          borderBottom: "2px solid #333",
          paddingBottom: 4,
          marginBottom: 8,
        }}
      >
        自己PR
      </h2>
      <p style={{ fontSize: 12, lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{selfPr}</p>
    </div>
  );
}

/** 太字(**text**)だけをインラインで処理する */
function renderInline(text: string, keyPrefix: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

/**
 * AIが返す簡易Markdown(見出し・太字・表・箇条書き・区切り線・コードブロック)を
 * 印刷向けのReact要素に変換する。外部ライブラリを増やさず自前でパースする
 * (見出しや表がそのまま「##」「**」等の記号で表示されてしまう問題への対応)。
 */
function renderMarkdown(markdown: string): React.ReactNode[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    // コードブロック ```
    if (line.trim().startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // 閉じの```をスキップ
      nodes.push(
        <pre
          key={key++}
          style={{
            background: "#F3F3F3",
            padding: "10px 14px",
            borderRadius: 4,
            fontSize: 11,
            whiteSpace: "pre-wrap",
            margin: "10px 0",
          }}
        >
          {codeLines.join("\n")}
        </pre>,
      );
      continue;
    }

    // 見出し
    const headingMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const sizeMap: Record<number, number> = { 1: 18, 2: 15, 3: 13, 4: 12 };
      nodes.push(
        <p
          key={key++}
          style={{
            fontWeight: 700,
            fontSize: sizeMap[level] ?? 12,
            marginTop: level <= 2 ? 18 : 12,
            marginBottom: 8,
            borderBottom: level <= 2 ? "1px solid #333" : "none",
            paddingBottom: level <= 2 ? 4 : 0,
          }}
        >
          {renderInline(headingMatch[2], `h-${key}`)}
        </p>,
      );
      i++;
      continue;
    }

    // 区切り線
    if (/^-{3,}$/.test(line.trim())) {
      nodes.push(
        <hr
          key={key++}
          style={{ border: "none", borderTop: "1px solid #CCCCCC", margin: "14px 0" }}
        />,
      );
      i++;
      continue;
    }

    // 表 (| a | b | の次の行が |---|---| のとき)
    if (line.trim().startsWith("|") && lines[i + 1]?.trim().match(/^\|?[\s:|-]+\|?$/)) {
      const headerCells = line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim());
      const bodyRows: string[][] = [];
      i += 2; // ヘッダ行と区切り行をスキップ
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i]
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
        bodyRows.push(cells);
        i++;
      }
      nodes.push(
        <table
          key={key++}
          style={{ width: "100%", borderCollapse: "collapse", margin: "10px 0", fontSize: 11 }}
        >
          <thead>
            <tr>
              {headerCells.map((c, ci) => (
                <th
                  key={ci}
                  style={{
                    border: "1px solid #999",
                    background: "#F0F0F0",
                    padding: "5px 8px",
                    textAlign: "left",
                  }}
                >
                  {renderInline(c, `th-${key}-${ci}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row, ri) => (
              <tr key={ri}>
                {row.map((c, ci) => (
                  <td key={ci} style={{ border: "1px solid #999", padding: "5px 8px" }}>
                    {renderInline(c, `td-${key}-${ri}-${ci}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }

    // 箇条書き
    if (/^[-*]\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      nodes.push(
        <ul key={key++} style={{ margin: "6px 0", paddingLeft: 20 }}>
          {items.map((it, ii) => (
            <li key={ii} style={{ fontSize: 12, lineHeight: 1.8 }}>
              {renderInline(it, `li-${key}-${ii}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // 引用(> )
    if (line.trim().startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith(">") || lines[i].trim() === "")) {
        if (lines[i].trim() === "") {
          i++;
          continue;
        }
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      nodes.push(
        <div
          key={key++}
          style={{ borderLeft: "3px solid #999", paddingLeft: 12, margin: "10px 0", color: "#333" }}
        >
          {quoteLines.map((q, qi) => (
            <p key={qi} style={{ fontSize: 12, lineHeight: 1.8, margin: "2px 0" }}>
              {renderInline(q, `q-${key}-${qi}`)}
            </p>
          ))}
        </div>,
      );
      continue;
    }

    // 通常の段落
    nodes.push(
      <p key={key++} style={{ fontSize: 12, lineHeight: 1.9, margin: "6px 0" }}>
        {renderInline(line, `p-${key}`)}
      </p>,
    );
    i++;
  }

  return nodes;
}

// ============================================================
// 履歴書(フル版) — もらったテンプレートの構成を再現
// ============================================================
type ResumeRow = { year: string; month: string; content: string };
type FullResumeData = {
  basicInfo: BasicInfo;
  gender?: string;
  email?: string;
  contactFurigana?: string;
  contactPostalCode?: string;
  contactAddress?: string;
  contactPhone?: string;
  contactEmail?: string;
  education: ResumeRow[];
  workHistory: ResumeRow[];
  qualifications: ResumeRow[];
  motivationSelfPr: string;
  requestColumn?: string;
};

export function FullResumeTemplate({ data }: { data: FullResumeData }) {
  const {
    basicInfo,
    gender,
    email,
    contactFurigana,
    contactPostalCode,
    contactAddress,
    contactPhone,
    contactEmail,
    education,
    workHistory,
    qualifications,
    motivationSelfPr,
    requestColumn,
  } = data;
  return (
    <div style={PAGE_STYLE}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
        }}
      >
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: 6 }}>履歴書</h1>
        <p style={{ fontSize: 11, marginTop: 8 }}>{new Date().toLocaleDateString("ja-JP")} 現在</p>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 0 }}>
        <tbody>
          <tr>
            <td style={{ ...CELL, width: "70%" }} rowSpan={3}>
              <div style={{ fontSize: 10, color: "#666" }}>ふりがな　{basicInfo.furigana}</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>
                {basicInfo.name || "―"}
              </div>
            </td>
            <td
              style={{ ...CELL, width: "30%", textAlign: "center", verticalAlign: "middle" }}
              rowSpan={3}
            >
              <div
                style={{
                  border: "1px dashed #999",
                  width: 106,
                  height: 144,
                  margin: "0 auto",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 8,
                  color: "#999",
                  textAlign: "center",
                  lineHeight: 1.5,
                }}
              >
                写真を貼る位置
                <br />
                縦36〜40mm
                <br />
                横24〜30mm
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <tbody>
          <tr>
            <td style={TH}>生年月日</td>
            <td style={CELL} colSpan={3}>
              {basicInfo.birthdate || "―"}（満 　歳）　性別：{gender || "―"}
            </td>
          </tr>
          <tr>
            <td style={TH}>現住所</td>
            <td style={{ ...CELL }} colSpan={3}>
              {basicInfo.postal_code ? `〒${basicInfo.postal_code} ` : ""}
              {basicInfo.address || "―"}
            </td>
          </tr>
          <tr>
            <td style={TH}>電話</td>
            <td style={CELL}>{basicInfo.phone || "―"}</td>
            <td style={TH}>E-mail</td>
            <td style={CELL}>{email || "―"}</td>
          </tr>
          <tr>
            <td style={TH}>※連絡先</td>
            <td style={{ ...CELL }} colSpan={3}>
              {contactPostalCode ? `〒${contactPostalCode} ` : ""}
              {contactAddress || "（現住所以外に連絡を希望する場合のみ記入）"}
            </td>
          </tr>
          {(contactPhone || contactEmail) && (
            <tr>
              <td style={TH}>電話</td>
              <td style={CELL}>{contactPhone || "―"}</td>
              <td style={TH}>E-mail</td>
              <td style={CELL}>{contactEmail || "―"}</td>
            </tr>
          )}
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead>
          <tr>
            <td style={{ ...TH, width: 50, textAlign: "center" }}>年</td>
            <td style={{ ...TH, width: 40, textAlign: "center" }}>月</td>
            <td style={{ ...TH, width: "auto", textAlign: "center" }}>
              学歴・職歴（各別にまとめて書く）
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={CELL}></td>
            <td style={CELL}></td>
            <td style={{ ...CELL, textAlign: "center", fontWeight: 700 }}>学歴</td>
          </tr>
          {education.length === 0 ? (
            <tr>
              <td style={CELL}></td>
              <td style={CELL}></td>
              <td style={CELL}>―</td>
            </tr>
          ) : (
            education.map((row, i) => (
              <tr key={i}>
                <td style={{ ...CELL, textAlign: "center" }}>{row.year}</td>
                <td style={{ ...CELL, textAlign: "center" }}>{row.month}</td>
                <td style={CELL}>{row.content}</td>
              </tr>
            ))
          )}
          <tr>
            <td style={CELL}></td>
            <td style={CELL}></td>
            <td style={{ ...CELL, textAlign: "center", fontWeight: 700 }}>職歴</td>
          </tr>
          {workHistory.length === 0 ? (
            <tr>
              <td style={CELL}></td>
              <td style={CELL}></td>
              <td style={CELL}>―</td>
            </tr>
          ) : (
            workHistory.map((row, i) => (
              <tr key={i}>
                <td style={{ ...CELL, textAlign: "center" }}>{row.year}</td>
                <td style={{ ...CELL, textAlign: "center" }}>{row.month}</td>
                <td style={CELL}>{row.content}</td>
              </tr>
            ))
          )}
          <tr>
            <td style={CELL}></td>
            <td style={CELL}></td>
            <td style={CELL}>現在に至る</td>
          </tr>
          <tr>
            <td style={CELL}></td>
            <td style={CELL}></td>
            <td style={{ ...CELL, textAlign: "right", fontWeight: 700 }}>以上</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead>
          <tr>
            <td style={{ ...TH, width: 50, textAlign: "center" }}>年</td>
            <td style={{ ...TH, width: 40, textAlign: "center" }}>月</td>
            <td style={{ ...TH, width: "auto", textAlign: "center" }}>資格・免許</td>
          </tr>
        </thead>
        <tbody>
          {qualifications.length === 0 ? (
            <tr>
              <td style={CELL}></td>
              <td style={CELL}></td>
              <td style={CELL}>―</td>
            </tr>
          ) : (
            qualifications.map((row, i) => (
              <tr key={i}>
                <td style={{ ...CELL, textAlign: "center" }}>{row.year}</td>
                <td style={{ ...CELL, textAlign: "center" }}>{row.month}</td>
                <td style={CELL}>{row.content}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div style={{ border: "1px solid #333", padding: 10, marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, textAlign: "center" }}>
          志望の動機、自己PRなど
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.8, whiteSpace: "pre-wrap", minHeight: 90 }}>
          {motivationSelfPr || "―"}
        </p>
      </div>

      <div style={{ border: "1px solid #333", padding: 10 }}>
        <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
          本人希望記入欄（特に給料・職種・勤務時間・勤務地・その他についての希望などがあれば記入）
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.8, whiteSpace: "pre-wrap", minHeight: 50 }}>
          {requestColumn || "特にありません"}
        </p>
      </div>
    </div>
  );
}

// ============================================================
// 職務経歴書(フル版) — もらったテンプレートの構成を再現
// ============================================================
type CareerHistoryBlock = {
  period: string;
  company_name: string;
  industry: string;
  employment_type: string;
  employee_count: string;
  duties: string;
};
type WorkHistoryFullData = {
  name: string;
  careerBlocks: CareerHistoryBlock[];
  selfPr: string;
  usableExperience: string;
  qualifications: string;
  pcSkills: string;
  languageSkills: string;
};

export function WorkHistoryFullTemplate({ data }: { data: WorkHistoryFullData }) {
  return (
    <div style={PAGE_STYLE}>
      <h1
        style={{
          textAlign: "center",
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: 6,
          marginBottom: 20,
        }}
      >
        職務経歴書
      </h1>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <p style={{ fontSize: 24, fontWeight: 700 }}>氏名：{data.name || "―"}</p>
        <p style={{ fontSize: 12 }}>{new Date().toLocaleDateString("ja-JP")}</p>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
        <thead>
          <tr>
            <td style={{ ...TH, width: "auto", textAlign: "left" }}>職務経歴</td>
          </tr>
        </thead>
      </table>
      {data.careerBlocks.length === 0 ? (
        <p style={{ fontSize: 12, color: "#999" }}>―</p>
      ) : (
        data.careerBlocks.map((b, i) => (
          <table key={i} style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
            <tbody>
              <tr>
                <td style={{ ...CELL, width: "45%" }}>期間：{b.period}</td>
                <td style={CELL}>会社名：{b.company_name}</td>
              </tr>
              <tr>
                <td style={CELL}>業種：{b.industry}</td>
                <td style={CELL}>
                  雇用形態：{b.employment_type}　従業員数：{b.employee_count}
                </td>
              </tr>
              <tr>
                <td style={{ ...CELL }} colSpan={2}>
                  <p style={{ fontWeight: 700, marginBottom: 4 }}>【担当業務】</p>
                  <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{b.duties}</p>
                </td>
              </tr>
            </tbody>
          </table>
        ))
      )}

      <div style={{ marginTop: 20 }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            borderBottom: "1px solid #333",
            paddingBottom: 4,
            marginBottom: 8,
          }}
        >
          自己PR
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.8, whiteSpace: "pre-wrap", marginBottom: 16 }}>
          {data.selfPr || "―"}
        </p>

        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            borderBottom: "1px solid #333",
            paddingBottom: 4,
            marginBottom: 8,
          }}
        >
          活かせる経験・知識・技術
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.8, whiteSpace: "pre-wrap", marginBottom: 16 }}>
          {data.usableExperience || "―"}
        </p>

        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            borderBottom: "1px solid #333",
            paddingBottom: 4,
            marginBottom: 8,
          }}
        >
          資格・語学力
        </p>
        <p style={{ fontSize: 11, marginBottom: 4 }}>《資格》{data.qualifications || "―"}</p>
        <p style={{ fontSize: 11, marginBottom: 4 }}>《PCスキル》{data.pcSkills || "―"}</p>
        <p style={{ fontSize: 11 }}>《語学力》{data.languageSkills || "―"}</p>
      </div>
    </div>
  );
}

// ============================================================
// エントリーシート — もらったテンプレートの構成を再現
// ============================================================
type EntrySheetData = {
  name: string;
  furigana: string;
  schoolName: string;
  faculty: string;
  department: string;
  motivation: string;
  strengths: string;
  qualifications: string;
  hobbies: string;
  interviewNumber?: string;
};

export function EntrySheetTemplate({ data }: { data: EntrySheetData }) {
  return (
    <div style={PAGE_STYLE}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>
          新卒採用エントリーシート
        </h1>
        <div style={{ border: "1px solid #333", padding: "4px 10px", fontSize: 10, width: 140 }}>
          面接番号
          <br />
          {data.interviewNumber || ""}
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 10, color: "#666" }}>ふりがな</p>
          <p
            style={{
              fontSize: 15,
              fontWeight: 700,
              borderBottom: "1px solid #333",
              paddingBottom: 6,
              marginBottom: 10,
            }}
          >
            {data.name || "―"}
          </p>
          <p style={{ fontSize: 12, color: "#666" }}>学校名</p>
          <p
            style={{
              fontSize: 13,
              borderBottom: "1px solid #333",
              paddingBottom: 6,
              marginBottom: 10,
            }}
          >
            {data.schoolName || "―"}
          </p>
          <p style={{ fontSize: 12, color: "#666" }}>学部</p>
          <p
            style={{
              fontSize: 13,
              borderBottom: "1px solid #333",
              paddingBottom: 6,
              marginBottom: 10,
            }}
          >
            {data.faculty || "―"}
          </p>
          <p style={{ fontSize: 12, color: "#666" }}>学科</p>
          <p style={{ fontSize: 13, borderBottom: "1px solid #333", paddingBottom: 6 }}>
            {data.department || "―"}
          </p>
        </div>
        <div
          style={{
            width: 120,
            height: 150,
            border: "1px solid #ccc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            color: "#999",
          }}
        >
          写真
        </div>
      </div>

      <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>志望動機</p>
      <div style={{ border: "1px solid #333", padding: 10, minHeight: 140, marginBottom: 20 }}>
        <p style={{ fontSize: 12, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
          {data.motivation || "―"}
        </p>
      </div>

      <div style={{ display: "flex", gap: 20 }}>
        <div style={{ flex: 1.2 }}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>強み／特技</p>
          <div style={{ border: "1px solid #333", padding: 10, minHeight: 110 }}>
            <p style={{ fontSize: 12, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
              {data.strengths || "―"}
            </p>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>所有資格</p>
          <p style={{ fontSize: 12, marginBottom: 16, whiteSpace: "pre-wrap" }}>
            {data.qualifications || "―"}
          </p>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>趣味／部活</p>
          <p style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{data.hobbies || "―"}</p>
        </div>
      </div>
    </div>
  );
}

/** 自分専用テンプレート(項目構成が人によって違う)向けの、シンプルな項目一覧レイアウト */
export function GenericFieldsTemplate({
  title,
  fields,
  values,
}: {
  title: string;
  fields: { key: string; label: string }[];
  values: Record<string, string>;
}) {
  return (
    <div style={PAGE_STYLE}>
      <h1 style={{ textAlign: "center", fontSize: 20, fontWeight: 700, marginBottom: 24 }}>
        {title}
      </h1>
      {fields.map((f) => (
        <div key={f.key} style={{ marginBottom: 18 }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              borderBottom: "1px solid #333",
              paddingBottom: 4,
              marginBottom: 8,
            }}
          >
            {f.label}
          </p>
          <p style={{ fontSize: 12, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
            {values[f.key] || "―"}
          </p>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// 編集可能版(完成画面用) — 見た目はPDF出力と同じまま、その場で書き換えられる
// ============================================================
export function EditableWorkHistoryTemplate({
  name,
  careerBlocks,
  onCareerBlocksChange,
  values,
  onChange,
}: {
  name: string;
  careerBlocks: {
    period: string;
    company_name: string;
    industry: string;
    employment_type: string;
    employee_count: string;
    duties: string;
  }[];
  onCareerBlocksChange: (
    blocks: {
      period: string;
      company_name: string;
      industry: string;
      employment_type: string;
      employee_count: string;
      duties: string;
    }[],
  ) => void;
  values: {
    selfPr: string;
    usableExperience: string;
    qualifications: string;
    pcSkills: string;
    languageSkills: string;
  };
  onChange: (key: keyof typeof values, value: string) => void;
}) {
  const smallInput: React.CSSProperties = {
    ...EDITABLE_BOX,
    fontSize: 12,
    padding: "3px 6px",
    marginBottom: 0,
    display: "inline-block",
    width: "auto",
    minWidth: 80,
  };
  const updateBlock = (i: number, key: string, value: string) => {
    const next = [...careerBlocks];
    next[i] = { ...next[i], [key]: value };
    onCareerBlocksChange(next);
  };

  return (
    <div style={PAGE_STYLE}>
      <h1
        style={{
          textAlign: "center",
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: 6,
          marginBottom: 20,
        }}
      >
        職務経歴書
      </h1>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <p style={{ fontSize: 24, fontWeight: 700 }}>氏名：{name || "―"}</p>
        <p style={{ fontSize: 12 }}>{new Date().toLocaleDateString("ja-JP")}</p>
      </div>
      <div
        style={{
          background: "#F5F5F5",
          border: "1px solid #ccc",
          borderRadius: 6,
          padding: "6px 10px",
          marginBottom: 16,
          fontSize: 10,
          color: "#666",
        }}
      >
        ※氏名はプロフィール画面で編集してください
      </div>

      {careerBlocks.map((b, i) => (
        <table key={i} style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
          <tbody>
            <tr>
              <td style={{ ...CELL, width: "45%" }}>
                期間：
                <input
                  style={smallInput}
                  value={b.period}
                  onChange={(e) => updateBlock(i, "period", e.target.value)}
                  placeholder="例: 2020年4月〜2023年3月"
                />
              </td>
              <td style={CELL}>
                会社名：
                <input
                  style={smallInput}
                  value={b.company_name}
                  onChange={(e) => updateBlock(i, "company_name", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => onCareerBlocksChange(careerBlocks.filter((_, j) => j !== i))}
                  style={{
                    color: "#C33",
                    fontSize: 11,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    float: "right",
                  }}
                >
                  ×削除
                </button>
              </td>
            </tr>
            <tr>
              <td style={CELL}>
                業種：
                <input
                  style={smallInput}
                  value={b.industry}
                  onChange={(e) => updateBlock(i, "industry", e.target.value)}
                />
              </td>
              <td style={CELL}>
                雇用形態：
                <input
                  style={smallInput}
                  value={b.employment_type}
                  onChange={(e) => updateBlock(i, "employment_type", e.target.value)}
                />
                　従業員数：
                <input
                  style={smallInput}
                  value={b.employee_count}
                  onChange={(e) => updateBlock(i, "employee_count", e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td style={{ ...CELL }} colSpan={2}>
                <p style={{ fontWeight: 700, marginBottom: 4 }}>【担当業務】</p>
                <textarea
                  value={b.duties}
                  onChange={(e) => updateBlock(i, "duties", e.target.value)}
                  style={{ ...EDITABLE_BOX, fontSize: 12, lineHeight: 1.8, minHeight: 90 }}
                />
              </td>
            </tr>
          </tbody>
        </table>
      ))}
      <button
        type="button"
        onClick={() =>
          onCareerBlocksChange([
            ...careerBlocks,
            {
              period: "",
              company_name: "",
              industry: "",
              employment_type: "",
              employee_count: "",
              duties: "",
            },
          ])
        }
        style={{
          color: "#3673C8",
          fontSize: 12,
          border: "1px dashed #3673C8",
          background: "none",
          borderRadius: 4,
          padding: "4px 12px",
          cursor: "pointer",
          marginBottom: 16,
        }}
      >
        ＋職歴を追加
      </button>

      <div style={{ marginTop: 20 }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            borderBottom: "1px solid #333",
            paddingBottom: 4,
            marginBottom: 8,
          }}
        >
          自己PR
        </p>
        <textarea
          value={values.selfPr}
          onChange={(e) => onChange("selfPr", e.target.value)}
          style={{
            ...EDITABLE_BOX,
            fontSize: 12,
            lineHeight: 1.8,
            minHeight: 90,
            marginBottom: 16,
          }}
        />

        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            borderBottom: "1px solid #333",
            paddingBottom: 4,
            marginBottom: 8,
          }}
        >
          活かせる経験・知識・技術
        </p>
        <textarea
          value={values.usableExperience}
          onChange={(e) => onChange("usableExperience", e.target.value)}
          style={{
            ...EDITABLE_BOX,
            fontSize: 12,
            lineHeight: 1.8,
            minHeight: 70,
            marginBottom: 16,
          }}
        />

        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            borderBottom: "1px solid #333",
            paddingBottom: 4,
            marginBottom: 8,
          }}
        >
          資格・語学力
        </p>
        <p style={{ fontSize: 11, marginBottom: 4 }}>《資格》</p>
        <textarea
          value={values.qualifications}
          onChange={(e) => onChange("qualifications", e.target.value)}
          style={{ ...EDITABLE_BOX, fontSize: 11, minHeight: 34, marginBottom: 8 }}
        />
        <p style={{ fontSize: 11, marginBottom: 4 }}>《PCスキル》</p>
        <textarea
          value={values.pcSkills}
          onChange={(e) => onChange("pcSkills", e.target.value)}
          style={{ ...EDITABLE_BOX, fontSize: 11, minHeight: 34, marginBottom: 8 }}
        />
        <p style={{ fontSize: 11, marginBottom: 4 }}>《語学力》</p>
        <textarea
          value={values.languageSkills}
          onChange={(e) => onChange("languageSkills", e.target.value)}
          style={{ ...EDITABLE_BOX, fontSize: 11, minHeight: 34 }}
        />
      </div>
    </div>
  );
}

export type ResumeRowEditable = { year: string; month: string; content: string };
export type EditableBasicInfo = {
  name: string;
  furigana: string;
  birthdate: string;
  gender: string;
  postalCode: string;
  address: string;
  phone: string;
  email: string;
  contactFurigana: string;
  contactPostalCode: string;
  contactAddress: string;
  contactPhone: string;
  contactEmail: string;
};

export function EditableFullResumeTemplate({
  basicInfo,
  onBasicInfoChange,
  education,
  onEducationChange,
  workHistory,
  onWorkHistoryChange,
  qualifications,
  onQualificationsChange,
  selfPr,
  onSelfPrChange,
  requestColumn,
  onRequestColumnChange,
}: {
  basicInfo: EditableBasicInfo;
  onBasicInfoChange: (key: keyof EditableBasicInfo, value: string) => void;
  education: ResumeRowEditable[];
  onEducationChange: (rows: ResumeRowEditable[]) => void;
  workHistory: ResumeRowEditable[];
  onWorkHistoryChange: (rows: ResumeRowEditable[]) => void;
  qualifications: ResumeRowEditable[];
  onQualificationsChange: (rows: ResumeRowEditable[]) => void;
  selfPr: string;
  onSelfPrChange: (value: string) => void;
  requestColumn: string;
  onRequestColumnChange: (value: string) => void;
}) {
  const smallInput: React.CSSProperties = {
    ...EDITABLE_BOX,
    fontSize: 12,
    padding: "3px 6px",
    marginBottom: 0,
  };

  const RowEditor = ({
    rows,
    onRowsChange,
  }: {
    rows: ResumeRowEditable[];
    onRowsChange: (rows: ResumeRowEditable[]) => void;
  }) => (
    <>
      {rows.map((row, i) => (
        <tr key={i}>
          <td style={{ ...CELL, textAlign: "center", width: 50 }}>
            <input
              style={{ ...smallInput, textAlign: "center" }}
              value={row.year}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...row, year: e.target.value };
                onRowsChange(next);
              }}
              placeholder="年"
            />
          </td>
          <td style={{ ...CELL, textAlign: "center", width: 40 }}>
            <input
              style={{ ...smallInput, textAlign: "center" }}
              value={row.month}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...row, month: e.target.value };
                onRowsChange(next);
              }}
              placeholder="月"
            />
          </td>
          <td style={CELL}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                style={{ ...smallInput, flex: 1 }}
                value={row.content}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...row, content: e.target.value };
                  onRowsChange(next);
                }}
              />
              <button
                type="button"
                onClick={() => onRowsChange(rows.filter((_, j) => j !== i))}
                style={{
                  color: "#C33",
                  fontSize: 11,
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
          </td>
        </tr>
      ))}
      <tr>
        <td style={CELL}></td>
        <td style={CELL}></td>
        <td style={CELL}>
          <button
            type="button"
            onClick={() => onRowsChange([...rows, { year: "", month: "", content: "" }])}
            style={{
              color: "#3673C8",
              fontSize: 11,
              border: "1px dashed #3673C8",
              background: "none",
              borderRadius: 4,
              padding: "2px 8px",
              cursor: "pointer",
            }}
          >
            ＋行を追加
          </button>
        </td>
      </tr>
    </>
  );

  return (
    <div style={PAGE_STYLE}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
        }}
      >
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: 6 }}>履歴書</h1>
        <p style={{ fontSize: 11, marginTop: 8 }}>{new Date().toLocaleDateString("ja-JP")} 現在</p>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ ...CELL, width: "70%" }}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>ふりがな</div>
              <input
                style={smallInput}
                value={basicInfo.furigana}
                onChange={(e) => onBasicInfoChange("furigana", e.target.value)}
                placeholder="ふりがな"
              />
              <div style={{ fontSize: 10, color: "#666", marginTop: 8, marginBottom: 2 }}>氏名</div>
              <input
                style={{ ...smallInput, fontSize: 16, fontWeight: 700 }}
                value={basicInfo.name}
                onChange={(e) => onBasicInfoChange("name", e.target.value)}
                placeholder="氏名"
              />
            </td>
            <td style={{ ...CELL, width: "30%", textAlign: "center", verticalAlign: "middle" }}>
              <div
                style={{
                  border: "1px dashed #999",
                  width: 106,
                  height: 144,
                  margin: "0 auto",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 8,
                  color: "#999",
                  textAlign: "center",
                  lineHeight: 1.5,
                }}
              >
                写真を貼る位置
                <br />
                縦36〜40mm
                <br />
                横24〜30mm
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 0, marginBottom: 16 }}>
        <tbody>
          <tr>
            <td style={TH}>生年月日</td>
            <td style={CELL}>
              <input
                style={smallInput}
                value={basicInfo.birthdate}
                onChange={(e) => onBasicInfoChange("birthdate", e.target.value)}
                placeholder="例: 2003年4月1日"
              />
            </td>
            <td style={TH}>性別</td>
            <td style={CELL}>
              <input
                style={smallInput}
                value={basicInfo.gender}
                onChange={(e) => onBasicInfoChange("gender", e.target.value)}
                placeholder="性別"
              />
            </td>
          </tr>
          <tr>
            <td style={TH}>現住所</td>
            <td style={CELL} colSpan={3}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...smallInput, width: 120 }}
                  value={basicInfo.postalCode}
                  onChange={(e) => onBasicInfoChange("postalCode", e.target.value)}
                  placeholder="郵便番号"
                />
                <input
                  style={{ ...smallInput, flex: 1 }}
                  value={basicInfo.address}
                  onChange={(e) => onBasicInfoChange("address", e.target.value)}
                  placeholder="住所"
                />
              </div>
            </td>
          </tr>
          <tr>
            <td style={TH}>電話</td>
            <td style={CELL}>
              <input
                style={smallInput}
                value={basicInfo.phone}
                onChange={(e) => onBasicInfoChange("phone", e.target.value)}
                placeholder="電話番号"
              />
            </td>
            <td style={TH}>E-mail</td>
            <td style={CELL}>
              <input
                style={smallInput}
                value={basicInfo.email}
                onChange={(e) => onBasicInfoChange("email", e.target.value)}
                placeholder="メールアドレス"
              />
            </td>
          </tr>
          <tr>
            <td style={TH}>※連絡先</td>
            <td style={CELL} colSpan={3}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...smallInput, width: 120 }}
                  value={basicInfo.contactPostalCode}
                  onChange={(e) => onBasicInfoChange("contactPostalCode", e.target.value)}
                  placeholder="郵便番号(現住所以外の場合のみ)"
                />
                <input
                  style={{ ...smallInput, flex: 1 }}
                  value={basicInfo.contactAddress}
                  onChange={(e) => onBasicInfoChange("contactAddress", e.target.value)}
                  placeholder="連絡先住所(現住所以外の場合のみ)"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead>
          <tr>
            <td style={{ ...TH, width: 50, textAlign: "center" }}>年</td>
            <td style={{ ...TH, width: 40, textAlign: "center" }}>月</td>
            <td style={{ ...TH, width: "auto", textAlign: "center" }}>
              学歴・職歴（各別にまとめて書く）
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={CELL}></td>
            <td style={CELL}></td>
            <td style={{ ...CELL, textAlign: "center", fontWeight: 700 }}>学歴</td>
          </tr>
          <RowEditor rows={education} onRowsChange={onEducationChange} />
          <tr>
            <td style={CELL}></td>
            <td style={CELL}></td>
            <td style={{ ...CELL, textAlign: "center", fontWeight: 700 }}>職歴</td>
          </tr>
          <RowEditor rows={workHistory} onRowsChange={onWorkHistoryChange} />
          <tr>
            <td style={CELL}></td>
            <td style={CELL}></td>
            <td style={{ ...CELL, textAlign: "right", fontWeight: 700 }}>以上</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead>
          <tr>
            <td style={{ ...TH, width: 50, textAlign: "center" }}>年</td>
            <td style={{ ...TH, width: 40, textAlign: "center" }}>月</td>
            <td style={{ ...TH, width: "auto", textAlign: "center" }}>資格・免許</td>
          </tr>
        </thead>
        <tbody>
          <RowEditor rows={qualifications} onRowsChange={onQualificationsChange} />
        </tbody>
      </table>

      <div style={{ border: "1px solid #333", padding: 10, marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, textAlign: "center" }}>
          志望の動機、自己PRなど
        </p>
        <textarea
          value={selfPr}
          onChange={(e) => onSelfPrChange(e.target.value)}
          style={{ ...EDITABLE_BOX, fontSize: 12, lineHeight: 1.8, minHeight: 140 }}
        />
      </div>

      <div style={{ border: "1px solid #333", padding: 10 }}>
        <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
          本人希望記入欄（特に給料・職種・勤務時間・勤務地・その他についての希望などがあれば記入）
        </p>
        <textarea
          value={requestColumn}
          onChange={(e) => onRequestColumnChange(e.target.value)}
          style={{ ...EDITABLE_BOX, fontSize: 12, lineHeight: 1.8, minHeight: 50 }}
        />
      </div>
    </div>
  );
}

export function EditableEntrySheetTemplate({
  data,
  onDataChange,
  values,
  onChange,
}: {
  data: {
    name: string;
    furigana: string;
    schoolName: string;
    faculty: string;
    department: string;
    interviewNumber?: string;
  };
  onDataChange: (
    key: "name" | "furigana" | "schoolName" | "faculty" | "department" | "interviewNumber",
    value: string,
  ) => void;
  values: { motivation: string; strengths: string; qualifications: string; hobbies: string };
  onChange: (key: "motivation" | "strengths" | "qualifications" | "hobbies", value: string) => void;
}) {
  return (
    <div style={PAGE_STYLE}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>
          新卒採用エントリーシート
        </h1>
        <div style={{ border: "1px solid #333", padding: "4px 10px", fontSize: 10, width: 140 }}>
          面接番号
          <input
            value={data.interviewNumber ?? ""}
            onChange={(e) => onDataChange("interviewNumber", e.target.value)}
            style={{ ...EDITABLE_BOX, fontSize: 11, marginTop: 4, padding: "2px 4px" }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 10, color: "#666" }}>ふりがな</p>
          <input
            value={data.furigana}
            onChange={(e) => onDataChange("furigana", e.target.value)}
            placeholder="ふりがなを入力"
            style={{
              ...EDITABLE_BOX,
              fontSize: 12,
              borderBottom: "1px solid #333",
              paddingBottom: 4,
              marginBottom: 6,
            }}
          />
          <input
            value={data.name}
            onChange={(e) => onDataChange("name", e.target.value)}
            placeholder="氏名を入力"
            style={{
              ...EDITABLE_BOX,
              fontSize: 15,
              fontWeight: 700,
              borderBottom: "1px solid #333",
              paddingBottom: 6,
              marginBottom: 10,
            }}
          />
          <p style={{ fontSize: 12, color: "#666" }}>学校名</p>
          <input
            value={data.schoolName}
            onChange={(e) => onDataChange("schoolName", e.target.value)}
            placeholder="学校名を入力"
            style={{
              ...EDITABLE_BOX,
              fontSize: 13,
              borderBottom: "1px solid #333",
              paddingBottom: 6,
              marginBottom: 10,
            }}
          />
          <p style={{ fontSize: 12, color: "#666" }}>学部</p>
          <input
            value={data.faculty}
            onChange={(e) => onDataChange("faculty", e.target.value)}
            placeholder="学部を入力"
            style={{
              ...EDITABLE_BOX,
              fontSize: 13,
              borderBottom: "1px solid #333",
              paddingBottom: 6,
              marginBottom: 10,
            }}
          />
          <p style={{ fontSize: 12, color: "#666" }}>学科</p>
          <input
            value={data.department}
            onChange={(e) => onDataChange("department", e.target.value)}
            placeholder="学科を入力"
            style={{
              ...EDITABLE_BOX,
              fontSize: 13,
              borderBottom: "1px solid #333",
              paddingBottom: 6,
            }}
          />
        </div>
        <div
          style={{
            width: 120,
            height: 150,
            border: "1px solid #ccc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            color: "#999",
          }}
        >
          写真
        </div>
      </div>

      <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>志望動機</p>
      <div style={{ border: "1px solid #333", padding: 10, marginBottom: 20 }}>
        <textarea
          value={values.motivation}
          onChange={(e) => onChange("motivation", e.target.value)}
          style={{ ...EDITABLE_BOX, fontSize: 12, lineHeight: 1.8, minHeight: 140 }}
        />
      </div>

      <div style={{ display: "flex", gap: 20 }}>
        <div style={{ flex: 1.2 }}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>強み／特技</p>
          <div style={{ border: "1px solid #333", padding: 10 }}>
            <textarea
              value={values.strengths}
              onChange={(e) => onChange("strengths", e.target.value)}
              style={{ ...EDITABLE_BOX, fontSize: 12, lineHeight: 1.8, minHeight: 100 }}
            />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>所有資格</p>
          <textarea
            value={values.qualifications}
            onChange={(e) => onChange("qualifications", e.target.value)}
            style={{
              ...EDITABLE_BOX,
              fontSize: 12,
              marginBottom: 16,
              minHeight: 40,
              border: "1px solid #333",
              padding: 6,
            }}
          />
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>趣味／部活</p>
          <textarea
            value={values.hobbies}
            onChange={(e) => onChange("hobbies", e.target.value)}
            style={{
              ...EDITABLE_BOX,
              fontSize: 12,
              minHeight: 40,
              border: "1px solid #333",
              padding: 6,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function EditableGenericFieldsTemplate({
  title,
  fields,
  values,
  onChange,
}: {
  title: string;
  fields: { key: string; label: string }[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div style={PAGE_STYLE}>
      <h1 style={{ textAlign: "center", fontSize: 20, fontWeight: 700, marginBottom: 24 }}>
        {title}
      </h1>
      {fields.map((f) => (
        <div key={f.key} style={{ marginBottom: 18 }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              borderBottom: "1px solid #333",
              paddingBottom: 4,
              marginBottom: 8,
            }}
          >
            {f.label}
          </p>
          <textarea
            value={values[f.key] ?? ""}
            onChange={(e) => onChange(f.key, e.target.value)}
            style={{ ...EDITABLE_BOX, fontSize: 12, lineHeight: 1.8, minHeight: 60 }}
          />
        </div>
      ))}
    </div>
  );
}

export function EditableProseTemplate({
  title,
  content,
  onChange,
}: {
  title: string;
  content: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={PAGE_STYLE}>
      <h1 style={{ textAlign: "center", fontSize: 20, fontWeight: 700, marginBottom: 24 }}>
        {title}
      </h1>
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...EDITABLE_BOX, fontSize: 13, lineHeight: 1.9, minHeight: 500 }}
      />
    </div>
  );
}

export function ProseTemplate({ title, content }: { title: string; content: string }) {
  return (
    <div style={PAGE_STYLE}>
      <h1 style={{ textAlign: "center", fontSize: 20, fontWeight: 700, marginBottom: 24 }}>
        {title}
      </h1>
      <div>{renderMarkdown(content)}</div>
    </div>
  );
}

/** 指定した要素をキャプチャしてPDFとしてダウンロードする */
export async function exportElementToPdf(element: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const canvas = await html2canvas(element, {
    backgroundColor: "#FFFFFF",
    scale: 2,
    useCORS: true,
  });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;
  // 数ptの端数で無駄な空白2ページ目が生成されるのを防ぐため、閾値を設ける
  while (heightLeft > 20) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }
  pdf.save(filename);
}
