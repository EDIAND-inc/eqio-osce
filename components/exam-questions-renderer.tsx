"use client"

/**
 * 2026-05-08 (ADR-001 §1.2 F4 Phase B.1):
 * teacher-exam-tabs.tsx と patient-exam-tabs.tsx で完全に同一だった
 * 「sheet → category → question 行 → 5 段階評価ボタン」の描画ブロックを
 * 共通コンポーネントとして抽出。
 *
 * 挙動変更ゼロ:
 *  - 入力 disabled の判定は caller 側で計算 (teacher は editMode を考慮、
 *    patient は completion 単体) し、prop で渡す
 *  - onAnswer は caller の handleAnswerChange を直接渡す
 */

import type { GroupedQuestions, QuestionWithGroupingMeta } from "@/lib/exam/hooks"

// 描画に必要な question フィールド
interface RenderableQuestion extends QuestionWithGroupingMeta {
  number: number
  text?: string
  isAlertTarget?: boolean
  alertOptions?: number[]
  // 2026-07-10 副田さん要望 Phase 1: 有効な配点マップ (flatten 側で解決済み)
  scoreMap?: number[] | null
  // 2026-07-13 副田さん要望: 選択肢テキスト (はい/いいえ 等)。設定時はボタン表示に使う。
  option1?: string
  option2?: string
  option3?: string
  option4?: string
  option5?: string
  // 2026-07-24 熊木先生要望: 設問コメント設定
  commentEnabled?: boolean
  commentRequiredMax?: number | null
}

const DEFAULT_SCORE_MAP = [1, 2, 3, 4, 5]

// scoreMap の位置 (0-based) に対応する選択肢テキストを返す。空なら null。
function optionLabelAt(question: RenderableQuestion, index: number): string | null {
  const texts = [question.option1, question.option2, question.option3, question.option4, question.option5]
  const t = texts[index]
  return typeof t === "string" && t.trim() !== "" ? t.trim() : null
}

interface ExamQuestionsRendererProps {
  groupedQuestions: GroupedQuestions<RenderableQuestion>[]
  /** 2026-07-03: compositeKey (`${categoryNumber}-${questionNumber}`) → optionValue */
  answers: Record<string, number>
  /** 入力ボタンを無効化するか(完了済み or 編集モード OFF) */
  inputDisabled: boolean
  /** 出席状態が present でない場合は入力不可 */
  attendancePresent: boolean
  /** ボタンクリック時のハンドラ (compositeKey を渡す)。
   *  value=null で選択解除 (2026-07-03 副田さん要望) */
  onAnswer: (compositeKey: string, optionValue: number | null) => void
  /** 2026-07-24: 設問コメント (compositeKey → 本文)。commentEnabled の設問で入力欄を表示 */
  comments?: Record<string, string>
  onComment?: (compositeKey: string, value: string) => void
  /** コメントの最大文字数 */
  commentMaxLength?: number
}

