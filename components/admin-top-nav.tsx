"use client"

/**
 * Phase 9 design refresh: 管理画面の水平ナビゲーションバー。
 * AppShell の下に表示され、admin/* 配下の主要セクションへ常時遷移できるようにする。
 *
 * 表示条件:
 *  - special_master / university_master: 全タブ表示
 *  - subject_admin: ダッシュボード + 問題管理
 *  - その他(general teacher 等): 表示しない(ナビ自体を出さない)
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Layers, Users, FileQuestion, Settings } from "lucide-react"
import { useSession } from "@/lib/auth/use-session"

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  /** マッチさせる pathname プレフィックス(href 単体だけでなく配下も active 判定) */
  matchPrefixes: string[]
  /** 表示する accountType の集合 */
  visibleFor: Set<string>
}

const ALL_ADMIN_ACCOUNTS = new Set(["special_master", "university_master", "subject_admin", "admin"])
const HIGHER_ADMIN_ACCOUNTS = new Set(["special_master", "university_master", "admin"])
// 案 Y(2026-05-02 確定): subject_admin はアカウント管理・設定にも自教科スコープでアクセス可
const SUBJECT_ADMIN_ACCOUNTS = new Set([
  "special_master",
  "university_master",
  "subject_admin",
  "admin",
])

const NAV_ITEMS: NavItem[] = [
  {
    href: "/admin/dashboard",
    label: "ダッシュボード",
    icon: LayoutDashboard,
    matchPrefixes: ["/admin/dashboard"],
    visibleFor: ALL_ADMIN_ACCOUNTS,
  },
  {
    href: "/admin/master-management",
    label: "マスター管理",
    icon: Layers,
    matchPrefixes: [
      "/admin/master-management",
      "/admin/university-management",
      "/admin/room-management",
      "/admin/subject-management",
    ],
    visibleFor: HIGHER_ADMIN_ACCOUNTS,
  },
  {
    href: "/admin/account-management",
    label: "アカウント管理",
    icon: Users,
    matchPrefixes: [
      "/admin/account-management",
      "/admin/users",
      "/admin/teachers-list",
      "/admin/patients-list",
      "/admin/students-list",
      "/admin/students-detail",
      "/admin/register-students",
      "/admin/register-teachers",
      "/admin/register-patients",
    ],
    visibleFor: SUBJECT_ADMIN_ACCOUNTS,
  },
  {
    href: "/admin/question-management",
    label: "問題管理",
    icon: FileQuestion,
    matchPrefixes: ["/admin/question-management", "/admin/questions"],
    visibleFor: ALL_ADMIN_ACCOUNTS,
  },
  {
    href: "/admin/settings",
    label: "設定",
    icon: Settings,
    matchPrefixes: ["/admin/settings"],
    visibleFor: SUBJECT_ADMIN_ACCOUNTS,
  },
]

function isActive(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

/**
 * 2026-11-06: 上部メニューに表示するタブを返す(非表示なら空配列)。
 * BackLink が「上部メニューと重複する戻るボタン」を隠す判定にも使う。
 */
export function useAdminNavItems(): { isLoading: boolean; items: NavItem[] } {
  const { session, isLoading } = useSession()
  if (isLoading) return { isLoading: true, items: [] }
  if (!session) return { isLoading: false, items: [] }
  // 教員ログインからの admin 兼任(subject_admin/university_admin) 含めて表示
  const accountType = session.accountType
  if (!accountType || (!ALL_ADMIN_ACCOUNTS.has(accountType) && !HIGHER_ADMIN_ACCOUNTS.has(accountType) && !SUBJECT_ADMIN_ACCOUNTS.has(accountType))) {
    return { isLoading: false, items: [] }
  }
  return { isLoading: false, items: NAV_ITEMS.filter((item) => item.visibleFor.has(accountType)) }
}

export function AdminTopNav() {
  const pathname = usePathname() || ""
  const { items: visibleItems } = useAdminNavItems()
  if (visibleItems.length === 0) return null

  return (
    <nav aria-label="管理メニュー">
      {/* 2026-11-06: ヘッダーと同じ最大幅(PAGE_WIDTH.wide = 1,600px)にそろえる
          2026-11-09: 紺の帯の下段に置く「カルテのインデックスタブ」型。開いているタブだけ
          ページと同じ地色になり、ページとつながって見える。 */}
      <div className="mx-auto max-w-[100rem] px-4 md:px-8">
        <div className="flex items-end gap-1 overflow-x-auto">
          {visibleItems.map((item) => {
            const active = isActive(pathname, item.matchPrefixes)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex items-center gap-2 rounded-t-lg px-4 h-11 text-[15px] whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60",
                  active
                    ? "bg-background text-foreground font-bold"
                    : "text-chrome-foreground/75 hover:text-white hover:bg-white/10",
                ].join(" ")}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
