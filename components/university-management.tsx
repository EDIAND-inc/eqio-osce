"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { Upload, Plus, Pencil, Trash2 } from "lucide-react"
import { PageContainer } from "@/components/page-container"
import { BackLink } from "@/components/back-link"
import { EmptyState } from "@/components/ui/empty-state"
import { readCsvFile } from "@/lib/csv"

interface University {
  id: string
  university_code: string
  university_name: string
  department_name: string
  created_at: string
  updated_at: string
}

export function UniversityManagement() {
  const [universities, setUniversities] = useState<University[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingUniversity, setEditingUniversity] = useState<University | null>(null)
  const [formData, setFormData] = useState({
    university_code: "",
    university_name: "",
    department_name: "",
  })
  const { toast } = useToast()

  useEffect(() => {
    loadUniversities()
  }, [])

  const loadUniversities = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/universities")
      if (response.ok) {
        const data = await response.json()
        setUniversities(data)
      }
    } catch (error) {
      console.error("Failed to load universities:", error)
      toast({
        title: "読み込みエラー",
        description: "大学データの読み込みに失敗しました",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const url = editingUniversity ? `/api/universities/${editingUniversity.id}` : "/api/universities"

      const response = await fetch(url, {
        method: editingUniversity ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        toast({
          title: "成功",
          description: editingUniversity ? "大学情報を更新しました" : "大学を追加しました",
        })
        setShowAddDialog(false)
        setEditingUniversity(null)
        setFormData({ university_code: "", university_name: "", department_name: "" })
        loadUniversities()
      } else {
        throw new Error("Failed to save university")
      }
    } catch (error) {
      console.error("Failed to save university:", error)
      toast({
        title: "エラー",
        description: "大学情報の保存に失敗しました",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("この大学を削除してもよろしいですか？")) return

    try {
      const response = await fetch(`/api/universities/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast({
          title: "成功",
          description: "大学を削除しました",
        })
        loadUniversities()
      } else {
        // バックエンドからの詳細エラー(FK 制約等)を表示
        const errorBody = await response.json().catch(() => null)
        toast({
          title: "削除できません",
          description: errorBody?.error || `大学の削除に失敗しました (status ${response.status})`,
          variant: "destructive",
        })
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      console.error("Failed to delete university:", msg)
      toast({
        title: "エラー",
        description: `大学の削除に失敗しました: ${msg}`,
        variant: "destructive",
      })
    }
  }

  const handleEdit = (university: University) => {
    setEditingUniversity(university)
    setFormData({
      university_code: university.university_code,
      university_name: university.university_name,
      department_name: university.department_name,
    })
    setShowAddDialog(true)
  }

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    let text: string
    try {
      // 2026-05-20 副田さん報告: Excel 保存の Shift-JIS CSV が化けるため自動判定
      text = await readCsvFile(file)
    } catch (err) {
      alert(err instanceof Error ? err.message : "CSV ファイルの読み込みに失敗しました")
      e.target.value = ""
      return
    }
    const lines = text.split("\n").filter((line) => line.trim())

    // CSVヘッダーをスキップ
    const dataLines = lines.slice(1)

    const universities = dataLines.map((line) => {
      const [university_code, university_name, department_name] = line.split(",").map((s) => s.trim())
      return { university_code, university_name, department_name }
    })

    try {
      const response = await fetch("/api/universities/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ universities }),
      })

      if (response.ok) {
        toast({
          title: "成功",
          description: `${universities.length}件の大学を一括登録しました`,
        })
        loadUniversities()
      }
    } catch (error) {
      console.error("Failed to bulk upload:", error)
      toast({
        title: "エラー",
        description: "CSV一括登録に失敗しました",
        variant: "destructive",
      })
    }

    // ファイル入力をリセット
    e.target.value = ""
  }

  return (
    // 2026-11-06 デザイン見直し: 列の少ない表なので menu(1,024px)
    <PageContainer width="menu">
      <div className="space-y-4">
        <BackLink href="/admin/master-management" label="マスター管理に戻る" />
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">大学マスター管理</CardTitle>
                <CardDescription>大学コード、大学名、学部名を管理します</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setEditingUniversity(null)
                    setFormData({ university_code: "", university_name: "", department_name: "" })
                    setShowAddDialog(true)
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  大学を追加
                </Button>
                <Button variant="outline" asChild>
                  <label>
                    <Upload className="w-4 h-4 mr-2" />
                    CSV一括登録
                    <input type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
                  </label>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground mb-4">
              CSV形式: 大学コード,大学名,学部名（ヘッダー行あり）
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>大学コード</TableHead>
                  <TableHead>大学名</TableHead>
                  <TableHead>学部名</TableHead>
                  <TableHead>更新日</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center">
                      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                        読み込み中...
                      </span>
                    </TableCell>
                  </TableRow>
                ) : universities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <EmptyState title="大学が登録されていません" description="「大学を追加」または CSV 一括登録から追加してください。" />
                    </TableCell>
                  </TableRow>
                ) : (
                  universities.map((university) => (
                    <TableRow key={university.id}>
                      <TableCell className="font-medium">{university.university_code}</TableCell>
                      <TableCell>{university.university_name}</TableCell>
                      <TableCell>{university.department_name}</TableCell>
                      <TableCell>{new Date(university.updated_at).toLocaleDateString("ja-JP")}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleEdit(university)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(university.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingUniversity ? "大学情報を編集" : "大学を追加"}</DialogTitle>
              <DialogDescription>大学コード、大学名、学部名を入力してください</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="university_code">大学コード</Label>
                <Input
                  id="university_code"
                  value={formData.university_code}
                  onChange={(e) => setFormData({ ...formData, university_code: e.target.value })}
                  placeholder="例: dentshowa"
                  required
                  disabled={!!editingUniversity}
                />
              </div>
              <div>
                <Label htmlFor="university_name">大学名</Label>
                <Input
                  id="university_name"
                  value={formData.university_name}
                  onChange={(e) => setFormData({ ...formData, university_name: e.target.value })}
                  placeholder="例: 昭和医科大学"
                  required
                />
              </div>
              <div>
                <Label htmlFor="department_name">学部名</Label>
                <Input
                  id="department_name"
                  value={formData.department_name}
                  onChange={(e) => setFormData({ ...formData, department_name: e.target.value })}
                  placeholder="例: 歯学部"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddDialog(false)
                    setEditingUniversity(null)
                    setFormData({ university_code: "", university_name: "", department_name: "" })
                  }}
                >
                  キャンセル
                </Button>
                <Button type="submit">{editingUniversity ? "更新" : "追加"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </PageContainer>
  )
}
