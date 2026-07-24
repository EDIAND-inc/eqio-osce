"use client"

/**
 * 2026-07-24 熊木先生要望 Phase 2: SP(患者役)向け「1問ずつ」ガイド入力モード。
 *
 * 現状の一覧表示は SP が誤タップしやすいため、文字を大きくし 1 問ずつ表示して
 * 「問1 → 問2 …」と進む形式にする。採点データの保存・集計は既存のまま
 * (親から onAnswer / onComment / onComplete を受け取るだけ)。見せ方だけの差し替え。
 *
 * ステップ構成: 質問 0..N-1 → 最終ステップ(総評コメント + 確認 + 入力完了)。
 * 「次へ」は「回答済み」かつ「必須コメントが未入力でない」ときのみ有効。
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"

export interface WizardQuestion {
  compositeKey: string
  number: number
  text?: string
  categoryTitle?: string
  sheetTitle?: string
  isAlertTarget?: boolean
  scoreMap?: number[]
  option1?: string
  option2?: string
  option3?: string
  option4?: string
  option5?: string
  commentEnabled?: boolean
  commentRequiredMax?: number | null
}

const DEFAULT_SCORE_MAP = [1, 2, 3, 4, 5]

function optionLabelAt(q: WizardQuestion, index: number): string | null {
  const texts = [q.option1, q.option2, q.option3, q.option4, q.option5]
  const t = texts[index]
  return typeof t === "string" && t.trim() !== "" ? t.trim() : null
}

interface Props {
  questions: WizardQuestion[]
  answers: Record<string, number>
  comments: Record<string, string>
  onAnswer: (compositeKey: string, value: number | null) => void
  onComment: (key: string, value: string) => void
  /** 総評コメントのキー (OVERALL_COMMENT_KEY) */
  overallKey: string
  commentMaxLength: number
  /** 入力不可(完了済み等) */
  inputDisabled: boolean
  /** 出席が present でない場合は入力不可 */
  attendancePresent: boolean
  isCompleted: boolean
  onComplete: () => void
  onEdit: () => void
}

