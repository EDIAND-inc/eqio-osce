import type * as React from "react"
import { cn } from "@/lib/utils"

/**
 * 2026-07-12 デザイン Phase 1 (副田さん提案書 方向 B):
 * OSCE の「状態」を一貫した色・形で表す共通バッジ。
 *
 * ブランドの青とは分離した意味色 (globals.css の success / warning / critical) で、
 * 出席・完了・アラート・合否が一目で判別できるようにする。丸ドット付き。
 *
 * 使い方:
 *   <StatusPill kind="present" />              // 「出席」(緑)
 *   <StatusPill kind="alert">アラート 2</StatusPill>  // ラベル上書き
 *   <StatusPill kind="complete" dot={false} /> // ドットなし
 */
export type StatusKind =
  | "present"    // 出席
  | "absent"     // 欠席
  | "pending"    // 未確認
  | "complete"   // 完了
  | "incomplete" // 未完了
  | "alert"      // アラート
  | "pass"       // 合格
  | "fail"       // 不合格
  | "neutral"    // -

const STYLES: Record<StatusKind, { cls: string; label: string }> = {
  present:    { cls: "text-success  bg-success/10  border-success/25",  label: "出席" },
  absent:     { cls: "text-warning  bg-warning/10  border-warning/25",  label: "欠席" },
  pending:    { cls: "text-muted-foreground bg-muted border-border",    label: "未確認" },
  complete:   { cls: "text-success  bg-success/10  border-success/25",  label: "完了" },
  incomplete: { cls: "text-muted-foreground bg-muted border-border",    label: "未完了" },
  alert:      { cls: "text-critical bg-critical/10 border-critical/30", label: "アラート" },
  pass:       { cls: "text-success  bg-success/10  border-success/25",  label: "合格" },
  fail:       { cls: "text-warning  bg-warning/10  border-warning/25",  label: "不合格" },
  neutral:    { cls: "text-muted-foreground bg-muted/60 border-border",  label: "-" },
}

interface StatusPillProps extends React.ComponentProps<"span"> {
  kind: StatusKind
  /** 丸ドットを表示するか (デフォルト true)。neutral は自動で非表示 */
  dot?: boolean
}

export function StatusPill({ kind, dot = true, children, className, ...props }: StatusPillProps) {
  const s = STYLES[kind]
  const showDot = dot && kind !== "neutral"
  return (
    <span
      data-slot="status-pill"
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5",
        s.cls,
        className,
      )}
      {...props}
    >
      {showDot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />}
      {children ?? s.label}
    </span>
  )
}
