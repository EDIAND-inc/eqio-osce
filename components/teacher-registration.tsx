"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { PageContainer } from "@/components/page-container"
import { BackLink } from "@/components/back-link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UserPlus, Upload, Download, Trash2 } from "lucide-react"
import {
  saveTeachers,
  loadTeachers,
  loadRooms,
  loadSubjects,
  deleteTeacher,
  type Teacher,
  type TeacherRole,
  type Room,
  type Subject,
} from "@/lib/data-storage"
import { useSession } from "@/lib/auth/use-session"
import { readCsvFile, csvDownloadBlob } from "@/lib/csv"
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table"

export function TeacherRegistration() {
  const router = useRouter()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [accountType, setAccountType] = useState<string>("")
  const [universities, setUniversities] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "general" as TeacherRole,
    roomNumber: "",
    university_code: "", // Add university_code to formData
    subjectCode: "",

  })
  const [isDragging, setIsDragging] = useState(false)

  // ADR-007 Phase C-4: 試験セッション選択 UI を撤去
  //   - teachers.test_session_id を NULLABLE 化済 (scripts/228)
  //   - register_teachers_bulk RPC は canonical 化済 (scripts/226)
  //   - 教員はマスター登録だけ。session 紐付けは試験セッション編集ウィザード (C-5) で行う

  // Phase 9b-β2d: sessionStorage("accountType") を useSession() に置換
  const { session, isLoading: isSessionLoading } = useSession()

  useEffect(() => {
    if (isSessionLoading || !session) return
    const fetchData = async () => {
      try {
        const storedAccountType = session.accountType || ""
        setAccountType(storedAccountType)

        // ADR-007 Phase C-4: testSessionId フィルタなしで canonical 一覧をロード
        // Phase 9 Y-2 fix: subject_admin は自教科のみロード(全教科ロードすると保存時に Y-2 で 403)
        const subjectScope = session.accountType === "subject_admin" ? session.subjectCode : undefined
        const [teachersData, roomsData, subjectsData] = await Promise.all([
          loadTeachers(undefined, subjectScope, undefined),
          loadRooms(undefined, undefined, undefined),
          loadSubjects(),
        ])


        const sortedTeachers = Array.isArray(teachersData)
          ? teachersData.sort((a, b) => {
              const roomA = a.assignedRoomNumber || ""
              const roomB = b.assignedRoomNumber || ""
              return roomA.localeCompare(roomB, undefined, { numeric: true })
            })
          : []

        setTeachers(sortedTeachers)
        setRooms(Array.isArray(roomsData) ? roomsData : [])
        setSubjects(Array.isArray(subjectsData) ? subjectsData : [])

        try {
          const response = await fetch("/api/universities")

          if (response.ok) {
            const universitiesData = await response.json()

            const universityMap: Record<string, string> = {}
            if (Array.isArray(universitiesData)) {
              universitiesData.forEach((uni: any) => {
                universityMap[uni.university_code] = uni.university_name
              })
            }
            setUniversities(universityMap)
          } else {
            const errorText = await response.text()
          }
        } catch (error) {
        }
      } catch (error) {
        setTeachers([])
        setRooms([])
        setSubjects([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [session, isSessionLoading])

  const handleAddTeacher = () => {
    if (!formData.name || !formData.email || !formData.password) {
      alert("氏名、メールアドレス、パスワードは必須です")
      return
    }

    // 2026-05-19 副田さん仕様変更:
    //   - 担当部屋番号は必須でない (試験割当時に決めるため)
    //   - 担当教科は教科管理者 (subject_admin) のときのみ必須
    //     (一般教員は教科外の試験も担当しうるため任意、大学管理者は教科スコープ無いため不要)
    if (formData.role === "subject_admin" && !formData.subjectCode) {
      alert("教科管理者には担当教科の指定が必須です")
      return
    }

    if (formData.roomNumber) {
      const roomExists = rooms.some((r) => r.roomNumber === formData.roomNumber)
      if (!roomExists) {
        alert("選択された部屋番号が部屋マスターに存在しません")
        return
      }
    }

    const newTeacher: Teacher = {
      id: Date.now().toString(),
      teacherId: Date.now().toString(),
      name: formData.name,
      email: formData.email,
      password: formData.password,
      role: formData.role,
      assignedRoomNumber: formData.roomNumber,
      createdAt: new Date().toISOString(),
      universityCode: formData.university_code,
      subjectCode: formData.subjectCode,
      testSessionId: "", // ADR-007 C-4: canonical 登録、session 紐付けはウィザードで
    }


    setTeachers([...teachers, newTeacher])


    setFormData({
      name: "",
      email: "",
      password: "",
      role: "general",
      roomNumber: "",
      university_code: "",
      subjectCode: "",

    })
  }

  const parseCSV = (text: string) => {
    const lines = text.split("\n").filter((line) => line.trim())
    const newTeachers: Teacher[] = []
    const testSessionId = "" // ADR-007 C-4: canonical 登録

    // 2026-05-20 副田さん仕様: 通常ユーザーは大学コード列なし (自大学強制)、
    // special_master のみ CSV に大学コード列を含む。
    const isSpecialMasterUser = accountType === "special_master"

    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(",").map((s) => s.trim())
      // 通常ユーザー: 6 列 (name,email,password,role,roomNumber,subjectCode)
      // special_master: 7 列 (name,email,password,role,roomNumber,university_code,subjectCode)
      let name: string, email: string, password: string, role: string
      let roomNumber: string, universityCode: string, subjectCode: string
      if (isSpecialMasterUser) {
        ;[name, email, password, role, roomNumber, universityCode, subjectCode] = columns
      } else {
        ;[name, email, password, role, roomNumber, subjectCode] = columns
        universityCode = session?.universityCode || ""
      }

      if (name && email && password) {
        let teacherRole: string = "general"
        if (role === "subject_admin" || role === "教科管理者") {
          teacherRole = "subject_admin"
        } else if (role === "university_admin" || role === "大学管理者") {
          teacherRole = "university_admin"
        } else if (role === "master_admin" || role === "マスター管理者") {
          teacherRole = "master_admin"
        }

        newTeachers.push({
          id: `${Date.now()}-${i}`,
          teacherId: `${Date.now()}-${i}`,
          name,
          email,
          password,
          role: teacherRole as any,
          assignedRoomNumber: roomNumber || "",
          createdAt: new Date().toISOString(),
          universityCode: universityCode || "",
          subjectCode: subjectCode || "",
          testSessionId,
        })
      }
    }

    setTeachers([...teachers, ...newTeachers])
    alert(`${newTeachers.length}名の教員を追加しました`)
  }

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // 2026-05-20 副田さん報告: Excel 保存の Shift-JIS CSV が化けるため自動判定
    try {
      const text = await readCsvFile(file)
      parseCSV(text)
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

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "master_admin": return "マスター管理者"
      case "university_admin": return "大学管理者"
      case "subject_admin": return "教科管理者"
      default: return "一般"
    }
  }

  const handleExportCSV = () => {
    let csvContent: string
    if (accountType === "special_master") {
      // Phase 8c: パスワード列はエクスポートから除外(セキュリティ強化)
      csvContent =
        "大学名,氏名,メールアドレス（ログインID）,権限,担当部屋番号,教科コード\n" +
        teachers
          .map((t) => {
            const roleLabel = getRoleLabel(t.role)
            const universityName = universities[t.universityCode || ""] || ""
            return `${universityName},${t.name},${t.email},${roleLabel},${t.assignedRoomNumber},${t.subjectCode || ""}`
          })
          .join("\n")
    } else {
      // Phase 8c: パスワード列はエクスポートから除外(セキュリティ強化)
      csvContent =
        "氏名,メールアドレス（ログインID）,権限,担当部屋番号,教科コード\n" +
        teachers
          .map((t) => {
            const roleLabel = getRoleLabel(t.role)
            return `${t.name},${t.email},${roleLabel},${t.assignedRoomNumber},${t.subjectCode || ""}`
          })
          .join("\n")
    }

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `教員一覧_${new Date().toISOString().split("T")[0]}.csv`
    link.click()
  }

  const handleDownloadTemplate = () => {
    // 2026-05-20 副田さん仕様: 通常ユーザーは大学コード列なし、special_master のみあり
    const template =
      accountType === "special_master"
        ? "氏名,メールアドレス（ログインID）,ログインパスワード,権限,担当部屋番号,大学コード,教科コード\n田中先生,tanaka@example.com,password123,教科管理者,101,dentshowa,dent_anatomy\n鈴木先生,suzuki@example.com,password456,一般,102,kanagawadent,dent_physiology"
        : "氏名,メールアドレス（ログインID）,ログインパスワード,権限,担当部屋番号,教科コード\n田中先生,tanaka@example.com,password123,教科管理者,101,dent_anatomy\n鈴木先生,suzuki@example.com,password456,一般,102,dent_physiology"
    // BOM 付き UTF-8 で出力 (Excel で開いても文字化けしない)
    const blob = csvDownloadBlob(template)
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = "教員登録テンプレート.csv"
    link.click()
  }

  const handleConfirmRegistration = async () => {

    if (teachers.length === 0) {
      alert("登録する教員がいません")
      return
    }

    try {
      await saveTeachers(teachers)
      alert(`${teachers.length}名の教員情報を保存しました`)
      router.push("/admin/account-management")
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      console.error("[teacher-registration] save failed:", msg, error)
      alert(`教員情報の保存に失敗しました: ${msg}`)
    }
  }

  const handleDeleteTeacher = async (id: string) => {
    if (!confirm("この教員を削除してもよろしいですか？")) {
      return
    }

    // ADR-003 RLS 適用後、anon client での DELETE は deny-by-default で失敗する。
    // /api/teachers/[id] DELETE (service role + requireAdmin) を経由する deleteTeacher を使う。
    try {
      await deleteTeacher(id)
      const updatedTeachers = teachers.filter((teacher) => teacher.id !== id)
      setTeachers(updatedTeachers)
      alert("教員を削除しました")
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      console.error("[teacher-registration] delete failed:", msg, error)
      alert(`教員の削除に失敗しました: ${msg}`)
    }
  }

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
    <PageContainer width="list">
      {(() => {  return null })()}
      <div className="space-y-6">
        {/* 2026-11-06 デザイン見直し: 見出しだけのカードをやめ、他画面と同じ見出し+戻るリンクに */}
        <div className="space-y-1">
          {accountType === "special_master" ? (
            <BackLink href="/admin/account-management" label="アカウント管理に戻る" />
          ) : (
            <BackLink href="/admin/dashboard" label="ダッシュボードに戻る" hideWhenAdminNav />
          )}
          <h1 className="text-3xl font-bold text-primary">教員登録</h1>
          <p className="text-muted-foreground">教員アカウントの登録と管理</p>
        </div>

        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">手動登録</TabsTrigger>
            <TabsTrigger value="csv">CSV一括登録</TabsTrigger>
          </TabsList>

          <TabsContent value="manual">
            <Card>
              <CardHeader>
                <CardTitle>教員情報入力</CardTitle>
                <CardDescription>1名ずつ手動で教員情報を登録できます</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">氏名 *</Label>
                    <Input
                      id="name"
                      placeholder="田中先生"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="border-blue-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">メールアドレス（ログインID） *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="teacher@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="border-blue-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">ログインパスワード *</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="パスワードを入力"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="border-blue-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">権限 *</Label>
                    <select
                      id="role"
                      className="flex h-10 w-full rounded-md border border-blue-500 bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
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
                        ? "一般: 教員ログインのみ / 教科管理者: 教科データ管理 / 大学管理者: 大学内全管理"
                        : "権限の変更はマスター管理者または大学管理者のみ可能です"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="roomNumber">担当部屋番号</Label>
                    {rooms.length === 0 ? (
                      <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
                        部屋が登録されていません。先に部屋マスターで部屋を登録してください。
                      </div>
                    ) : (
                      <select
                        id="roomNumber"
                        className="flex h-10 w-full rounded-md border border-blue-500 bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        value={formData.roomNumber}
                        onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
                      >
                        <option value="">部屋を選択してください（任意）</option>
                        {rooms.map((room) => (
                          <option key={room.id} value={room.roomNumber}>
                            {room.roomNumber} - {room.roomName}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="text-xs text-muted-foreground">
                      任意。試験ごとに担当部屋を割り当てる場合は試験セッション割当画面で設定できます。
                    </p>
                  </div>
                  {accountType === "special_master" && (
                    <div className="space-y-2">
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
                  <div className="space-y-2">
                    <Label htmlFor="subject">
                      担当教科{formData.role === "subject_admin" ? " *" : ""}
                    </Label>
                    <select
                      id="subject"
                      value={formData.subjectCode}
                      onChange={(e) => setFormData({ ...formData, subjectCode: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-blue-500 bg-background px-3 py-2 text-sm"
                      required={formData.role === "subject_admin"}
                    >
                      <option value="">
                        {formData.role === "subject_admin" ? "選択してください" : "選択してください（任意）"}
                      </option>
                      {subjects
                        .filter((s) => !formData.university_code || s.universityCode === formData.university_code)
                        .map((subject) => (
                          <option key={subject.subjectCode} value={subject.subjectCode}>
                            {subject.subjectName}
                          </option>
                        ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {formData.role === "subject_admin"
                        ? "教科管理者は自教科のダッシュボードのみ参照するため必須です"
                        : "任意。一般教員は教科外の試験も担当できます。大学管理者は教科横断で参照可能です。"}
                    </p>
                  </div>

                </div>
                <Button onClick={handleAddTeacher} className="w-full" size="lg">
                  <UserPlus className="w-4 h-4 mr-2" />
                  教員を追加
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="csv">
            <Card>
              <CardHeader>
                <CardTitle>CSV一括登録</CardTitle>
                <CardDescription>CSVファイルから複数の教員を一度に登録できます</CardDescription>
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
                          氏名,メールアドレス（ログインID）,ログインパスワード,権限,担当部屋番号,大学コード,教科コード{"\n"}
                          田中先生,tanaka@example.com,password123,教科管理者,101,dentshowa,dent_anatomy{"\n"}
                          鈴木先生,suzuki@example.com,password456,一般,102,kanagawadent,dent_physiology
                        </>
                      ) : (
                        <>
                          氏名,メールアドレス(ログインID),ログインパスワード,権限,担当部屋番号,教科コード{"\n"}
                          田中先生,tanaka@example.com,password123,教科管理者,101,dent_anatomy{"\n"}
                          鈴木先生,suzuki@example.com,password456,一般,102,dent_physiology
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
        </Tabs>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>登録済み教員一覧</CardTitle>
                <CardDescription>現在 {teachers.length} 名が登録されています</CardDescription>
              </div>
              {teachers.length > 0 && (
                <Button onClick={handleExportCSV} variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  CSV出力
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {teachers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">教員が登録されていません</div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      {accountType === "special_master" && <TableHead className="min-w-[150px]">大学名</TableHead>}
                      <TableHead className="min-w-[150px]">氏名</TableHead>
                      <TableHead className="min-w-[150px]">メールアドレス（ログインID）</TableHead>
                      <TableHead className="min-w-[150px]">ログインパスワード</TableHead>
                      <TableHead className="min-w-[150px]">権限</TableHead>
                      <TableHead className="min-w-[150px]">担当部屋番号</TableHead>
                      <TableHead className="min-w-[150px]">教科コード</TableHead>
                      
                      <TableHead className="min-w-[150px] text-center">操作</TableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {teachers.map((teacher) => (
                      <TableRow key={teacher.email} className="border-b hover:bg-muted/50">
                        {accountType === "special_master" && (
                          <TableCell>{universities[teacher.universityCode || ""] || "-"}</TableCell>
                        )}
                        <TableCell className="font-medium">{teacher.name}</TableCell>
                        <TableCell>{teacher.email}</TableCell>
                        <TableCell>{"********"}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              teacher.role === "master_admin"
                                ? "bg-red-100 text-red-800"
                                : teacher.role === "university_admin"
                                  ? "bg-blue-100 text-blue-800"
                                  : teacher.role === "subject_admin"
                                    ? "bg-orange-100 text-orange-800"
                                    : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {getRoleLabel(teacher.role)}
                          </span>
                        </TableCell>
                        <TableCell>{teacher.assignedRoomNumber || "-"}</TableCell>
                        <TableCell>{teacher.subjectCode || "-"}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTeacher(teacher.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {teachers.length > 0 && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-lg">登録を確定しますか？</p>
                  <p className="text-sm text-muted-foreground">{teachers.length}名の教員情報を保存します</p>
                </div>
                <Button size="lg" className="bg-primary hover:bg-primary/90" onClick={handleConfirmRegistration}>
                  登録を確定
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  )
}
