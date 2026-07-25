"use client"

/**
 * 2026-07-25 副田さん要望: タブレット運用向けの下部固定アクションバー。
 *
 * 提案(承認済)の導線を全モード共通で提供する:
 *  - 進捗「学生の完了 n / N 人」を常時表示。
 *  - 現在の学生が未完了 → 大きな「この学生を入力完了」(全問回答で活性)。
 *  - 現在の学生が完了済み → 「編集」+「次の学生へ」。
 *  - 全学生が完了 → 強調した「評価完了 → 結果へ」+ 確認ダイアログ(誤操作防止)。
 *
 * タッチ領域を大きく(高さ 48〜56px)。採点・保存ロジックは持たず、ハンドラを受け取るだけ。
 */

import { useState } from "react"

interface Props {
  completedCount: number
  totalStudents: number
  allCompleted: boolean
  /** 現在の学生が完了済み(または欠席)か */
  currentDone: boolean
  /** 現在の学生を「入力完了」にできるか(出席済み・全問回答・必須コメント済み) */
  canCompleteCurrent: boolean
  hasNextStudent: boolean
  onCompleteCurrent: () => void
  onEditCurrent: () => void
  onNextStudent: () => void
  /** 結果画面へ進む */
  onFinish: () => void
}

const BTN = "inline-flex items-center justify-center rounded-xl font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed"

export function ExamActionBar({
  completedCount,
  totalStudents,
  allCompleted,
  currentDone,
  canCompleteCurrent,
  hasNextStudent,
  onCompleteCurrent,
  onEditCurrent,
  onNextStudent,
  onFinish,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const pct = totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-border bg-card/95 px-3 py-2.5 backdrop-blur sm:px-6 sm:py-3">
        <div className="mx-auto flex max-w-5xl items-center gap-3 sm:gap-5">
          {/* 進捗 */}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-baseline justify-between text-xs text-muted-foreground">
              <span>学生の完了</span>
              <span className="font-bold text-primary tabular-nums">
                {completedCount} <span className="text-muted-foreground">/ {totalStudents} 人</span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* アクション */}
          <div className="flex flex-none items-center gap-2 sm:gap-3">
            {allCompleted ? (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className={`${BTN} h-14 min-w-[200px] gap-2 bg-primary px-6 text-base text-primary-foreground shadow-lg shadow-primary/30 hover:brightness-105 active:scale-95`}
              >
                評価完了 → 結果へ
              </button>
            ) : currentDone ? (
              <>
                <button
                  type="button"
                  onClick={onEditCurrent}
                  className={`${BTN} h-12 min-w-[88px] border-2 border-input bg-card px-4 text-base text-muted-foreground hover:text-foreground active:scale-95`}
                >
                  編集
                </button>
                <button
                  type="button"
                  onClick={onNextStudent}
                  disabled={!hasNextStudent}
                  className={`${BTN} h-12 min-w-[160px] gap-1 bg-primary px-5 text-base text-primary-foreground hover:brightness-105 active:scale-95 disabled:bg-muted disabled:text-muted-foreground`}
                >
                  次の学生へ →
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onCompleteCurrent}
                disabled={!canCompleteCurrent}
                className={`${BTN} h-14 min-w-[200px] gap-1 bg-primary px-6 text-base text-primary-foreground shadow-md shadow-primary/25 hover:brightness-105 active:scale-95 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none`}
              >
                この学生を入力完了 →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 評価完了の確認 */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-foreground">評価を完了します</h3>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">
              全 {totalStudents} 人の評価がそろいました。結果画面に進みます。よろしいですか?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className={`${BTN} h-12 flex-1 border-2 border-input bg-card text-base text-muted-foreground hover:text-foreground`}
              >
                戻る
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false)
                  onFinish()
                }}
                className={`${BTN} h-12 flex-[2] bg-primary text-base text-primary-foreground hover:brightness-105`}
              >
                評価完了
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
