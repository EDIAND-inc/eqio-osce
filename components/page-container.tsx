/**
 * 2026-11-06 デザイン見直し: 画面の種類ごとに最大幅を 4 段階で統一する共通外枠。
 *
 * 経緯: 2026-07-03 に全画面の max-w-* を一律撤去したため、入力フォームやメニュー画面まで
 * ブラウザ幅いっぱいに伸びて間延びしていた。ダッシュボード等の情報量が多い画面は広いまま、
 * フォームは読みやすい幅に戻す。タブレット(横 1,180〜1,280px)では list / wide の見た目は変わらない。
 *
 * 幅を変えたいときは各画面で値を書かず、ここの PAGE_WIDTH を変えること(単一情報源)。
 */
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export const PAGE_WIDTH = {
  /** 768px: 1 項目ずつ入力するフォーム(ユーザー追加、システム設定など) */
  form: "max-w-3xl",
  /** 1,024px: メニュー画面・列の少ない表(アカウント管理、部屋マスターなど) */
  menu: "max-w-5xl",
  /** 1,280px: 列の多い一覧・編集画面・評価画面 */
  list: "max-w-7xl",
  /** 1,600px: ダッシュボード・割当管理。ヘッダーと上部メニューもこの幅にそろえる */
  wide: "max-w-[100rem]",
} as const

export type PageWidth = keyof typeof PAGE_WIDTH

interface PageContainerProps {
  width: PageWidth
  children: ReactNode
  className?: string
}

export function PageContainer({ width, children, className }: PageContainerProps) {
  return (
    <div className={cn("mx-auto w-full px-4 py-6 md:px-8 md:py-8", PAGE_WIDTH[width], className)}>
      {children}
    </div>
  )
}
