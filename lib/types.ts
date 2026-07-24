/**
 * Phase 9c-5: 全 ドメイン 型定義の集約。
 *
 * 旧 lib/data-storage.ts から types を切り出し。新規コードは本ファイルから import すること。
 * 関数(load/save 系)は lib/api/<resource>.ts に移行済み。
 */

// 学生データの型定義
export interface Student {
  id: string
  studentId: string // 学籍番号
  name: string // 氏名
  email?: string // メールアドレス
  department: string // 学部・学科
  grade?: string // 学年(例: "4年" "5年")。Phase 9 B-1 で追加。
  roomNumber: string // 部屋番号
  createdAt: string
  universityCode?: string // 大学コード
  subjectCode?: string // 担当教科コード
  testSessionId?: string // 試験セッションID
}

// 教員データの型定義
// 権限: general=一般教員, subject_admin=教科管理者, university_admin=大学管理者, master_admin=マスター管理者
export type TeacherRole = "general" | "subject_admin" | "university_admin" | "master_admin"

export interface Teacher {
  id: string
  teacherId: string
  name: string // 氏名
  email: string // メールアドレス（ログインID）
  password: string // ログインパスワード
  role: TeacherRole // 統合権限
  assignedRoomNumber: string // 担当部屋番号（単一）
  slotIndex?: number // 部屋内の①②…順（assignments JOIN 取得時のみ。2026-07-13）
  createdAt: string
  universityCode?: string // 大学コード
  subjectCode?: string // 担当教科コード
  testSessionId?: string // 試験セッションID
  // 後方互換用（非推奨）
  accountType?: string
  subjectRole?: string
}

// 患者役データの型定義
export interface Patient {
  id: string
  patientId: string
  name: string // 氏名
  email: string // メールアドレス（ログインID）
  password: string // ログインパスワード
  role: "general" // ADR-001 §7-2(b) で patient_admin は廃止、general のみ
  assignedRoomNumber: string // 担当部屋番号（単一）
  slotIndex?: number // 部屋内の順（assignments JOIN 取得時のみ。2026-07-13）
  createdAt: string
  universityCode?: string // 大学コード
  accountType?: "special_master" | "university_master" | "admin" // アカウントタイプ
  subjectCode?: string // 担当教科コード
  testSessionId?: string // 試験セッションID
}

// 出席状況データの型定義
export interface AttendanceRecord {
  studentId: string
  status: "present" | "absent" | "pending" // 出席、欠席、未確認
  markedBy: string // 記録した評価者のID（teacherまたはpatient）
  markedByType: "teacher" | "patient" // 評価者の種別
  roomNumber: string // 部屋番号
  timestamp: string // 記録時刻
  universityCode?: string // 大学コード
  subjectCode?: string // 教科コード
  testSessionId?: string // 試験セッションID
}

// 評価結果データの型定義
export interface EvaluationResult {
  studentId: string
  evaluatorId: string // 教員または患者役のID
  evaluatorType: "teacher" | "patient"
  testId?: string // 紐づく試験(Test)ID — teacher/patient-exam-tabs で記録
  roomNumber: string
  answers: Record<number, number> // 問題番号: 回答値（1-5）
  totalScore: number
  // ADR-006 R-2-F6-0: 評価上限点 (NULL = レガシー行 / 算出失敗。% 判定はスキップ)
  maxScore?: number | null
  answeredCount: number
  isCompleted: boolean
  hasAlert?: boolean // Add hasAlert flag to track if any answer triggers an alert
  completedAt?: string
  createdAt?: string // saveEvaluationResults 後に DB が付与
  updatedAt?: string // 同上
  timestamp?: string // teacher/patient-exam-tabs が記録時刻として渡す
  universityCode?: string // 大学コード
  testSessionId?: string // 試験セッションID
}

export interface Room {
  id: string
  roomNumber: string
  roomName: string
  createdAt: string
  universityCode?: string // 大学コード
  subjectCode?: string // 教科コード
  testSessionId?: string // 試験セッションID
}

