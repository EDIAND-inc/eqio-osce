"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { PageContainer } from "@/components/page-container"
import { BackLink } from "@/components/back-link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Download, Trash2, Search, Edit, AlertTriangle } from "lucide-react"
import { loadTeachers, loadRooms, deleteTeacher, loadSubjects, type Teacher,
  type TeacherRole, type Subject } from "@/lib/data-storage"
import { updateTeacher } from "@/lib/api/teachers"
import { useSession } from "@/lib/auth/use-session"

export default function TeachersListPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null)
  const [rooms, setRooms] = useState<Array<{ roomNumber: string; roomName: string }>>([])
  const [accountType, setAccountType] = useState<string>("")
  const [universities, setUniversities] = useState<Record<string, string>>({})
  const [universitiesList, setUniversitiesList] = useState<Array<{ university_code: string; university_name: string }>>(
    [],
  )
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("all")
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "general" as TeacherRole,
    assignedRoomNumber: "",
    university_code: "",
    subjectCode: "",
  })

  // Phase 9b-β2d: sessionStorage("accountType") を useSession() に置換
  const { session, isLoading: isSessionLoading } = useSession()

  useEffect(() => {
    if (isSessionLoading || !session) return
    const fetchData = async () => {
      const storedAccountType = session.accountType || ""
      setAccountType(storedAccountType)

      if (storedAccountType === "special_master") {
        try {
          const response = await fetch("/api/universities")
          if (response.ok) {
            const data = await response.json()
            setUniversitiesList(Array.isArray(data) ? data : [])
            const universityMap: Record<string, string> = {}
            if (Array.isArray(data)) {
              data.forEach((uni: any) => {
                universityMap[uni.university_code] = uni.university_name
              })
            }
            setUniversities(universityMap)
          }
        } catch (error) {
        }
      }

      // 2026-05-19: 教員一覧は人物そのものの canonical 一覧として全件取得。
      // (testSessionId を渡すと未割当の教員が見えなくなり、副田さんから
      //  「kyouka が表示されない」と報告された問題への対応)
      // 部屋一覧は現セッションでフィルタする (編集ダイアログの「担当部屋」選択肢用)。
      const testSessionId = sessionStorage.getItem("testSessionId") || ""
      // 2026-05-20 副田さん指摘: 大学スコープは維持する必要がある。
      // special_master のみ全大学を見られる。それ以外は自大学のみ。
      const universityScope =
        session.accountType === "special_master" ? undefined : session.universityCode || undefined
      // 案 Y: subject_admin は自教科のみ表示
      const subjectScope = session.accountType === "subject_admin" ? session.subjectCode : undefined
      const [fetchedTeachers, fetchedRooms, fetchedSubjects] = await Promise.all([
        loadTeachers(universityScope, subjectScope, undefined),
        loadRooms(universityScope, undefined, testSessionId),
        loadSubjects(),
      ])

      setTeachers(Array.isArray(fetchedTeachers) ? fetchedTeachers : [])
      setRooms(Array.isArray(fetchedRooms) ? fetchedRooms : [])
      setSubjects(Array.isArray(fetchedSubjects) ? fetchedSubjects : [])
    }

    fetchData()
  }, [session, isSessionLoading])

  const filteredTeachers = teachers.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesSubject = selectedSubjectFilter === "all" || t.subjectCode === selectedSubjectFilter
    return matchesSearch && matchesSubject
  })

  const handleEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher)
    setEditForm({
      name: teacher.name,
      email: teacher.email,
      password: teacher.password,
      role: teacher.role,
      assignedRoomNumber: teacher.assignedRoomNumber || "",
      university_code: teacher.universityCode || "",
      subjectCode: teacher.subjectCode || "",
    })
  }

  const handleSaveEdit = async () => {
    if (!editingTeacher) return

    // 2026-05-20 副田さん仕様: 教科管理者は担当教科必須 (PR #125 登録 form と同じ仕様)
    if (editForm.role === "subject_admin" && !editForm.subjectCode) {
      alert("教科管理者の場合は担当教科を選択してください")
      return
    }

    // 2026-05-08: id ベースの PATCH に切替(register_teachers_bulk の
    // ON CONFLICT (univ, email) で email 変更時に旧行が orphan になるバグ回避)
    try {
      const updated = await updateTeacher(editingTeacher.id, {
        name: editForm.name,
        email: editForm.email,
        password: editForm.password || undefined, // 空文字なら password 未変更扱い
        role: editForm.role,
        assignedRoomNumber: editForm.assignedRoomNumber,
        universityCode: editForm.university_code,
        subjectCode: editForm.subjectCode,
      })
      setTeachers((prev) => prev.map((t) => (t.id === editingTeacher.id ? { ...t, ...updated } : t)))
      setEditingTeacher(null)
      alert("教員情報を更新しました")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error"
      console.error("[teachers-list] handleSaveEdit failed:", msg, e)
      alert(`教員情報の更新に失敗しました: ${msg}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm("この教員を削除しますか？")) {
      try {
        await deleteTeacher(id)

        const updated = teachers.filter((t) => t.id !== id)
        setTeachers(updated)
        alert("教員を削除しました")
      } catch (error) {
        alert("削除に失敗しました")
      }
    }
  }

  const handleDeleteAll = async () => {
    if (confirm("全ての教員データを削除しますか？この操作は取り消せません。")) {
      try {
        for (const teacher of teachers) {
          await deleteTeacher(teacher.id)
        }
        setTeachers([])
        alert("全ての教員データを削除しました")
      } catch (error) {
        alert("削除に失敗しました")
      }
    }
  }

  const handleExportCSV = () => {
    const headers =
      accountType === "special_master"
        ? ["大学名", "氏名", "メールアドレス（ログインID）", "ログインパスワード", "権限", "担当部屋番号"]
        : ["氏名", "メールアドレス（ログインID）", "ログインパスワード", "権限", "担当部屋番号"]

    const rows = teachers.map((t) => {
      const baseRow = [
        ...(accountType === "special_master" ? [universities[t.universityCode || ""] || ""] : []),
        t.name,
        t.email,
        t.password,
        t.role !== "general" ? "管理者" : "一般",
        t.assignedRoomNumber || "",
      ]
      return baseRow
    })

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n")

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `教員一覧_${new Date().toISOString().split("T")[0]}.csv`
    link.click()
  }

  const isValidRoom = (roomNumber: string) => {
    if (!roomNumber) return true
    return rooms.some((r) => r.roomNumber === roomNumber)
  }

  const handleRefresh = async () => {
    // 2026-05-19: 教員一覧は canonical 全件取得 (未割当の教員も含む)
    // 2026-05-20: ただし大学スコープは維持 (special_master のみ全大学)
    const testSessionId = sessionStorage.getItem("testSessionId") || ""
    const universityScope =
      session?.accountType === "special_master" ? undefined : session?.universityCode || undefined
    const subjectScope = session?.accountType === "subject_admin" ? session.subjectCode : undefined
    const [fetchedTeachers, fetchedRooms] = await Promise.all([
      loadTeachers(universityScope, subjectScope, undefined),
      loadRooms(universityScope, undefined, testSessionId),
    ])
    setTeachers(Array.isArray(fetchedTeachers) ? fetchedTeachers : [])
    setRooms(Array.isArray(fetchedRooms) ? fetchedRooms : [])
  }

  return (
    // 2026-11-06 デザイン見直し: 一覧画面(1,280px)
    <PageContainer width="list">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <BackLink href="/admin/account-management" label="アカウント管理に戻る" />
            <h1 className="text-[28px] leading-tight font-bold text-primary">教員一覧</h1>
            <p className="text-muted-foreground">登録済み教員: {teachers.length}名</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={handleRefresh} variant="outline">
              <Search className="w-4 h-4 mr-2" />
              更新
            </Button>
            <Link href="/admin/account-management">
              <Button variant="default">
                <Edit className="w-4 h-4 mr-2" />
                教員登録
              </Button>
            </Link>
            {teachers.length > 0 && (
              <>
                <Button onClick={handleExportCSV} variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  CSV出力
                </Button>
                <Button onClick={handleDeleteAll} variant="destructive">
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  全削除
                </Button>
              </>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>検索・フィルタ</CardTitle>
            <CardDescription>氏名、メールアドレスで検索、教科でフィルタ</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={selectedSubjectFilter}
                onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                className="flex h-10 rounded-md border border-blue-500 bg-background px-3 py-2 text-sm"
              >
                <option value="all">全教科</option>
                {subjects.map((s) => (
                  <option key={s.subjectCode} value={s.subjectCode}>
                    {s.subjectName}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>教員データ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {accountType === "special_master" && <th className="text-left p-2">大学名</th>}
                    <th className="text-left p-2">氏名</th>
                    <th className="text-left p-2">メールアドレス（ログインID）</th>
                    <th className="text-left p-2">ログインパスワード</th>
                    <th className="text-left p-2">権限</th>
                    <th className="text-left p-2">担当教科</th>
                    <th className="text-left p-2">担当部屋番号</th>
                    <th className="text-center p-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeachers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={accountType === "special_master" ? 8 : 7}
                        className="text-center p-8 text-muted-foreground"
                      >
                        登録されている教員がいません
                      </td>
                    </tr>
                  ) : (
                    filteredTeachers.map((teacher) => {
                      const universityCode = teacher.universityCode || ""
                      const universityName = universities[universityCode] || "-"

                      return (
                        <tr key={teacher.id} className="border-b hover:bg-accent/50">
                          {accountType === "special_master" && <td className="p-2">{universityName}</td>}
                          <td className="p-2">{teacher.name}</td>
                          <td className="p-2">{teacher.email}</td>
                          <td className="p-2">{"********"}</td>
                          <td className="p-2">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                teacher.role === "master_admin"
                                  ? "bg-red-100 text-red-800"
                                  : teacher.role === "university_admin"
                                    ? "bg-blue-100 text-blue-800"
                                    : teacher.role === "subject_admin"
                                      ? "bg-orange-100 text-orange-800"
                                      : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {teacher.role === "master_admin" ? "マスター管理者" :
                               teacher.role === "university_admin" ? "大学管理者" :
                               teacher.role === "subject_admin" ? "教科管理者" : "一般"}
                            </span>
                          </td>
                          <td className="p-2">
                            {subjects.find((s) => s.subjectCode === teacher.subjectCode)?.subjectName || teacher.subjectCode || "-"}
                          </td>
                          <td className="p-2">
                            <span
                              className={
                                teacher.assignedRoomNumber && !isValidRoom(teacher.assignedRoomNumber)
                                  ? "text-red-600 font-bold"
                                  : ""
                              }
                            >
                              {teacher.assignedRoomNumber || "-"}
                              {teacher.assignedRoomNumber && !isValidRoom(teacher.assignedRoomNumber) && (
                                <AlertTriangle className="w-3 h-3 inline ml-1" />
                              )}
                            </span>
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex justify-center gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleEdit(teacher)}>
                                <Edit className="w-4 h-4 text-blue-600" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(teacher.id)}>
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {editingTeacher && (
        <Dialog open={!!editingTeacher} onOpenChange={() => setEditingTeacher(null)}>
          <DialogContent className="">
            <DialogHeader>
              <DialogTitle>教員情報の編集</DialogTitle>
              <DialogDescription>教員の登録情報を編集できます</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {accountType === "special_master" && (
                <div className="space-y-2">
                  <Label htmlFor="edit-university">大学名 *</Label>
                  {universitiesList.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      大学が登録されていません。先に大学マスターを登録してください。
                    </div>
                  ) : (
                    <select
                      id="edit-university"
                      value={editForm.university_code}
                      onChange={(e) => setEditForm({ ...editForm, university_code: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="">選択してください</option>
                      {universitiesList.map((uni) => (
                        <option key={uni.university_code} value={uni.university_code}>
                          {uni.university_name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="edit-name">氏名 *</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">メールアドレス（ログインID） *</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-password">ログインパスワード *</Label>
                <Input
                  id="edit-password"
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role">権限 *</Label>
                <select
                  id="edit-role"
                  className="flex h-10 w-full rounded-md border border-blue-500 bg-background px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as any })}
                  disabled={accountType !== "special_master" && accountType !== "university_master"}
                >
                  <option value="general">一般（教員ログインのみ）</option>
                  <option value="subject_admin">教科管理者（教科データの管理可能）</option>
                  {(accountType === "special_master" || accountType === "university_master") && (
                    <option value="university_admin">大学管理者（大学内全データ管理）</option>
                  )}
                  {accountType === "special_master" && (
                    <option value="master_admin">マスター管理者（全権限）</option>
                  )}
                </select>
                <p className="text-xs text-muted-foreground">
                  {accountType === "special_master" || accountType === "university_master"
                    ? "権限を選択してください"
                    : "権限の変更はマスター管理者または大学管理者のみ可能です"}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-room">担当部屋番号</Label>
                {rooms.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    部屋が登録されていません。先に部屋マスターを登録してください。
                  </div>
                ) : (
                  <select
                    id="edit-room"
                    value={editForm.assignedRoomNumber}
                    onChange={(e) => setEditForm({ ...editForm, assignedRoomNumber: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">未設定</option>
                    {rooms.map((room) => (
                      <option key={room.roomNumber} value={room.roomNumber}>
                        {room.roomNumber} - {room.roomName}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-xs text-muted-foreground">
                  部屋の割当は試験セッションごとの「割当管理」画面でも設定できます
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-subject">
                  担当教科{editForm.role === "subject_admin" ? " *" : ""}
                </Label>
                <select
                  id="edit-subject"
                  value={editForm.subjectCode}
                  onChange={(e) => setEditForm({ ...editForm, subjectCode: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-blue-500 bg-background px-3 py-2 text-sm"
                >
                  <option value="">未設定</option>
                  {subjects.map((s) => (
                    <option key={s.subjectCode} value={s.subjectCode}>
                      {s.subjectName}
                    </option>
                  ))}
                </select>
                {editForm.role === "subject_admin" && (
                  <p className="text-xs text-muted-foreground">教科管理者は担当教科の選択が必須です</p>
                )}
              </div>

            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingTeacher(null)}>
                キャンセル
              </Button>
              <Button onClick={handleSaveEdit}>保存</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PageContainer>
  )
}
