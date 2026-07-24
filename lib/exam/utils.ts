/**
 * 2026-05-08 (ADR-001 §1.2 F4 Phase A.1):
 * teacher-exam-tabs.tsx と patient-exam-tabs.tsx で 100% 同一だった
 * 純粋関数を抽出。挙動変更ゼロ、純粋な dedup。
 */
import { OVERALL_COMMENT_KEY } from "@/lib/types"

/**
 * answers (compositeKey → optionValue) の合計点を返す。
 * 2026-07-24: コメント機能により answers には文字列コメント
 * (`comment:...` / `overall_comment`) も同居するため、**数値の値のみ**を合算する。
 */
export function calculateScore(
  answers: Record<string | number, unknown> | undefined,
): number {
  if (!answers) return 0
  return Object.values(answers).reduce<number>(
    (sum, val) => (typeof val === "number" ? sum + val : sum),
    0,
  )
}

/**
 * 2026-07-24: answers から「実際に採点された設問数」を数える。
 * 数値の値のみを対象にし、コメント文字列キーを除外する。
 */
export function countAnswered(answers: Record<string | number, unknown> | undefined): number {
  if (!answers) return 0
  return Object.values(answers).filter((v) => typeof v === "number").length
}

/**
 * test-selection-screen が UI 状態として書く testSessionId を読む。
 * SSR 安全(server 側では空文字を返す)。
 */
export function getTestSessionId(): string {
  if (typeof window === "undefined") return ""
  return sessionStorage.getItem("testSessionId") || ""
}

/**
 * Test の sheets → categories → questions ネスト構造を flat な question 配列に
 * 展開する。各 element に sheet/category のメタ情報を付与する。
 *
 * patient/teacher の同型ループを 1 つに集約。
 *
 * オプション:
 * - dedupByKey: 同じ (sheet, category, question) キーが現れたら 2 回目以降を
 *   読み飛ばす(teacher 側の防御的実装に対応)
 * - addDisplayNumber: 連番 displayNumber を付与する(patient 側の表示用番号)
 */
export interface FlattenedQuestion {
  sheetTitle: string
  categoryTitle: string
  categoryNumber: number
  number: number
  // 2026-07-03 副田さんバグ報告修正: カテゴリ跨ぎで number が被って answers が
  // 同期していたため、`${categoryNumber}-${number}` の compositeKey を追加。
  compositeKey: string
  text?: string
  isAlertTarget?: boolean
  alertOptions?: number[]
  // 2026-07-10 副田さん要望 Phase 1: 有効な配点マップ (シート → 問題個別で解決済み)
  //   flattenTestQuestions が sheet.scoreMap / question.scoreMap から解決して入れる。
  scoreMap?: number[]
  // 2026-07-24 熊木先生要望: 設問コメント設定 (pass-through)
  commentEnabled?: boolean
  commentRequiredMax?: number | null
  // displayNumber は addDisplayNumber=true のときのみ
  displayNumber?: number
  // 元の question の他のフィールドは pass-through で保持
  [extra: string]: unknown
}

/** 2026-07-03: カテゴリ跨ぎで一意な回答キーを生成する */
export function makeAnswerKey(categoryNumber: number, questionNumber: number): string {
  return `${categoryNumber}-${questionNumber}`
}

export interface FlattenTestOptions {
  dedupByKey?: boolean
  addDisplayNumber?: boolean
}

// Test の型は呼び出し側で多様(@/lib/types の Test, またはさらに緩い any)
// なので、本 utility は最小限の構造的型(MinimalTest)で受け取る。
// caller は必要に応じて as any でキャストして渡す前提。
interface MinimalSheet {
  title: string
  scoreMap?: number[] | null
  categories?: ReadonlyArray<MinimalCategory>
}
interface MinimalCategory {
  title: string
  number: number
  // 2026-07-11 副田さん要望: カテゴリー単位の配点マップ
  scoreMap?: number[] | null
  questions?: ReadonlyArray<unknown>
}
interface MinimalTest {
  sheets?: ReadonlyArray<MinimalSheet>
}

