"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Download, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

const mockStudents = [
  { id: "2024-ST-001", name: "山田太郎", progress: 100, score: 85, status: "提出済み" },
  { id: "2024-ST-002", name: "佐藤花子", progress: 100, score: 92, status: "提出済み" },
  { id: "2024-ST-003", name: "鈴木一郎", progress: 65, score: null, status: "試験中" },
  { id: "2024-ST-004", name: "田中美咲", progress: 100, score: 78, status: "提出済み" },
  { id: "2024-ST-005", name: "高橋健太", progress: 0, score: null, status: "未着手" },
  { id: "2024-ST-006", name: "伊藤愛", progress: 100, score: 88, status: "提出済み" },
  { id: "2024-ST-007", name: "渡辺誠", progress: 45, score: null, status: "試験中" },
  { id: "2024-ST-008", name: "中村由美", progress: 100, score: 95, status: "提出済み" },
]

export function AdminStudentList() {
  const handleExportCSV = () => {
    const csvContent = `学籍番号,氏名,進捗率,得点,ステータス\n${mockStudents
      .map((s) => `${s.id},${s.name},${s.progress}%,${s.score || "-"},${s.status}`)
      .join("\n")}`
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = "受験者一覧.csv"
    link.click()
  }

  return (
    <div className="min-h-screen bg-secondary/30 p-4 md:p-8">
      <div className="mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <Link href="/admin/dashboard">
              <Button variant="ghost" size="sm" className="mb-2">
                <ArrowLeft className="w-4 h-4 mr-2" />
                ダッシュボードに戻る
              </Button>
            </Link>
            <h1 className="text-[28px] leading-tight font-bold text-primary">受験者一覧</h1>
            <p className="text-muted-foreground">受験者の詳細情報と試験結果</p>
          </div>
          <Button onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-2" />
            CSVエクスポート
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>全受験者データ</CardTitle>
            <CardDescription>学籍番号順に表示</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>学籍番号</TableHead>
                    <TableHead>氏名</TableHead>
                    <TableHead>進捗</TableHead>
                    <TableHead>点数</TableHead>
                    <TableHead>ステータス</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockStudents.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-mono">{student.id}</TableCell>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell>{student.progress}%</TableCell>
                      <TableCell>
                        {student.score !== null ? (
                          <span className="font-semibold">{student.score} / 100</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {student.status === "提出済み" && <Badge variant="default">提出済み</Badge>}
                        {student.status === "試験中" && (
                          <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                            試験中
                          </Badge>
                        )}
                        {student.status === "未着手" && <Badge variant="outline">未着手</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
