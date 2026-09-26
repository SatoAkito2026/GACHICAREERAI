// 書類選考AI（screening.tsx）専用の選択肢定義。
// 全職種共通のチェックボックス項目（必須条件・歓迎条件・求める人物像）と、
// 職種別の評価フォーカス（書類のどこを重視して読むか）をまとめる。

// ---- チェックボックス項目の型 ----
// numberInput: true の場合、チェックすると数値入力欄（年数・人数・回数など）が
// 展開される。unit はその数値の単位ラベル（「年以上」「人」など）。
// multiSelectOptions が指定されている場合、チェックすると複数選択可能な
// 選択肢（チェックボックス群、例：学歴レベル）が展開される。
// inexperienceOkToggle: true の場合、項目のすぐ下に「未経験可」トグルを表示する。
// 有効化すると、この項目は評価の加点対象から除外される（未経験者歓迎の意図を示す）。
export interface ConditionItem {
  id: string;
  label: string;
  numberInput?: boolean;
  unit?: string;
  multiSelectOptions?: string[];
  inexperienceOkToggle?: boolean;
  // 入力欄のプレースホルダー（自由記述項目向け）
  placeholder?: string;
}

export interface ConditionCategory {
  id: string;
  label: string;
  items: ConditionItem[];
}

// ============================================================
// 必須条件
// ============================================================
export const REQUIRED_CONDITION_CATEGORIES: ConditionCategory[] = [
  {
    id: "experience_skill",
    label: "経験・スキル",
    items: [
      {
        id: "work_experience_years",
        label: "実務経験◯年以上（社会人経験全般）",
        numberInput: true,
        unit: "年以上",
        inexperienceOkToggle: true,
      },
      { id: "same_industry_job", label: "同業種・同職種での経験" },
      {
        id: "management_lead",
        label: "マネジメント・チームリード経験",
        numberInput: true,
        unit: "年以上",
      },
      { id: "mentoring_education", label: "後輩育成・教育経験" },
      { id: "customer_negotiation", label: "顧客対応・対人折衝経験" },
      { id: "pc_skill", label: "PCスキル（Word／Excel基本操作）" },
      {
        id: "qualification",
        label: "特定の資格・国家資格を保有",
        placeholder: "例：簿記2級、普通自動車免許二種",
      },
      {
        id: "specific_tool_skill",
        label: "特定のソフト・専門スキルを保有",
        placeholder: "例：Photoshop、Salesforce",
      },
    ],
  },
  {
    id: "achievement",
    label: "成果・実績",
    items: [
      { id: "numeric_achievement", label: "数値実績・成果を持っている" },
      { id: "goal_achievement", label: "目標達成経験がある" },
      { id: "problem_solving", label: "業務改善・課題解決経験がある" },
    ],
  },
  {
    id: "condition_work",
    label: "条件・勤務",
    items: [
      {
        id: "education_level",
        label: "学歴",
        multiSelectOptions: ["中卒", "高卒", "専門卒", "高専卒", "大学中退", "大卒", "大学院卒"],
      },
      { id: "drivers_license", label: "普通自動車免許" },
      { id: "fulltime", label: "フルタイム勤務が可能" },
      { id: "shift_holiday", label: "シフト・休日出勤への対応が可能" },
      { id: "location_transfer", label: "勤務地・転勤条件を満たす" },
      { id: "join_timing", label: "入社可能時期が条件内" },
      { id: "long_term_employment", label: "長期勤務が可能（短期離職でない）" },
      { id: "job_change_count", label: "転職回数◯回以内", numberInput: true, unit: "回以内" },
    ],
  },
];

// ============================================================
// 歓迎条件
// ============================================================
export const PREFERRED_CONDITION_CATEGORIES: ConditionCategory[] = [
  {
    id: "experience_ability",
    label: "経験・能力",
    items: [
      { id: "industry_experience", label: "業界経験（同業界での経験）" },
      { id: "english_skill", label: "英語力（日常会話レベル以上）" },
      { id: "leader_management", label: "リーダー・管理職経験", numberInput: true, unit: "人規模" },
      { id: "project_promotion", label: "プロジェクト推進経験" },
      { id: "cross_department", label: "部署横断で調整した経験" },
      { id: "new_tool_adoption", label: "新しいツール・システムの導入・活用経験" },
      { id: "ai_it_tool", label: "AI・ITツール活用経験" },
      { id: "kpi_management", label: "KPI管理・数値管理経験" },
    ],
  },
  {
    id: "achievement_improvement",
    label: "成果・改善",
    items: [
      { id: "self_initiated_result", label: "自ら企画・提案して成果を出した経験" },
      {
        id: "continuous_result",
        label: "継続的に成果を出した経験",
        numberInput: true,
        unit: "年以上",
      },
      { id: "pdca_improvement", label: "PDCAを回して改善した経験" },
      { id: "multi_tasking", label: "複数業務を並行して進めた経験" },
    ],
  },
  {
    id: "career_background",
    label: "キャリア背景",
    items: [
      { id: "career_change", label: "異業種・異職種からの転職経験（多様な視点）" },
      { id: "side_business", label: "副業・フリーランス経験" },
      { id: "community_volunteer", label: "地域貢献・ボランティア等の社外活動経験" },
    ],
  },
];

