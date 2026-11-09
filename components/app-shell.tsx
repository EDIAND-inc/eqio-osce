"use client"

/**
 * Phase 9b-γ: AppShell — ロール対応ヘッダーの骨格。
 *
 * ADR-001 §2.1 の「画面シェルは 1 つに」を実現する最初の実装。
 * 認証済みページの上部に表示される共通ヘッダー。
 *
 * Phase 9b-γ では「最小先行サンプル」として、master-management ページだけに
 * 適用して本番動作確認を行う。Phase 9d で route group への移行と全画面適用を実施。
 */

import type { ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { useSession } from "@/lib/auth/use-session"
import { useBranding } from "@/lib/branding/use-branding"
import { BrandingIcon } from "@/components/branding-icon"

interface AppShellProps {
  /** 帯の下段に置くメニュー (管理画面の AdminTopNav) */
  nav?: ReactNode
  children: ReactNode
  /** アクセス必須(未ログインなら login にリダイレクト)。デフォルト true */
  requireAuth?: boolean
  /** 未ログイン時の遷移先 */
  loginPath?: string
}

/**
 * ロール → 表示ラベル のマップ。9d で master データに移行する可能性あり。
 */
const ROLE_LABELS: Record<string, string> = {
  master_admin: "システム管理者",
  university_admin: "大学管理者",
  subject_admin: "教科責任者",
  general: "一般",
  admin: "管理者",
  // accountType レベル(歴史的経緯)
  special_master: "システム管理者",
  university_master: "大学管理者",
}

function deriveRoleLabel(role: string, accountType: string): string {
  return ROLE_LABELS[role] || ROLE_LABELS[accountType] || role || "ユーザー"
}

export function AppShell({ children, requireAuth = true, loginPath = "/", nav }: AppShellProps) {
  const router = useRouter()
  const { session, isLoading } = useSession()
  const branding = useBranding()

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="bg-chrome text-chrome-foreground">
          <div className="mx-auto max-w-[100rem] px-4 md:px-8 h-14 flex items-center gap-2.5">
            <BrandingIcon branding={branding} className="text-xl w-6 h-6" alt="" />
            <span className="font-bold text-white">{branding.title}</span>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">読み込み中…</p>
        </main>
      </div>
    )
  }

  if (requireAuth && !session) {
    if (typeof window !== "undefined") {
      router.push(loginPath)
    }
    return null
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* 2026-11-09 デザイン見直し: 上部を深い紺の帯に (電子カルテ調)。管理画面では帯の下段に
          カルテのインデックスタブ型メニュー (nav) を置き、帯ごと sticky にする。
          旧実装はヘッダーとメニューが両方 top-0 sticky で、スクロール時にメニューが隠れていた。 */}
      <header className="sticky top-0 z-30 bg-chrome text-chrome-foreground shadow-[0_1px_0_rgba(0,0,0,0.15)]">
        <div className="mx-auto max-w-[100rem] px-4 md:px-8 h-14 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-[17px] text-white rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
            <BrandingIcon branding={branding} className="text-2xl w-7 h-7" alt="" />
            <span>{branding.title}</span>
          </Link>
          {session && (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block leading-tight">
                <div className="text-sm font-bold text-white">
                  {session.userName || "ユーザー"}
                </div>
                <div className="text-xs text-chrome-foreground/75 mt-0.5">
                  {deriveRoleLabel(session.role, session.accountType)}
                </div>
              </div>
              <Button
                onClick={() => router.back()}
                variant="ghost"
                size="sm"
                className="border border-white/25 text-white hover:bg-white/10 hover:text-white"
                title="一つ前の画面に戻る"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                戻る
              </Button>
            </div>
          )}
        </div>
        {nav}
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
