"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Home, UserPlus, Upload, Download, Trash2, ArrowLeft, Search, Users } from "lucide-react"
import { saveStudents, loadStudents, loadRooms, loadSubjects, deleteStudent, type Student, type Room, type Subject } from "@/lib/data-storage"
import { useSession } from "@/lib/auth/use-session"
import { readCsvFile, csvDownloadBlob } from "@/lib/csv"

export function StudentRegistration() {
  const router = useRouter()
  const [students, setStudents] = useState<Student[]>([])
  const [rooms, setRooms] = useState<Room[]>([]) // Add rooms state
  const [isLoading, setIsLoading] = useState(true)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [formData, setFormData] = useState({
    name: "",
    studentId: "",
    attendanceNumber: "",
    email: "",
    department: "",
    grade: "",
    roomNumber: "",
    university_code: "",
    subjectCode: "",
  })
  const [isDragging, setIsDragging] = useState(false)
  const [accountType, setAccountType] = useState<string>("")
  const [universities, setUniversities] = useState<Record<string, string>>({})

  // Phase 9b-β2d: sessionStorage("accountType") を useSession() に置換
  const { session, isLoading: isSessionLoading } = useSession()

  // ADR-004 Phase B-2-d: 過去学生から登録 (bulk assign from canonical) 用 state
  const [canonicalSearchUniversity, setCanonicalSearchUniversity] = useState<string>("")
  const [canonicalSearchGrade, setCanonicalSearchGrade] = useState<string>("all")
  const [canonicalSearchSubject, setCanonicalSearchSubject] = useState<string>("all")
  const [canonicalTargetRoom, setCanonicalTargetRoom] = useState<string>("")
  const [canonicalStudents, setCanonicalStudents] = useState<Student[]>([])
  const [selectedCanonicalIds, setSelectedCanonicalIds] = useState<Set<string>>(new Set())
  const [searchingCanonical, setSearchingCanonical] = useState(false)
  const [importingCanonical, setImportingCanonical] = useState(false)
  const [canonicalImportResult, setCanonicalImportResult] = useState<{ imported: number; skipped: number } | null>(null)

  useEffect(() => {
    if (isSessionLoading || !session) return
    const loadData = async () => {
      setIsLoading(true)
      try {
        const accountType = session.accountType || ""
        setAccountType(accountType as any)

        try {
          const response = await fetch("/api/universities")

          if (response.ok) {
            const data = await response.json()

            const universityMap: Record<string, string> = {}
            if (Array.isArray(data)) {
              data.forEach((uni: any) => {
                universityMap[uni.university_code] = uni.university_name
              })
            }
            setUniversities(universityMap)
          } else {
            const errorText = await response.text()
          }
        } catch (error) {
        }

        // 2026-05-20 熊木さん指摘: 学生登録画面では canonical 全件 (自大学) を表示。
        // testSessionId フィルタは外す (sessionStorage 依存で挙動が読めなくなる)。
        // Phase 9 Y-2: subject_admin は自教科のみロード (保存時 Y-2 403 回避)
        const universityScope =
          session.accountType === "special_master" ? undefined : session.universityCode || undefined
        const subjectScope = session.accountType === "subject_admin" ? session.subjectCode : undefined
        const [studentsData, roomsData, subjectsData] = await Promise.all([
          loadStudents(universityScope, subjectScope, undefined),
          loadRooms(universityScope, undefined, undefined),
          loadSubjects(),
        ])
        setSubjects(Array.isArray(subjectsData) ? subjectsData : [])
        setStudents(Array.isArray(studentsData) ? studentsData : [])
        setRooms(Array.isArray(roomsData) ? roomsData : [])

        // ADR-004 Phase B-2-d: 過去学生から登録タブの初期フィルタを session 文脈から設定
        if (session.universityCode) setCanonicalSearchUniversity(session.universityCode)
        if (session.accountType === "subject_admin" && session.subjectCode) {
          setCanonicalSearchSubject(session.subjectCode)
        }
      } catch (error) {
        setStudents([])
        setRooms([])
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [session, isSessionLoading])

  const handleAddStudent = async () => {
    if (!formData.name || !formData.studentId || !formData.department || !formData.roomNumber) {
      alert("学籍番号、氏名、学部・学科、部屋番号は必須です")
      return
    }

    const roomExists = rooms.some((r) => r.roomNumber === formData.roomNumber)
    if (!roomExists) {
      alert("選択された部屋番号が部屋マスターに存在しません")
      return
    }

    // 2026-05-20 熊木さん指摘: 「追加」ボタンが旧仕様ではローカル state 追加だけで
    // 「登録を確定」ボタンを押さないと DB に反映されない 2 段階フローだった。
    // 確定ボタンの押し忘れで「登録したのに一覧に出ない」混乱が起きるため即時保存に変更。
    // 2026-11-05 出席番号の重複チェック(警告のみ・登録は通す)
    const enteredAttendance = formData.attendanceNumber.trim()
    const dupStudent = enteredAttendance
      ? students.find((s) => (s.attendanceNumber || "").trim() === enteredAttendance)
      : undefined

    const newStudent: Student = {
      id: crypto.randomUUID(),
      studentId: formData.studentId,
      name: formData.name,
      email: formData.email || undefined,
      department: formData.department,
      grade: formData.grade || undefined,
      attendanceNumber: formData.attendanceNumber || undefined,
      roomNumber: formData.roomNumber,
      universityCode: formData.university_code,
      testSessionId: "",
      createdAt: new Date().toISOString(),
    }

    try {
      await saveStudents([newStudent])
      setStudents([...students, newStudent])
      setFormData({ name: "", studentId: "", attendanceNumber: "", email: "", department: "", grade: "", roomNumber: "", university_code: "", subjectCode: "" })
      alert(
        `${newStudent.name} を登録しました` +
          (dupStudent
            ? `\n\n⚠️ 出席番号 ${enteredAttendance} は ${dupStudent.name} さんと重複しています(登録は完了しています)。`
            : ""),
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[student-registration] handleAddStudent failed:", msg, e)
      alert(`学生の登録に失敗しました: ${msg}`)
    }
  }

  const handleDeleteStudent = async (id: string) => {
    if (!confirm("この学生を削除しますか?")) return
    try {
      await deleteStudent(id)
      setStudents(students.filter((s) => s.id !== id))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[student-registration] handleDeleteStudent failed:", msg, e)
      alert(`学生の削除に失敗しました: ${msg}`)
    }
  }

  const parseCSV = async (text: string) => {
    const lines = text.split("\n").filter((line) => line.trim())
    const newStudents: Student[] = []
    const invalidRooms: string[] = []
    // 2026-05-20 副田さん仕様: 通常ユーザーは大学コード列なし (自大学強制)、
    // special_master のみ CSV に大学コード列を含む。
    const isSpecialMasterUser = accountType === "special_master"

    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(",").map((s) => s.trim())
      const [studentId, name, email, department, grade, roomNumber] = columns
      // 2026-11-05 出席番号を末尾列に追加。special_master は [..,部屋番号,大学コード,出席番号]、
      //   通常ユーザーは [..,部屋番号,出席番号]。
      const university_code = isSpecialMasterUser ? columns[6] || "" : ""
      const attendanceNumber = isSpecialMasterUser ? columns[7] || "" : columns[6] || ""
      if (studentId && name && department && roomNumber) {
        const roomExists = rooms.some((r) => r.roomNumber === roomNumber)
        if (!roomExists) {
          invalidRooms.push(roomNumber)
        }

        const universityCode = isSpecialMasterUser
          ? university_code || ""
          : session?.universityCode || ""

        newStudents.push({
          id: crypto.randomUUID(),
          studentId,
          name,
          email: email || undefined,
          department,
          grade: grade || undefined,
          attendanceNumber: attendanceNumber || undefined,
          roomNumber,
          universityCode,
          testSessionId: "",
          createdAt: new Date().toISOString(),
        })
      }
    }

    if (newStudents.length === 0) {
      alert("CSV から有効な学生データが読み取れませんでした(ヘッダー行のみ等)")
      return
    }

    // 2026-05-20 熊木さん指摘: CSV 一括も即時保存に変更 (確定ボタン押し忘れ防止)
    try {
      await saveStudents(newStudents)
      setStudents([...students, ...newStudents])
      if (invalidRooms.length > 0) {
        alert(
          `${newStudents.length}名の学生を登録しました\n\n警告: 以下の部屋番号が部屋マスターに存在しません:\n${[...new Set(invalidRooms)].join(", ")}\n\n部屋マスターに登録後、学生一覧から修正してください。`,
        )
      } else {
        alert(`${newStudents.length}名の学生を登録しました`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[student-registration] parseCSV save failed:", msg, e)
      alert(`CSV 一括登録に失敗しました: ${msg}`)
    }
  }

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // 2026-05-20 副田さん報告: Shift-JIS 自動判定
    try {
      const text = await readCsvFile(file)
      await parseCSV(text)
    } catch (err) {
      alert(err instanceof Error ? err.message : "CSV ファイルの読み込みに失敗しました")
    }
    event.target.value = ""
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file && file.name.endsWith(".csv")) {
      try {
        const text = await readCsvFile(file)
        parseCSV(text)
      } catch (err) {
        alert(err instanceof Error ? err.message : "CSV ファイルの読み込みに失敗しました")
      }
    } else {
      alert("CSVファイルをアップロードしてください")
    }
  }

  const handleFileSelectClick = () => {
    document.getElementById("csv-upload")?.click()
  }

  const handleExportCSV = () => {
    let csvContent
    if (accountType === "special_master") {
      csvContent =
        "No.,学籍番号,出席番号,大学名,氏名,メールアドレス,学部・学科,学年,部屋番号\n" +
        students
          .map(
            (s, index) =>
              `${index + 1},${s.studentId},${s.attendanceNumber || ""},${universities[s.universityCode || ""] || ""},${s.name},${s.email || ""},${s.department},${s.grade || ""},${s.roomNumber}`,
          )
          .join("\n")
    } else {
      csvContent =
        "No.,学籍番号,出席番号,氏名,メールアドレス,学部・学科,学年,部屋番号\n" +
        students
          .map(
            (s, index) =>
              `${index + 1},${s.studentId},${s.attendanceNumber || ""},${s.name},${s.email || ""},${s.department},${s.grade || ""},${s.roomNumber}`,
          )
          .join("\n")
    }

    const blob = csvDownloadBlob(csvContent)
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `学生一覧_${new Date().toISOString().split("T")[0]}.csv`
    link.click()
  }

  const handleDownloadTemplate = () => {
    // 2026-05-20 副田さん仕様: special_master のみ大学コード列あり、通常ユーザーはなし
    const template =
      accountType === "special_master"
        ? "学籍番号,氏名,メールアドレス,学部・学科,学年,部屋番号,大学コード,出席番号\n2024001,山田太郎,yamada@example.com,医学部医学科,4年,1,dentshowa,12\n2024002,佐藤花子,,看護学部看護学科,5年,2,kanagawadent,13"
        : "学籍番号,氏名,メールアドレス,学部・学科,学年,部屋番号,出席番号\n2024001,山田太郎,yamada@example.com,医学部医学科,4年,1,12\n2024002,佐藤花子,,看護学部看護学科,5年,2,13"
    const blob = csvDownloadBlob(template)
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = "学生登録テンプレート.csv"
    link.click()
  }

  // ADR-004 Phase B-2-d: 過去学生から条件で絞って bulk assign する一連のハンドラ
  // 既存の testSessionId 範囲の students をベースに「すでに今セッションに登録済み」を識別する
  const alreadyAssignedIds = new Set(students.map((s) => s.id))

  const selectableCanonicalIds = canonicalStudents
    .filter((s) => !alreadyAssignedIds.has(s.id))
    .map((s) => s.id)
  const allSelectableSelected =
    selectableCanonicalIds.length > 0 &&
    selectableCanonicalIds.every((id) => selectedCanonicalIds.has(id))

  const handleSearchCanonicalStudents = async () => {
    setSearchingCanonical(true)
    setCanonicalImportResult(null)
    try {
      const univ = canonicalSearchUniversity || undefined
      const subj = canonicalSearchSubject === "all" ? undefined : canonicalSearchSubject || undefined
      const grade = canonicalSearchGrade === "all" ? undefined : canonicalSearchGrade || undefined
      // testSessionId は undefined → canonical な学生一覧 (B-2-b 経路)
      const data = await loadStudents(univ, subj, undefined, grade)
      setCanonicalStudents(Array.isArray(data) ? data : [])
      setSelectedCanonicalIds(new Set())
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      console.error("[student-registration] canonical search failed:", msg, error)
      alert(`過去学生の検索に失敗しました: ${msg}`)
    } finally {
      setSearchingCanonical(false)
    }
  }

  const toggleCanonicalStudent = (id: string, checked: boolean) => {
    setSelectedCanonicalIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleCanonicalAll = (checked: boolean) => {
    setSelectedCanonicalIds(checked ? new Set(selectableCanonicalIds) : new Set())
  }

  const handleBulkImportCanonical = async () => {
    if (selectedCanonicalIds.size === 0) {
      alert("登録する学生を選択してください")
      return
    }
    if (!canonicalTargetRoom) {
      alert("登録先の部屋番号を選択してください")
      return
    }
    const testSessionId = sessionStorage.getItem("testSessionId") || ""
    if (!testSessionId) {
      alert("試験セッションが選択されていません。試験セッションを選んでから再度お試しください。")
      return
    }

    setImportingCanonical(true)
    try {
      // 選択された canonical 学生を、現在のテストセッション + 指定された部屋に bulk assign
      // すでに alreadyAssignedIds に入っているものは UI 側で disable しているので含まれない想定だが、
      // 念のため再度フィルタしてスキップ件数を計算する
      const selected = canonicalStudents.filter((s) => selectedCanonicalIds.has(s.id))
      const toImport = selected.filter((s) => !alreadyAssignedIds.has(s.id))
      const skipped = selected.length - toImport.length

      const items = toImport.map((s) => ({
        ...s,
        roomNumber: canonicalTargetRoom,
        testSessionId,
      }))
      if (items.length > 0) {
        await saveStudents(items)
      }
      setCanonicalImportResult({ imported: items.length, skipped })

      // 既存 students リストを再ロードして「すでに登録済み」マーカーを更新
      const subjectScope = session?.accountType === "subject_admin" ? session?.subjectCode : undefined
      const refreshed = await loadStudents(undefined, subjectScope, testSessionId)
      setStudents(Array.isArray(refreshed) ? refreshed : [])
      setSelectedCanonicalIds(new Set())
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      console.error("[student-registration] canonical bulk import failed:", msg, error)
      alert(`学生の bulk 登録に失敗しました: ${msg}`)
    } finally {
      setImportingCanonical(false)
    }
  }

  // 2026-05-20 熊木さん指摘により handleConfirmRegistration / 「登録を確定」ボタンは撤去。
  // 「学生を追加」「CSV 取込」時に即時保存するようになった。

  if (isLoading) {
    return (
      <div className="min-h-screen bg-secondary/30 p-4 md:p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-semibold">読み込み中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-secondary/30 p-4 md:p-8">
      {(() => {  return null })()}
      <div className="mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-primary">学生登録</h1>
            <p className="text-muted-foreground">受験者情報を登録・管理</p>
            <p className="text-xs mt-1 px-2 py-1 rounded bg-green-50 border border-green-200 text-green-800 inline-block">
              ✅ 「学生を追加」「CSV 取込」は即時保存されます(確定ボタン不要)。
            </p>
          </div>
          <div className="flex gap-2">
            {accountType === "special_master" && (
              <Link href="/admin/account-management">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  戻る
                </Button>
              </Link>
            )}
            <Link href="/admin/dashboard">
              <Button variant="outline" size="sm">
                <Home className="mr-2 h-4 w-4" />
                ダッシュボード
              </Button>
            </Link>
          </div>
        </div>

        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="manual">手動登録</TabsTrigger>
            <TabsTrigger value="csv">CSV一括登録</TabsTrigger>
            <TabsTrigger value="canonical">過去学生から登録</TabsTrigger>
          </TabsList>

          {/* Manual Registration */}
          <TabsContent value="manual">
            <Card>
              <CardHeader>
                <CardTitle>学生情報入力</CardTitle>
                <CardDescription>1名ずつ手動で学生情報を登録できます</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="studentId">学籍番号 *</Label>
                    <Input
                      id="studentId"
                      placeholder="2024001"
                      value={formData.studentId}
                      onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="attendanceNumber">出席番号（任意）</Label>
                    <Input
                      id="attendanceNumber"
                      placeholder="例: 12（学年で変わる）"
                      value={formData.attendanceNumber}
                      onChange={(e) => setFormData({ ...formData, attendanceNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">氏名 *</Label>
                    <Input
                      id="name"
                      placeholder="山田太郎"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">メールアドレス（任意）</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="student@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department">学部・学科 *</Label>
                    <Input
                      id="department"
                      placeholder="医学部医学科"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="grade">学年</Label>
                    <Input
                      id="grade"
                      placeholder="例: 4年"
                      value={formData.grade}
                      onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="roomNumber">部屋番号 *</Label>
                    {rooms.length === 0 ? (
                      <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
                        部屋が登録されていません。先に部屋マスターで部屋を登録してください。
                      </div>
                    ) : (
                      <select
                        id="roomNumber"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        value={formData.roomNumber}
                        onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
                      >
                        <option value="">部屋を選択してください</option>
                        {rooms.map((room) => (
                          <option key={room.id} value={room.roomNumber}>
                            {room.roomNumber} - {room.roomName}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subjectCode">教科</Label>
                    <select
                      id="subjectCode"
                      className="flex h-10 w-full rounded-md border border-blue-500 bg-background px-3 py-2 text-sm"
                      value={formData.subjectCode}
                      onChange={(e) => setFormData({ ...formData, subjectCode: e.target.value })}
                    >
                      <option value="">選択してください</option>
                      {subjects.map((s) => (
                        <option key={s.subjectCode} value={s.subjectCode}>
                          {s.subjectName}
                        </option>
                      ))}
                    </select>
                  </div>
                  {accountType === "special_master" && (
                    <div className="grid gap-2">
                      <Label htmlFor="university">大学</Label>
                      <select
                        id="university"
                        value={formData.university_code}
                        onChange={(e) => setFormData({ ...formData, university_code: e.target.value })}
                        className="flex h-10 w-full rounded-md border border-blue-500 bg-background px-3 py-2 text-sm"
                        required
                      >
                        <option value="">選択してください</option>
                        {Object.entries(universities).map(([code, name]) => (
                          <option key={code} value={code}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <Button onClick={handleAddStudent} className="w-full" size="lg" disabled={rooms.length === 0}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  学生を追加
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CSV Upload */}
          <TabsContent value="csv">
            <Card>
              <CardHeader>
                <CardTitle>CSV一括登録</CardTitle>
                <CardDescription>CSVファイルから複数の学生を一度に登録できます</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-4">
                  <Button onClick={handleDownloadTemplate} variant="outline" size="lg">
                    <Download className="w-4 h-4 mr-2" />
                    CSVテンプレートをダウンロード
                  </Button>

                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                      isDragging ? "border-primary bg-primary/5" : "border-gray-200"
                    }`}
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <div className="text-lg font-semibold mb-2">CSVファイルをアップロード</div>
                    <div className="text-sm text-muted-foreground mb-4">
                      クリックしてファイルを選択、またはドラッグ&ドロップ
                    </div>
                    <Input id="csv-upload" type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
                    <Button type="button" variant="secondary" onClick={handleFileSelectClick}>
                      ファイルを選択
                    </Button>
                  </div>

                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm font-semibold mb-2">CSV形式の例：</p>
                    <pre className="text-xs bg-background p-3 rounded overflow-x-auto">
                      {accountType === "special_master" ? (
                        <>
                          学籍番号,氏名,メールアドレス,学部・学科,学年,部屋番号,大学コード,出席番号{"\n"}
                          2024001,山田太郎,yamada@example.com,医学部医学科,4年,1,dentshowa,12{"\n"}
                          2024002,佐藤花子,,看護学部看護学科,5年,2,kanagawadent,13
                        </>
                      ) : (
                        <>
                          学籍番号,氏名,メールアドレス,学部・学科,学年,部屋番号,出席番号{"\n"}
                          2024001,山田太郎,yamada@example.com,医学部医学科,4年,1,12{"\n"}
                          2024002,佐藤花子,,看護学部看護学科,5年,2,13
                        </>
                      )}
                    </pre>
                    {accountType !== "special_master" && (
                      <p className="text-xs text-muted-foreground mt-2">
                        ※ ログイン中の大学 (
                        <span className="font-mono">{session?.universityCode || "-"}</span>
                        ) に自動的に紐付きます
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ADR-004 Phase B-2-d: 過去学生から登録 (canonical な students テーブルから絞り込んで bulk assign) */}
          <TabsContent value="canonical">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  過去学生から登録
                </CardTitle>
                <CardDescription>
                  以前に登録された学生を、大学・学年・教科で絞り込み、現在の試験セッションに一括で登録できます。
                  すでに現在の試験セッションに登録済みの学生はグレー表示になり、自動的に除外されます。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* フィルタ */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">大学</Label>
                    {accountType === "special_master" ? (
                      <Select
                        value={canonicalSearchUniversity || "all"}
                        onValueChange={(v) => setCanonicalSearchUniversity(v === "all" ? "" : v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="すべて" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">すべて</SelectItem>
                          {Object.entries(universities).map(([code, name]) => (
                            <SelectItem key={code} value={code}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center h-9 px-3 bg-muted rounded-md text-sm">
                        {universities[canonicalSearchUniversity] || canonicalSearchUniversity || "未設定"}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">学年</Label>
                    <Select value={canonicalSearchGrade} onValueChange={setCanonicalSearchGrade}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">すべて</SelectItem>
                        <SelectItem value="1年">1年</SelectItem>
                        <SelectItem value="2年">2年</SelectItem>
                        <SelectItem value="3年">3年</SelectItem>
                        <SelectItem value="4年">4年</SelectItem>
                        <SelectItem value="5年">5年</SelectItem>
                        <SelectItem value="6年">6年</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">教科</Label>
                    {accountType === "subject_admin" ? (
                      <div className="flex items-center h-9 px-3 bg-muted rounded-md text-sm">
                        {subjects.find((s) => s.subjectCode === canonicalSearchSubject)?.subjectName ||
                          canonicalSearchSubject ||
                          "未設定"}
                      </div>
                    ) : (
                      <Select value={canonicalSearchSubject} onValueChange={setCanonicalSearchSubject}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">すべて</SelectItem>
                          {subjects.map((s) => (
                            <SelectItem key={s.subjectCode} value={s.subjectCode}>
                              {s.subjectName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSearchCanonicalStudents} disabled={searchingCanonical}>
                    <Search className="w-4 h-4 mr-2" />
                    {searchingCanonical ? "検索中..." : "検索"}
                  </Button>
                </div>

                {/* 検索結果 */}
                {canonicalStudents.length > 0 && (
                  <div className="space-y-3 border-t pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={allSelectableSelected}
                          onCheckedChange={(v) => toggleCanonicalAll(Boolean(v))}
                          disabled={selectableCanonicalIds.length === 0}
                        />
                        <span>
                          全選択 ({selectedCanonicalIds.size} / {selectableCanonicalIds.length} 名選択中)
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        該当 {canonicalStudents.length} 名(うち登録済み{" "}
                        {canonicalStudents.length - selectableCanonicalIds.length} 名)
                      </div>
                    </div>

                    <div className="border rounded-md max-h-96 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted">
                          <tr>
                            <th className="w-10 p-2"></th>
                            <th className="p-2 text-left">学籍番号</th>
                            <th className="p-2 text-left">氏名</th>
                            <th className="p-2 text-left">学年</th>
                            <th className="p-2 text-left">教科</th>
                            <th className="p-2 text-left">状態</th>
                          </tr>
                        </thead>
                        <tbody>
                          {canonicalStudents.map((s) => {
                            const isAssigned = alreadyAssignedIds.has(s.id)
                            const subjName =
                              subjects.find((sub) => sub.subjectCode === s.subjectCode)?.subjectName ||
                              s.subjectCode ||
                              "—"
                            return (
                              <tr
                                key={s.id}
                                className={isAssigned ? "bg-muted/30 text-muted-foreground" : "hover:bg-muted/20"}
                              >
                                <td className="p-2">
                                  <Checkbox
                                    checked={selectedCanonicalIds.has(s.id)}
                                    disabled={isAssigned}
                                    onCheckedChange={(v) => toggleCanonicalStudent(s.id, Boolean(v))}
                                  />
                                </td>
                                <td className="p-2 font-mono">{s.studentId}</td>
                                <td className="p-2">{s.name}</td>
                                <td className="p-2">{s.grade || "—"}</td>
                                <td className="p-2">{subjName}</td>
                                <td className="p-2">
                                  {isAssigned ? (
                                    <span className="text-xs px-2 py-0.5 rounded bg-gray-200">登録済</span>
                                  ) : (
                                    <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">未登録</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* 部屋指定 + 一括登録 */}
                    <div className="flex flex-wrap items-end justify-between gap-3 pt-2 border-t">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">登録先 部屋番号</Label>
                        <Select value={canonicalTargetRoom} onValueChange={setCanonicalTargetRoom}>
                          <SelectTrigger className="h-9 w-48">
                            <SelectValue placeholder="部屋を選択" />
                          </SelectTrigger>
                          <SelectContent>
                            {rooms.map((r) => (
                              <SelectItem key={r.id} value={r.roomNumber}>
                                {r.roomNumber} - {r.roomName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        size="lg"
                        className="bg-primary hover:bg-primary/90"
                        onClick={handleBulkImportCanonical}
                        disabled={
                          importingCanonical ||
                          selectedCanonicalIds.size === 0 ||
                          !canonicalTargetRoom
                        }
                      >
                        <UserPlus className="w-4 h-4 mr-2" />
                        {importingCanonical
                          ? "登録中..."
                          : `選択した ${selectedCanonicalIds.size} 名を登録`}
                      </Button>
                    </div>

                    {canonicalImportResult && (
                      <div className="p-3 rounded-md bg-green-50 text-sm border border-green-200">
                        ✅ {canonicalImportResult.imported} 名を登録しました
                        {canonicalImportResult.skipped > 0 && (
                          <span className="text-muted-foreground ml-2">
                            (すでに登録済みの {canonicalImportResult.skipped} 名はスキップ)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!searchingCanonical && canonicalStudents.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    条件を指定して「検索」ボタンを押してください
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Student List */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>登録済み学生</CardTitle>
                <CardDescription>
                  現在 {students.length} 名が登録されています(追加・CSV 取込は即時保存されます)
                </CardDescription>
              </div>
              {students.length > 0 && (
                <Button onClick={handleExportCSV} variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  CSV出力
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">学生が登録されていません</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      {accountType === "special_master" && <th className="text-left p-3 font-semibold">大学名</th>}
                      <th className="text-left p-3 font-semibold">学籍番号</th>
                      <th className="text-left p-3 font-semibold">出席番号</th>
                      <th className="text-left p-3 font-semibold">氏名</th>
                      <th className="text-left p-3 font-semibold">メールアドレス</th>
                      <th className="text-left p-3 font-semibold">学部・学科</th>
                      <th className="text-left p-3 font-semibold">部屋番号</th>
                      <th className="text-center p-3 font-semibold">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...students]
                      .sort((a, b) => {
                        // 2026-11-05 出席番号順(数値優先、空欄は末尾)、同値は学籍番号順
                        const aa = (a.attendanceNumber || "").trim()
                        const bb = (b.attendanceNumber || "").trim()
                        if (aa && bb) {
                          const na = Number.parseInt(aa, 10)
                          const nb = Number.parseInt(bb, 10)
                          if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
                          if (aa !== bb) return aa.localeCompare(bb)
                        } else if (aa && !bb) return -1
                        else if (!aa && bb) return 1
                        return (a.studentId || "").localeCompare(b.studentId || "")
                      })
                      .map((student) => (
                      <tr key={student.id} className="border-b hover:bg-muted/50">
                        {accountType === "special_master" && (
                          <td className="p-3">{universities[student.universityCode || ""] || "-"}</td>
                        )}
                        <td className="p-3 font-medium">{student.studentId}</td>
                        <td className="p-3">{student.attendanceNumber || "-"}</td>
                        <td className="p-3">{student.name}</td>
                        <td className="p-3">{student.email || "-"}</td>
                        <td className="p-3">{student.department}</td>
                        <td className="p-3">部屋 {student.roomNumber}</td>
                        <td className="p-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteStudent(student.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2026-05-20 熊木さん指摘: 「登録を確定」ボタンは押し忘れの原因だったため
            撤去。「学生を追加」「CSV 取込」時に即時保存される仕様に変更。 */}
      </div>
    </div>
  )
}