export function ExamQuestionsRenderer({
  groupedQuestions,
  answers,
  inputDisabled,
  attendancePresent,
  onAnswer,
  comments,
  onComment,
  commentMaxLength = 100,
}: ExamQuestionsRendererProps) {
  return (
    <>
      {groupedQuestions.map((sheet) => (
        <div key={sheet.sheetTitle} className="space-y-3">
          {/* 2026-07-12 デザイン Phase 2-1: シート見出しに左アクセント + 質感 */}
          <div className="flex items-center gap-2.5 rounded-lg border-l-4 border-primary bg-secondary/60 px-4 py-2.5">
            <span className="text-base font-bold text-primary">{sheet.sheetTitle}</span>
          </div>

          {sheet.categories.map((category) => (
            <div key={category.categoryNumber} className="space-y-1.5">
              <div className="px-2 pt-1">
                <p className="text-sm font-bold text-foreground/80 tracking-wide">{category.categoryTitle}</p>
              </div>

              <div className="space-y-0.5">
                {category.questions.map((question) => {
                  // 2026-07-03 副田さんバグ報告: カテゴリ跨ぎ同期を防ぐため compositeKey で参照
                  const compositeKey = `${category.categoryNumber}-${question.number}`
                  const selectedOption = answers[compositeKey]
                  const isAlertTarget = question.isAlertTarget

                  const answered = selectedOption != null
                  // 2026-07-24: コメント必須(選択した配点が閾値以下)なのに未入力か
                  const commentText = comments?.[compositeKey] || ""
                  const commentRequired =
                    question.commentEnabled &&
                    typeof question.commentRequiredMax === "number" &&
                    typeof selectedOption === "number" &&
                    selectedOption <= question.commentRequiredMax
                  const commentMissing = commentRequired && commentText.trim() === ""
                  return (
                    <div
                      key={compositeKey}
                      // 2026-07-12 デザイン Phase 2-1: 未回答/回答済み/アラートを行の質感で区別。
                      //   採点済みは淡い水色、アラート対象は左に赤帯。
                      className={`rounded-lg transition-colors ${
                        isAlertTarget ? "border-l-[3px] border-critical/60" : ""
                      } ${answered ? "bg-primary/[0.04]" : "hover:bg-muted/40"}`}
                    >
                    <div className={`flex items-start gap-3 sm:gap-4 px-3 py-2.5 ${isAlertTarget ? "pl-2.5" : ""}`}>
                      <div className="flex-shrink-0 w-7 pt-2 text-sm font-semibold text-muted-foreground tnum text-right">
                        {question.number}
                      </div>

                      <div className="flex-1 min-w-0 pt-1.5 text-sm leading-relaxed">
                        {question.text}
                        {isAlertTarget && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-critical/30 bg-critical/10 px-2 py-0.5 text-[11px] font-semibold text-critical align-middle">
                            アラート {question.alertOptions?.join(",")}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                        {/* 2026-07-12 デザイン Phase 2-1: 評価ボタンを拡大しタブレットで押しやすく。
                            選択中はブランド色 + 影で明確に。scoreMap ベース描画。 */}
                        {(question.scoreMap && question.scoreMap.length > 0
                          ? question.scoreMap
                          : DEFAULT_SCORE_MAP
                        ).map((option, idx) => {
                          const isOn = selectedOption === option
                          // 2026-07-13: 選択肢テキスト (はい/いいえ 等) があればラベルに使う。
                          //   無ければ従来どおり配点値の数字。採点値 (option) は数値のまま。
                          const label = optionLabelAt(question, idx)
                          const isText = label != null
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => onAnswer(compositeKey, isOn ? null : option)}
                              disabled={inputDisabled || !attendancePresent}
                              title={isOn ? "もう一度押すと解除" : undefined}
                              className={`inline-flex h-11 min-w-[2.75rem] items-center justify-center rounded-xl border text-base font-bold transition-all
                                ${isText ? "px-3.5 whitespace-nowrap" : "tabular-nums"}
                                disabled:cursor-not-allowed disabled:opacity-40
                                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1
                                ${
                                  isOn
                                    ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/30 scale-[1.03]"
                                    : "border-input bg-card text-foreground hover:border-primary/60 hover:bg-primary/5 active:scale-95"
                                }`}
                            >
                              {label ?? option}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    {/* 2026-07-24 熊木先生要望: 設問コメント欄 (commentEnabled のとき) */}
                    {question.commentEnabled && (
                      <div className="px-3 pb-2.5 pl-10 sm:pl-11">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] font-semibold text-muted-foreground">コメント</span>
                          {commentRequired && (
                            <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${
                              commentMissing ? "bg-critical/15 text-critical" : "bg-muted text-muted-foreground"
                            }`}>
                              {commentMissing ? "必須・未入力" : "必須"}
                            </span>
                          )}
                        </div>
                        <textarea
                          value={commentText}
                          onChange={(e) => onComment?.(compositeKey, e.target.value.slice(0, commentMaxLength))}
                          disabled={inputDisabled || !attendancePresent}
                          rows={2}
                          maxLength={commentMaxLength}
                          placeholder="コメントを入力（任意）"
                          className={`w-full resize-none rounded-lg border bg-card px-3 py-2 text-sm leading-relaxed
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                            disabled:cursor-not-allowed disabled:opacity-50
                            ${commentMissing ? "border-critical/70" : "border-input"}`}
                        />
                        <div className="mt-0.5 text-right text-[10px] text-muted-foreground tnum">
                          {commentText.length} / {commentMaxLength}
                        </div>
                      </div>
                    )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}