/**
 * 学生の回答マップ + 質問定義から、アラート発火しているかを判定する。
 *
 * 質問のうち `is_alert_target=true` のものについて、選択した値が
 * `alert_options` に含まれていれば true。1 問でも該当があれば true。
 *
 * 2026-05-13: teacher-exam-tabs / patient-exam-tabs の handleMarkComplete で
 * hasAlert がハードコード false / state 不整合になっていたバグの修正用に新設。
 */
interface QuestionWithAlert {
  number: number
  compositeKey?: string  // 2026-07-03: カテゴリ跨ぎで一意な key。flatten 後は必ずある
  isAlertTarget?: boolean | null
  alertOptions?: number[] | null
  // 2026-07-10 副田さん要望 Phase 2: 有効な配点マップ (flatten 側で解決済み)
  scoreMap?: number[] | null
}

/**
 * アラート発火判定 (副田さん要望 Phase 2: 位置ベース化)
 *
 * `alertOptions` は「選択肢の位置 (0-indexed)」で持つ仕様に変更。
 * 例: scoreMap=[1,3,5] で alertOptions=[0] なら「1 点を選ぶとアラート」。
 *
 * 判定手順:
 *   1. 回答の値 selectedValue を取得
 *   2. scoreMap 内で selectedValue の位置 (indexOf) を求める
 *   3. alertOptions にその位置が含まれていればアラート
 */
export function computeHasAlert(
  answers: Record<string | number, number> | undefined,
  questions: ReadonlyArray<QuestionWithAlert>,
): boolean {
  if (!answers || !questions) return false
  for (const q of questions) {
    if (!q.isAlertTarget || !q.alertOptions || q.alertOptions.length === 0) continue
    const selectedValue = q.compositeKey != null ? answers[q.compositeKey] : answers[q.number]
    if (selectedValue == null) continue
    const scoreMap = Array.isArray(q.scoreMap) && q.scoreMap.length > 0 ? q.scoreMap : [1, 2, 3, 4, 5]
    const position = scoreMap.indexOf(selectedValue)
    if (position >= 0 && q.alertOptions.includes(position)) return true
  }
  return false
}

/**
 * EvaluationResult の配列(全件)から、評価者にマッチする行だけを抽出して
 * 学生 ID をキーとする answers / completion / alerts のマップを組み立てる。
 *
 * patient/teacher で同型だった「初期評価状態の組み立てループ」を 1 つに集約。
 * editMode のような role 固有の派生 state は caller 側で computeMaps.completion
 * から導出する想定。
 */
export interface EvaluationMaps {
  // 2026-07-03: compositeKey (`${categoryNumber}-${questionNumber}`) ベース。数値の採点のみ。
  answers: Record<string, Record<string, number>>
  completion: Record<string, boolean>
  alerts: Record<string, boolean>
  // 2026-07-24: 学生 → コメントキー(compositeKey / OVERALL_COMMENT_KEY) → 本文。
  //   evaluations(jsonb)内の `comment:<key>` / `overall_comment` を復元したもの。
  comments: Record<string, Record<string, string>>
}

interface EvaluationResultLike {
  studentId: string
  evaluatorType?: string | null
  evaluatorId?: string | null
  // 過去データは Record<number, number>、新規は Record<string, number> の混在があり得る。
  // JSONB なので JS 上はどちらもオブジェクトで取得できる。
  answers?: Record<string | number, number> | null
  isCompleted?: boolean | null
  hasAlert?: boolean | null
}

export function buildEvaluationMaps(
  results: ReadonlyArray<EvaluationResultLike> | null | undefined,
  opts: {
    evaluatorType: "teacher" | "patient"
    /** teacher 限定: 同じ部屋の他教員の評価を除外する為の照合 */
    evaluatorEmail?: string
  },
): EvaluationMaps {
  const out: EvaluationMaps = { answers: {}, completion: {}, alerts: {}, comments: {} }
  if (!results || !Array.isArray(results)) return out

  // 2026-07-11: メール比較は大文字小文字を無視 (代理採点で lowercased email が入るため)
  const wantEmail = (opts.evaluatorEmail || "").toLowerCase()
  for (const r of results) {
    if (r.evaluatorType !== opts.evaluatorType) continue
    if (wantEmail && (r.evaluatorId || "").toLowerCase() !== wantEmail) continue
    if (!r.studentId) continue
    // 2026-07-24: evaluations には採点(数値)とコメント(文字列)が同居する。
    //   数値キー → answers、コメントキー → comments に振り分けて復元する。
    const raw = (r.answers || {}) as Record<string, unknown>
    const scores: Record<string, number> = {}
    const comments: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "number") {
        scores[k] = v
      } else if (typeof v === "string" && v !== "") {
        if (k === OVERALL_COMMENT_KEY) comments[OVERALL_COMMENT_KEY] = v
        else if (k.startsWith("comment:")) comments[k.slice("comment:".length)] = v
      }
    }
    out.answers[r.studentId] = scores
    out.completion[r.studentId] = r.isCompleted || false
    out.alerts[r.studentId] = r.hasAlert || false
    out.comments[r.studentId] = comments
  }
  return out
}