// 問題管理データの型定義
export interface Question {
  id: string
  number: number // 問題番号（No）
  text: string // 問題文
  option1: string // 選択肢1
  option2: string // 選択肢2
  option3: string // 選択肢3
  option4: string // 選択肢4
  option5: string // 選択肢5
  isAlertTarget: boolean // アラート対象ON/OFF
  alertOptions: number[] // アラート対象の選択肢番号（配点値）
  // 2026-07-11 副田さん要望: 問題ごとの scoreMap 個別上書き (optional)
  //   未指定なら属するカテゴリーの scoreMap を使用 (右端ボタンから上書き可)。
  scoreMap?: number[] | null
  // 2026-07-24 熊木先生要望: 設問コメント欄。
  //   commentEnabled=true でコメント欄を表示。commentRequiredMax に値があれば
  //   「選択した配点がその値以下のとき必須」(例: 概略評定 2 以下で必須)。
  commentEnabled?: boolean
  commentRequiredMax?: number | null
  universityCode?: string // 大学コード
}

export interface Category {
  id: string
  title: string // タイトル3（カテゴリ名）
  number: number // カテゴリ番号
  questions: Question[]
  // 2026-07-11 副田さん要望: カテゴリー単位の N 段階配点 (主設定)。
  //   カテゴリー全体に反映される。問題ごとに question.scoreMap で上書き可能。
  //   未指定なら [1,2,3,4,5] (5 段階) として動作。
  scoreMap?: number[]
  universityCode?: string // 大学コード
}

export interface Sheet {
  id: string
  title: string // タイトル2（シート名）
  categories: Category[]
  // 2026-07-10 Phase 1 残置: シート単位の scoreMap (現在 UI からは未使用、互換のため保持)
  scoreMap?: number[]
  universityCode?: string // 大学コード
}

// 2026-07-24 熊木先生要望: コメント関連の共通定数・キー。
//   コメントは点数と同じ evaluations(jsonb)に文字列で保存する。合計計算は
//   数値の値のみを集計するため衝突しない。キーは compositeKey と被らない接頭辞。
export const MAX_COMMENT_LENGTH = 100 // 約 2 行
export const OVERALL_COMMENT_KEY = "overall_comment" // 総評(評価全体で 1 つ)
export const commentKeyFor = (compositeKey: string): string => `comment:${compositeKey}`
export const isCommentKey = (key: string): boolean =>
  key === OVERALL_COMMENT_KEY || key.startsWith("comment:")

// scoreMap のデフォルト値と解決ヘルパ
export const DEFAULT_SCORE_MAP: number[] = [1, 2, 3, 4, 5]

// 2026-07-11 副田さん要望: 解決優先順位 question > category > default
export function resolveScoreMap(
  category?: { scoreMap?: number[] | null },
  question?: { scoreMap?: number[] | null },
): number[] {
  const q = question?.scoreMap
  if (Array.isArray(q) && q.length > 0) return q
  const c = category?.scoreMap
  if (Array.isArray(c) && c.length > 0) return c
  return DEFAULT_SCORE_MAP
}

export interface Test {
  id: string
  title: string // タイトル1（テスト名）
  sheets: Sheet[]
  createdAt: string
  updatedAt: string
  universityCode?: string // 大学コード
  testSessionId?: string // Add test_session_id
  subjectCode?: string // 教科コード
  roleType?: "teacher" | "patient" // 教員側 or 患者役側
}

// 試験セッションデータの型定義
export type TestSessionStatus = "not_started" | "in_progress" | "completed"

export interface TestSession {
  id: string
  testDate: string
  description: string
  universityCode: string
  subjectCode?: string
  passingScore?: number | null
  /** 制限時間(分)。NULL/undefined は制限時間未設定。 */
  durationMinutes?: number | null
  status: TestSessionStatus
  createdAt: string
  updatedAt: string
}


// 教科データの型定義
export interface Subject {
  id: string
  subjectCode: string
  subjectName: string
  universityCode: string
  description?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}