// ============================================================
// 求める人物像（positiveTags系。数値入力なし）
// ============================================================
export const IDEAL_PERSON_CATEGORIES: ConditionCategory[] = [
  {
    id: "behavior",
    label: "行動特性",
    items: [
      { id: "proactive", label: "主体性がある（自ら考えて動ける）" },
      { id: "ownership", label: "オーナーシップがある（自分ごととして責任を持つ）" },
      { id: "high_action_volume", label: "行動量が多い" },
      { id: "speed", label: "スピード感を持って行動できる" },
      { id: "persistence", label: "継続力がある" },
    ],
  },
  {
    id: "personality_fit",
    label: "人柄・組織適性",
    items: [
      { id: "honest", label: "誠実・素直（フィードバックを受け入れられる）" },
      { id: "self_responsibility", label: "自責思考（他責にしない）" },
      { id: "teamwork", label: "チームワークを大切にできる" },
      { id: "involve_others", label: "周囲を巻き込める" },
      { id: "respect_others", label: "相手の意見を尊重できる" },
    ],
  },
  {
    id: "thinking_growth",
    label: "思考力・成長性",
    items: [
      { id: "logical_thinking", label: "論理的思考力がある" },
      { id: "data_driven", label: "数字・データで物事を語れる" },
      { id: "problem_finding", label: "課題発見力がある" },
      { id: "improvement_proposal", label: "改善提案ができる（指示待ちでない）" },
      { id: "learning_motivation", label: "学習意欲が高い・成長志向" },
    ],
  },
  {
    id: "customer_work_attitude",
    label: "顧客・仕事への姿勢",
    items: [
      { id: "customer_perspective", label: "顧客・利用者目線がある" },
      { id: "goal_oriented", label: "目標達成意識が高い" },
      { id: "adaptability", label: "変化への適応力がある" },
      { id: "resilience", label: "逆境・ストレスへの耐性がある" },
      { id: "retention_intent", label: "長期的に働く意欲が高い（定着志向）" },
    ],
  },
];

// ============================================================
// 職種別の評価フォーカス
// 面接添削モード（InterviewCoach.tsx）の JOB_TYPE_CONFIG.focus を
// 書類選考向けに再構成したもの。
// ============================================================
export const JOB_TYPE_SCREENING_FOCUS: Record<string, string> = {
  営業: "営業職の書類では「数字での実績（売上・件数・達成率）」と「その数字につながった行動・プロセスの記述」を重視して読むこと。数字の記載が無い場合は、行動量や工夫の具体性で代替的に評価する。",
  "事務・総務":
    "事務・総務職の書類では「正確性（ミス防止の工夫）」「マルチタスク対応力」「社内調整経験」を重視して読むこと。資格・PCスキルの記載も評価材料とする。",
  "経理・財務":
    "経理・財務職の書類では「担当した実務範囲の具体性（決算・月次・税務などのレベル）」「ミス防止・チェック体制への意識」「資格（簿記等）」を重視して読むこと。",
  "人事・採用":
    "人事・採用職の書類では「採用実績の具体性（人数・手法・承諾率等）」「候補者対応・定着支援の経験」「社内調整力」を重視して読むこと。",
  "マーケ・広報":
    "マーケ・広報職の書類では「施策の成果（数値での効果測定）」「データに基づく仮説検証・改善の経験」「担当チャネルの幅」を重視して読むこと。",
  カスタマーサポート:
    "カスタマーサポート職の書類では「クレーム対応・難しい対応の経験」「改善提案の経験」を重視して読むこと。数字の有無を過度に問わない。",
  "エンジニア・開発":
    "エンジニア・開発職の書類では「技術スタック・担当範囲の具体性」「問題解決・障害対応の経験」「継続的な学習・キャッチアップの姿勢」を重視して読むこと。",
  デザイナー:
    "デザイナー職の書類では「制作実績・担当範囲の具体性」「関係者調整やフィードバック対応の経験」を重視して読むこと。",
  "現場スタッフ・製造":
    "現場スタッフ・製造職の書類では「安全・品質管理への意識」「チームワーク」「改善提案の経験」「長期就業の意欲」を重視して読むこと。数字の記載が無いことを過度に減点しない。",
  "物流・配送":
    "物流・配送職の書類では「時間管理・納期遵守の意識」「安全運転・体調管理への意識」「トラブル対応の経験」を重視して読むこと。",
  "飲食・サービス":
    "飲食・サービス職の書類では「接客対応の経験」「繁忙期のチームワーク」「衛生・品質管理への意識」「継続力」を重視して読むこと。",
  "医療・介護":
    "医療・介護職の書類では「利用者・患者対応の経験」「多職種連携」「緊急対応の経験」「資格（介護福祉士等）」を重視して読むこと。",
  "教育・保育":
    "教育・保育職の書類では「子ども・生徒対応の経験」「保護者対応」「資格（保育士・教員免許等）」「忍耐力・指導改善の姿勢」を重視して読むこと。",
  "マネージャー・管理職":
    "マネージャー・管理職の書類では「マネジメント経験の具体性（人数・期間・成果）」「意思決定・課題解決の経験」「育成経験」を重視して読むこと。",
  その他:
    "この職種の書類では「具体的な実績・成果」「主体性」「チーム連携」「業務改善の経験」を汎用的な観点で評価すること。",
};

export function getJobTypeScreeningFocus(jobType: string): string {
  return JOB_TYPE_SCREENING_FOCUS[jobType] ?? JOB_TYPE_SCREENING_FOCUS["その他"];
}