/**
 * 2026-07-24: 採点とコメントを 1 つの evaluations オブジェクトに統合する。
 *   scores(compositeKey→数値)+ comments(compositeKey / OVERALL_COMMENT_KEY→文字列)。
 *   空コメントは保存しない。
 */
export function mergeAnswersAndComments(
  scores: Record<string, number>,
  comments: Record<string, string> | undefined,
): Record<string, number | string> {
  const merged: Record<string, number | string> = { ...scores }
  if (comments) {
    for (const [k, v] of Object.entries(comments)) {
      const t = (v || "").trim()
      if (!t) continue
      const storageKey = k === OVERALL_COMMENT_KEY ? OVERALL_COMMENT_KEY : `comment:${k}`
      merged[storageKey] = t
    }
  }
  return merged
}

/**
 * 2026-07-24: コメント必須なのに未入力の設問 compositeKey 一覧を返す。
 *   question.commentEnabled かつ commentRequiredMax があり、選択した配点が
 *   その値以下なのにコメントが空 → 必須未入力。
 */
export function missingRequiredComments(
  questions: ReadonlyArray<{ compositeKey?: string; commentEnabled?: boolean; commentRequiredMax?: number | null }>,
  scores: Record<string, number> | undefined,
  comments: Record<string, string> | undefined,
): string[] {
  const missing: string[] = []
  if (!questions) return missing
  for (const q of questions) {
    const key = q.compositeKey
    if (!key || !q.commentEnabled) continue
    if (typeof q.commentRequiredMax !== "number") continue
    const score = scores?.[key]
    if (typeof score !== "number") continue // 未回答は「全問回答」チェック側で弾く
    if (score <= q.commentRequiredMax) {
      const text = (comments?.[key] || "").trim()
      if (!text) missing.push(key)
    }
  }
  return missing
}

export function flattenTestQuestions(
  test: MinimalTest | null | undefined,
  options: FlattenTestOptions = {},
): FlattenedQuestion[] {
  const out: FlattenedQuestion[] = []
  if (!test?.sheets || !Array.isArray(test.sheets)) return out

  const seen = options.dedupByKey ? new Set<string>() : null
  let displayNumber = 1

  for (const sheet of test.sheets) {
    if (!sheet.categories || !Array.isArray(sheet.categories)) continue
    for (const category of sheet.categories) {
      if (!category.questions || !Array.isArray(category.questions)) continue
      for (const rawQuestion of category.questions) {
        const question = rawQuestion as Record<string, unknown>
        const num = (question.number as number | undefined) ?? 0
        if (seen) {
          const key = `${sheet.title}-${category.number}-${num}`
          if (seen.has(key)) continue
          seen.add(key)
        }
        // 2026-07-11 副田さん要望: scoreMap を question → category の順で解決して注入
        const qScoreMap = question.scoreMap as number[] | null | undefined
        const cScoreMap = category.scoreMap
        const resolvedScoreMap =
          Array.isArray(qScoreMap) && qScoreMap.length > 0
            ? qScoreMap
            : Array.isArray(cScoreMap) && cScoreMap.length > 0
            ? cScoreMap
            : [1, 2, 3, 4, 5]
        const flattened: FlattenedQuestion = {
          ...question,
          number: num,
          sheetTitle: sheet.title,
          categoryTitle: category.title,
          categoryNumber: category.number,
          compositeKey: makeAnswerKey(category.number, num),
          scoreMap: resolvedScoreMap,
        }
        if (options.addDisplayNumber) {
          flattened.displayNumber = displayNumber++
        }
        out.push(flattened)
      }
    }
  }
  return out
}
