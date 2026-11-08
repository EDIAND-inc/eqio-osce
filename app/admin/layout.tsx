"use client"

/**
 * Phase 9d-3: 全 admin 画面に共通 AppShell を適用。
 * Phase 9-design-refresh: AppShell の下に AdminTopNav を挿入し、5 セクションへ
 * 常時遷移可能にする。
 */
import type { ReactNode } from "react"
import { AppShell } from "@/components/app-shell"
import { AdminTopNav } from "@/components/admin-top-nav"

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell loginPath="/login" nav={<AdminTopNav />}>
      {children}
    </AppShell>
  )
}
