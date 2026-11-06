"use client"

import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Building2, DoorOpen, BookOpen } from "lucide-react"
import { PageContainer } from "@/components/page-container"
import { BackLink } from "@/components/back-link"
import { useSession } from "@/lib/auth/use-session"

/**
 * Phase 9b-γ: AppShell をラップして共通ヘッダー(ロゴ + ロール表示 + ログアウト)を表示。
 * 中身は β2a で実装した内容そのまま。
 */
export default function MasterManagementPage() {
  const router = useRouter()
  const { session, isLoading } = useSession()

  if (isLoading) return null
  if (!session) {
    if (typeof window !== "undefined") router.push("/admin/login")
    return null
  }

  const accountType = session.accountType

  return (
    // 2026-11-06 デザイン見直し: メニュー画面(1,024px)。見出しの位置・色を他画面とそろえる。
    <PageContainer width="menu" className="space-y-6">
        <div className="space-y-2">
          <BackLink href="/admin/dashboard" label="ダッシュボードに戻る" hideWhenAdminNav />
          <div>
            <h1 className="text-3xl font-bold text-primary">マスター管理</h1>
            <p className="text-muted-foreground">大学、部屋、教科のマスターデータを管理します</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accountType === "special_master" && (
            <Card
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => router.push("/admin/university-management")}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>大学マスター管理</CardTitle>
                </div>
                <CardDescription>大学の登録・編集・削除を行います</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation()
                    router.push("/admin/university-management")
                  }}
                >
                  大学マスター管理を開く
                </Button>
              </CardContent>
            </Card>
          )}

          <Card
            className="hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => router.push("/admin/room-management")}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-500/10 rounded-lg">
                  <DoorOpen className="h-6 w-6 text-blue-500" />
                </div>
                <CardTitle>部屋マスター管理</CardTitle>
              </div>
              <CardDescription>試験室・面接室などの部屋情報を管理します</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full bg-transparent"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation()
                  router.push("/admin/room-management")
                }}
              >
                部屋マスター管理を開く
              </Button>
            </CardContent>
          </Card>

          <Card
            className="hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => router.push("/admin/subject-management")}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-500/10 rounded-lg">
                  <BookOpen className="h-6 w-6 text-green-500" />
                </div>
                <CardTitle>教科マスター管理</CardTitle>
              </div>
              <CardDescription>教科の登録・編集・削除を行います（大学ごと）</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full bg-transparent"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation()
                  router.push("/admin/subject-management")
                }}
              >
                教科マスター管理を開く
              </Button>
            </CardContent>
          </Card>
        </div>
    </PageContainer>
  )
}