export function ExamQuestionsWizard({
  questions,
  answers,
  comments,
  onAnswer,
  onComment,
  overallKey,
  commentMaxLength,
  inputDisabled,
  attendancePresent,
  isCompleted,
  onComplete,
  onEdit,
}: Props) {
  const total = questions.length
  // ステップ: 0..total-1 = 各設問、total = 最終(総評 + 確認)
  const [step, setStep] = useState(0)
  const clampedStep = Math.min(step, total)
  const isFinalStep = clampedStep >= total

  const disabled = inputDisabled || !attendancePresent

  // 必須コメント未入力の設問キー一覧
  const missingKeys = questions
    .filter((q) => {
      if (!q.commentEnabled || typeof q.commentRequiredMax !== "number") return false
      const score = answers[q.compositeKey]
      if (typeof score !== "number") return false
      if (score > q.commentRequiredMax) return false
      return (comments[q.compositeKey] || "").trim() === ""
    })
    .map((q) => q.compositeKey)

  const answeredCount = questions.filter((q) => typeof answers[q.compositeKey] === "number").length
  const allAnswered = answeredCount === total && total > 0
  const canComplete = allAnswered && missingKeys.length === 0

  if (total === 0) {
    return <p className="text-center py-8 text-muted-foreground">評価する設問がありません。</p>
  }

  // ---- 最終ステップ: 総評 + 確認 + 入力完了 ----
  if (isFinalStep) {
    const overallText = comments[overallKey] || ""
    return (
      <div className="mx-auto w-full max-w-5xl space-y-3 px-2">
        <ProgressBar current={total} total={total} label="最終確認" />

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <h3 className="text-base font-bold text-foreground">総評コメント（任意）</h3>
          <p className="mb-2 text-xs text-muted-foreground">全体を通してのコメント（教員内部の記録）</p>
          <textarea
            value={overallText}
            onChange={(e) => onComment(overallKey, e.target.value.slice(0, commentMaxLength))}
            disabled={disabled}
            rows={2}
            maxLength={commentMaxLength}
            placeholder="コメントを入力（任意）"
            className="w-full resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-base leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          <div className="mt-1 text-right text-xs text-muted-foreground tnum">
            {overallText.length} / {commentMaxLength}
          </div>
        </div>

        {/* 確認: 未回答 / 必須コメント未入力があれば案内 */}
        {!canComplete && (
          <div className="rounded-xl border border-critical/40 bg-critical/5 p-4 text-sm text-critical">
            {!allAnswered && <p>未回答の設問があります（{answeredCount} / {total} 問）。</p>}
            {missingKeys.length > 0 && <p>コメントが必要な設問が {missingKeys.length} 件あります。</p>}
            <p className="mt-1 text-muted-foreground">「戻る」で該当の設問に戻って入力してください。</p>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" size="lg" className="h-12 flex-1 text-base" onClick={() => setStep(total - 1)}>
            ← 戻る
          </Button>
          {!isCompleted ? (
            <Button
              size="lg"
              className="h-12 flex-[2] text-base font-bold"
              disabled={!canComplete || disabled}
              onClick={onComplete}
            >
              入力完了
            </Button>
          ) : (
            <Button variant="outline" size="lg" className="h-12 flex-[2] text-base" onClick={onEdit}>
              編集する
            </Button>
          )}
        </div>
      </div>
    )
  }

  // ---- 設問ステップ ----
  const q = questions[clampedStep]
  const selected = answers[q.compositeKey]
  const scoreMap = q.scoreMap && q.scoreMap.length > 0 ? q.scoreMap : DEFAULT_SCORE_MAP
  const commentText = comments[q.compositeKey] || ""
  const commentRequired =
    q.commentEnabled &&
    typeof q.commentRequiredMax === "number" &&
    typeof selected === "number" &&
    selected <= q.commentRequiredMax
  const commentMissing = commentRequired && commentText.trim() === ""
  const answered = typeof selected === "number"
  const canNext = answered && !commentMissing

  const labels = scoreMap.map((_, idx) => optionLabelAt(q, idx))

  return (
    <div className="mx-auto w-full max-w-5xl space-y-3 px-2">
      <ProgressBar current={clampedStep + 1} total={total} label={q.categoryTitle} />

      <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
        {/* 設問文 */}
        <p className="text-xl font-bold leading-snug text-foreground sm:text-2xl">
          {q.text}
        </p>

        {/* 評価ボタン: 横並び。カードが広いので長文でも余裕を持って収まる。
            2026-07-25 副田さん要望: 設問文との間に1行分の余白を空ける */}
        <div className="mt-8 flex flex-wrap gap-3">
          {scoreMap.map((option, idx) => {
            const isOn = selected === option
            const label = labels[idx]
            return (
              <button
                key={option}
                type="button"
                disabled={disabled}
                onClick={() => onAnswer(q.compositeKey, isOn ? null : option)}
                className={`flex min-h-16 min-w-28 flex-1 items-center justify-center rounded-2xl border-2 px-4 py-3 text-center text-lg font-bold leading-snug transition-all
                  disabled:cursor-not-allowed disabled:opacity-40
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                  ${
                    isOn
                      ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-[1.02]"
                      : "border-input bg-background text-foreground hover:border-primary/60 hover:bg-primary/5 active:scale-95"
                  }`}
              >
                {label ?? option}
              </button>
            )
          })}
        </div>

        {/* コメント欄（設定時） */}
        {q.commentEnabled && (
          <div className="mt-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">コメント</span>
              {commentRequired && (
                <span
                  className={`rounded px-2 py-0.5 text-xs font-bold ${
                    commentMissing ? "bg-critical/15 text-critical" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {commentMissing ? "必須・未入力" : "必須"}
                </span>
              )}
            </div>
            <textarea
              value={commentText}
              onChange={(e) => onComment(q.compositeKey, e.target.value.slice(0, commentMaxLength))}
              disabled={disabled}
              rows={2}
              maxLength={commentMaxLength}
              placeholder="コメントを入力（任意）"
              className={`w-full resize-none rounded-xl border bg-background px-4 py-3 text-base leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                commentMissing ? "border-critical/70" : "border-input"
              }`}
            />
            <div className="mt-1 text-right text-xs text-muted-foreground tnum">
              {commentText.length} / {commentMaxLength}
            </div>
          </div>
        )}
      </div>

      {/* ナビゲーション */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="lg"
          className="h-12 flex-1 text-base"
          disabled={clampedStep === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          ← 戻る
        </Button>
        <Button
          size="lg"
          className="h-12 flex-[2] text-base font-bold"
          disabled={!canNext}
          onClick={() => setStep((s) => s + 1)}
        >
          {clampedStep === total - 1 ? "確認へ →" : "次へ →"}
        </Button>
      </div>
      {!answered && (
        <p className="text-center text-xs text-muted-foreground">評価を選ぶと次へ進めます</p>
      )}
      {commentMissing && (
        <p className="text-center text-xs text-critical">この評価ではコメントの入力が必要です</p>
      )}
    </div>
  )
}

function ProgressBar({ current, total, label }: { current: number; total: number; label?: string }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label || " "}</span>
        <span className="text-sm font-bold text-primary tnum">
          {current} <span className="text-muted-foreground">/ {total}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
