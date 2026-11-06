"use client"

import { useState, useEffect } from "react"
import { PageContainer } from "@/components/page-container"
import { BackLink } from "@/components/back-link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Download, Trash2, Search, Edit, AlertTriangle } from "lucide-react"
import { loadStudents, saveStudents, loadRooms, loadSubjects, deleteStudent, type Student, type Subject } from "@/lib/data-storage"
import { updateStudent } from "@/lib/api/students"
import { useSession } from "@/lib/auth/use-session"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

export default function StudentsListPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [rooms, setRooms] = useState<Array<{ roomNumber: string; roomName: string }>>([])
  const [accountType, setAccountType] = useState<string>("")
  const [universities, setUniversities] = useState<Record<string, string>>({})
  const [universitiesList, setUniversitiesList] = useState<Array<{ university_code: string; university_name: string }>>(
    [],
  )
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("all")
  const [editForm, setEditForm] = useState({
    studentId: "",
    name: "",
    email: "",
    department: "",
    grade: "",
    roomNumber: "",
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

      // 2026-05-19: 学生一覧も canonical 全件取得 (未割当の学生も含む)
      const testSessionId = sessionStorage.getItem("testSessionId") || ""
      // 2026-05-20 副田さん指摘: 大学スコープは維持。special_master のみ全大学。
      const universityScope =
        session.accountType === "special_master" ? undefined : session.universityCode || undefined
      // 案 Y: subject_admin は自教科のみ表示
      const subjectScope = session.accountType === "subject_admin" ? session.subjectCode : undefined
      const [fetchedStudents, fetchedRooms, fetchedSubjects] = await Promise.all([
        loadStudents(universityScope, subjectScope, undefined),
        loadRooms(universityScope, undefined, testSessionId),
        loadSubjects(),
      ])
      setStudents(Array.isArray(fetchedStudents) ? fetchedStudents : [])
      setRooms(Array.isArray(fetchedRooms) ? fetchedRooms : [])
      setSubjects(Array.isArray(fetchedSubjects) ? fetchedSubjects : [])
    }
    fetchData()
  }, [session, isSessionLoading])

  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.studentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.roomNumber.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesSubject = selectedSubjectFilter === "all" || (s as any).subjectCode === selectedSubjectFilter
    return matchesSearch && matchesSubject
  })

  const handleEdit = (student: Student) => {
    setEditingStudent(student)
    setEditForm({
      studentId: student.studentId,
      name: student.name,
      email: student.email || "",
      department: student.department,
      grade: student.grade || "",
      roomNumber: student.roomNumber,
      university_code: student.universityCode || "",
      subjectCode: student.subjectCode || "",
    })
  }

  const handleSaveEdit = async () => {
    if (!editingStudent) return

    // 2026-05-08: id ベースの PATCH に切替(register_student_canonical の
    // ON CONFLICT (univ, student_id) で student_id 変更時に旧行が orphan に
    // なるバグ回避)。roomNumber は assignment 経由なので、変更があれば
    // saveStudents を別途呼んで junction を更新する。
    const testSessionId = sessionStorage.getItem("testSessionId") || ""
    const roomChanged = editForm.roomNumber !== editingStudent.roomNumber
    try {
      const updatedCanonical = await updateStudent(editingStudent.id, {
        studentId: editForm.studentId,
        name: editForm.name,
        email: editForm.email,
        department: editForm.department,
        grade: editForm.grade || undefined,
        universityCode: editForm.university_code,
        // subjectCode は edit form に項目が無いのでそのまま
      })
      // roomNumber 変更がある場合のみ assignment を upsert する
      if (roomChanged && testSessionId) {
        await saveStudents([
          {
            ...editingStudent,
            ...updatedCanonical,
            roomNumber: editForm.roomNumber,
            testSessionId,
          },
        ])
      }
      setStudents((prev) =>
        prev.map((s) =>
          s.id === editingStudent.id
            ? { ...s, ...updatedCanonical, roomNumber: editForm.roomNumber }
            : s,
        ),
      )
      setEditingStudent(null)
      alert("学生情報を更新しました")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error"
      console.error("[students-list] handleSaveEdit failed:", msg, e)
      alert(`学生情報の更新に失敗しました: ${msg}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("この学生を削除しますか？")) return
    // 2026-05-08: 旧実装は saveStudents(filtered) に頼っており、
    // register_student_canonical は upsert なので削除できていなかった。
    try {
      await deleteStudent(id)
      setStudents((prev) => prev.filter((s) => s.id !== id))
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error"
      console.error("[students-list] handleDelete failed:", msg, e)
      alert(`学生の削除に失敗しました: ${msg}`)
    }
  }

  const handleResetAllData = async () => {
    if (!confirm("全ての学生データを削除しますか？この操作は取り消せません。")) return
    // 2026-05-08: saveStudents([]) は no-op upsert で削除されない為、
    // 1 件ずつ DELETE /api/students/[id] を呼ぶ。
    const targets = [...students]
    let failed = 0
    const reasons: string[] = []
    for (const s of targets) {
      try {
        await deleteStudent(s.id)
      } catch (e) {
        failed++
        const msg = e instanceof Error ? e.message : String(e)
        reasons.push(`${s.studentId || s.id}: ${msg}`)
      }
    }
    if (failed === 0) {
      setStudents([])
      alert("全ての学生データを削除しました")
    } else {
      // 失敗分は残るので表示と DB を一致させる
      setStudents((prev) => prev.filter((s) => reasons.some((r) => r.startsWith(s.studentId || s.id))))
      alert(`${targets.length - failed} 件削除しましたが ${failed} 件失敗しました\n${reasons.slice(0, 5).join("\n")}`)
    }
  }

  const handleExportCSV = () => {
    const headers =
      accountType === "special_master"
        ? ["No.", "学籍番号", "大学名", "氏名", "メールアドレス", "学部・学科", "学年", "部屋番号"]
        : ["No.", "学籍番号", "氏名", "メールアドレス", "学部・学科", "学年", "部屋番号"]

    const rows = students.map((s, index) => {
      const baseRow = [
        (index + 1).toString(),
        s.studentId,
        ...(accountType === "special_master" ? [universities[s.universityCode || ""] || ""] : []),
        s.name,
        s.email || "",
        s.department,
        s.grade || "",
        s.roomNumber,
      ]
      return baseRow
    })

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n")

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `students_${new Date().toISOString().split("T")[0]}.csv`
    link.click()
  }

  const isValidRoom = (roomNumber: string) => {
    return rooms.some((r) => r.roomNumber === roomNumber)
  }

  return (
    // 2026-11-06 デザイン見直し: 一覧画面(1,280px)
    <PageContainer width="list">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <BackLink href="/admin/account-management" label="アカウント管理に戻る" />
            <h1 className="text-3xl font-bold text-primary">学生一覧</h1>
            <p className="text-muted-foreground">登録済み学生: {students.length}名</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleExportCSV} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              CSV出力
            </Button>
            <Button onClick={handleResetAllData} variant="destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              全削除
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>検索</CardTitle>
            <CardDescription>学生ID、氏名、部屋番号で検索</CardDescription>
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
            <CardTitle>学生データ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">No.</th>
                    <th className="text-left p-2">学籍番号</th>
                    {accountType === "special_master" && <th className="text-left p-2">大学名</th>}
                    <th className="text-left p-2">氏名</th>
                    <th className="text-left p-2">メールアドレス</th>
                    <th className="text-left p-2">学部・学科</th>
                    <th className="text-left p-2">学年</th>
                    <th className="text-left p-2">部屋番号</th>
                    <th className="text-center p-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td
                        colSpan={accountType === "special_master" ? 8 : 7}
                        className="text-center p-8 text-muted-foreground"
                      >
                        登録されている学生がいません
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((student, index) => {
                      const universityCode = (student as any).university_code || (student as any).universityCode || ""
                      const universityName = universities[universityCode] || "-"

                      return (
                        <tr key={student.id} className="border-b hover:bg-accent/50">
                          <td className="p-2">{index + 1}</td>
                          <td className="p-2">{student.studentId}</td>
                          {accountType === "special_master" && <td className="p-2">{universityName}</td>}
                          <td className="p-2">{student.name}</td>
                          <td className="p-2">{student.email || "-"}</td>
                          <td className="p-2">{student.department || "-"}</td>
                          <td className="p-2">{student.grade || "-"}</td>
                          <td className="p-2">
                            <span className={!isValidRoom(student.roomNumber) ? "text-red-600 font-bold" : ""}>
                              {student.roomNumber}
                              {!isValidRoom(student.roomNumber) && <AlertTriangle className="w-3 h-3 inline ml-1" />}
                            </span>
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex gap-1 justify-center">
                              <Button variant="ghost" size="sm" onClick={() => handleEdit(student)}>
                                <Edit className="w-4 h-4 text-blue-600" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(student.id)}>
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

      <Dialog open={!!editingStudent} onOpenChange={() => setEditingStudent(null)}>
        <DialogContent className="sm:">
          <DialogHeader>
            <DialogTitle>学生情報の編集</DialogTitle>
            <DialogDescription>学生の登録情報を編集します</DialogDescription>
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
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
              <Label htmlFor="edit-studentId">学籍番号</Label>
              <Input
                id="edit-studentId"
                value={editForm.studentId}
                onChange={(e) => setEditForm({ ...editForm, studentId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">氏名</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">メールアドレス（任意）</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-department">学部・学科</Label>
              <Input
                id="edit-department"
                value={editForm.department}
                onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-grade">学年</Label>
              <Input
                id="edit-grade"
                placeholder="例: 4年"
                value={editForm.grade}
                onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-roomNumber">部屋番号</Label>
              {rooms.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  部屋が登録されていません。先に部屋マスターを登録してください。
                </div>
              ) : (
                <select
                  id="edit-roomNumber"
                  value={editForm.roomNumber}
                  onChange={(e) => setEditForm({ ...editForm, roomNumber: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">選択してください</option>
                  {rooms.map((room) => (
                    <option key={room.roomNumber} value={room.roomNumber}>
                      {room.roomNumber} - {room.roomName}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStudent(null)}>
              キャンセル
            </Button>
            <Button onClick={handleSaveEdit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
