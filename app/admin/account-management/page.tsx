import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Users, UserCog, UserPlus, List, Plus } from "lucide-react"
import { PageContainer } from "@/components/page-container"
import { BackLink } from "@/components/back-link"

// 2026-11-06 デザイン見直し: 幅 1,024px のメニュー画面に。学生・教員・患者役を 3 枚のカードで横に並べ、
//   「ユーザーを追加」は見出しの右に置く(以前は全幅のボタンが縦に積まれて間延びしていた)。
const SECTIONS = [
  {
    key: "students",
    title: "学生管理",
    description: "学生の登録と一覧表示",
    icon: Users,
    register: { href: "/admin/register-students", label: "学生登録" },
    list: { href: "/admin/students-list", label: "学生一覧" },
  },
  {
    key: "teachers",
    title: "教員管理",
    description: "教員の登録と一覧表示",
    icon: UserCog,
    register: { href: "/admin/register-teachers", label: "教員登録" },
    list: { href: "/admin/teachers-list", label: "教員一覧" },
  },
  {
    key: "patients",
    title: "患者役管理",
    description: "患者役の登録と一覧表示",
    icon: Users,
    register: { href: "/admin/register-patients", label: "患者役登録" },
    list: { href: "/admin/patients-list", label: "患者役一覧" },
  },
] as const

export default function AccountManagementPage() {
  return (
    <PageContainer width="menu" className="space-y-6">
      <div className="space-y-2">
        <BackLink href="/admin/dashboard" label="ダッシュボードに戻る" hideWhenAdminNav />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-primary">アカウント管理</h1>
            <p className="text-muted-foreground">学生・教員・患者役の管理</p>
          </div>
          {/* Phase 9d-4a: 統合ユーザー追加(教員 + 患者役) */}
          <Link href="/admin/users/new">
            <Button size="lg">
              <Plus className="w-5 h-5 mr-2" />
              ユーザーを追加する
            </Button>
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          「ユーザーを追加する」では、役割(一般教員 / 教科責任者 / 患者役)を選んで 1 件ずつ追加できます。
          CSV のまとめ登録は、下の各「登録」から行えます。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {SECTIONS.map((section) => {
          const Icon = section.icon
          return (
            <Card key={section.key} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="w-5 h-5" />
                  {section.title}
                </CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto grid grid-cols-2 gap-3">
                <Link href={section.register.href}>
                  <Button className="w-full h-20 bg-transparent" variant="outline">
                    <div className="flex flex-col items-center gap-2">
                      <UserPlus className="w-6 h-6" />
                      <span>{section.register.label}</span>
                    </div>
                  </Button>
                </Link>
                <Link href={section.list.href}>
                  <Button className="w-full h-20 bg-transparent" variant="outline">
                    <div className="flex flex-col items-center gap-2">
                      <List className="w-6 h-6" />
                      <span>{section.list.label}</span>
                    </div>
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </PageContainer>
  )
}
