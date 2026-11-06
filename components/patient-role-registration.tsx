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
import { savePatients, loadPatients, loadRooms, loadSubjects, type Patient, type Room, type Subject } from "@/lib/data-storage"
import { useSession } from "@/lib/auth/use-session"
import { readCsvFile, csvDownloadBlob } from "@/lib/csv"
import { Table, TableHead, TableRow, TableCell } from "@/components/ui/table"

export function PatientRoleRegistration() {
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [accountType, setAccountType] = useState<string>("")
  const [universities, setUniversities] = useState<Record<string, string>>({})
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "general" as "general",
    roomNumber: "",
    university_code: "",
    subjectCode: "",
  })
  const [isDragging, setIsDragging] = useState(false)

  // ADR-007 Phase C-4: 試験セッション選択 UI を撤去
  //   - patients.test_session_id を NULLABLE 化済 (scripts/229)
  //   - register_patients_bulk RPC は canonical 化済 (scripts/227)

  // Phase 9b-β2d: sessionStorage("accountType") を useSession() に置換
  const { session, isLoading: isSessionLoading } = useSession()

  useEffect(() => {
    if (isSessionLoading || !session) return
    const fetchData = async () => {
      try {
        const storedAccountType = session.accountType || ""
        setAccountType(storedAccountType)

        // ADR-007 Phase C-4: testSessionId フィルタなしで canonical 一覧をロード
        const subjectScope = session.accountType === "subject_admin" ? session.subjectCode : undefined
        const [patientsData, roomsData, subjectsData] = await Promise.all([
          loadPatients(undefined, subjectScope, undefined),
          loadRooms(undefined, undefined, undefined),
          loadSubjects(),
        ])
        setSubjects(Array.isArray(subjectsData) ? subjectsData : [])


        const sortedPatients = Array.isArray(patientsData)
          ? patientsData.sort((a, b) => {
              const roomA = a.assignedRoomNumber || ""
              const roomB = b.assignedRoomNumber || ""
              return roomA.localeCompare(roomB)
            })
          : []

        setPatients(sortedPatients)
        setRooms(Array.isArray(roomsData) ? roomsData : [])

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
        setPatients([])
        setRooms([])
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [session, isSessionLoading])

  const handleAddPatient = () => {
    if (!formData.name || !formData.email || !formData.password) {
      alert("氏名、メールアドレス、パスワードは必須です")
      return
    }

    // 2026-05-19 副田さん仕様変更:
    //   - 患者役登録から「担当部屋番号」「担当教科」フィールドを削除。
    //     試験割当時に決めるため。

    const newPatient: Patient = {
      id: Date.now().toString(),
      patientId: Date.now().toString(),
      name: formData.name,
      email: formData.email,
      password: formData.password,
      role: formData.role,
      assignedRoomNumber: "",
      createdAt: new Date().toISOString(),
      universityCode: formData.university_code,
      testSessionId: "", // ADR-007 C-4: canonical 登録
    }

    setPatients([...patients, newPatient])
    setFormData({ name: "", email: "", password: "", role: "general", roomNumber: "", university_code: "", subjectCode: "" })
  }

  const handleDeletePatient = async (id: string) => {
    const patient = patients.find((p) => p.id === id)
    if (!patient) return

    const confirmed = window.confirm(`${patient.name} を削除してもよろしいですか？\n\nこの操作は取り消せません。`)
    if (!confirmed) return

    try {
      const updatedPatients = patients.filter((p) => p.id !== id)
      setPatients(updatedPatients)

      await savePatients(updatedPatients)
      alert(`${patient.name} を削除しました`)
    } catch (error) {
      alert("削除中にエラーが発生しました")
      const subjectScope = session?.accountType === "subject_admin" ? session.subjectCode : undefined
      const data = await loadPatients(undefined, subjectScope, undefined)
      setPatients(Array.isArray(data) ? data : [])
    }
  }

  const parseCSV = (text: string) => {
    const lines = text.split("\n").filter((line) => line.trim())
    const newPatients: Patient[] = []
    const testSessionId = "" // ADR-007 C-4: canonical 登録

    // 2026-05-20 副田さん仕様: 通常ユーザーは大学コード列なし、special_master のみあり
    const isSpecialMasterUser = accountType === "special_master"

    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(",").map((s) => s.trim())
      let name: string, email: string, password: string, role: string
      let roomNumber: string, universityCode: string
      if (isSpecialMasterUser) {
        ;[name, email, password, role, roomNumber, universityCode] = columns
      } else {
        ;[name, email, password, role, roomNumber] = columns
        universityCode = session?.universityCode || ""
      }
      if (name && email && password) {
        newPatients.push({
          id: `${Date.now()}-${i}`,
          patientId: `${Date.now()}-${i}`,
          name,
          email,
          password,
          role: "general",
          assignedRoomNumber: roomNumber || "",
          createdAt: new Date().toISOString(),
          universityCode: universityCode || "",
          testSessionId,
        })
      }
    }

    setPatients([...patients, ...newPatients])
    alert(`${newPatients.length}名の患者役を追加しました`)
  }

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // 2026-05-20 副田さん報告: Shift-JIS 自動判定
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

  const handleExportCSV = () => {
    let csvContent
    if (accountType === "special_master") {
      // Phase 8c: パスワード列はエクスポートから除外(セキュリティ強化)
      csvContent =
        "大学名,氏名,メールアドレス（ログインID）,権限,担当部屋番号\n" +
        patients
          .map((p) => {
            const universityName = universities[p.universityCode || ""] || ""
            return `${universityName},${p.name},${p.email},一般,${p.assignedRoomNumber || ""}`
          })
          .join("\n")
    } else {
      // Phase 8c: パスワード列はエクスポートから除外(セキュリティ強化)
      csvContent =
        "氏名,メールアドレス（ログインID）,権限,担当部屋番号\n" +
        patients
          .map(
            (p) =>
              `${p.name},${p.email},一般,${p.assignedRoomNumber || ""}`,
          )
          .join("\n")
    }

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `患者役一覧_${new Date().toISOString().split("T")[0]}.csv`
    link.click()
  }

  const handleDownloadTemplate = () => {
    // 2026-05-20 副田さん仕様: 通常ユーザーは大学コード列なし、special_master のみあり
    const template =
      accountType === "special_master"
        ? "氏名,メールアドレス（ログインID）,ログインパスワード,権限,担当部屋番号,大学コード\n高橋様,takahashi@example.com,password123,一般,101,dentshowa\n伊藤様,ito@example.com,password456,一般,102,kanagawadent"
        : "氏名,メールアドレス（ログインID）,ログインパスワード,権限,担当部屋番号\n高橋様,takahashi@example.com,password123,一般,101\n伊藤様,ito@example.com,password456,一般,102"
    const blob = csvDownloadBlob(template)
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = "患者役登録テンプレート.csv"
    link.click()
  }

  const handleConfirmRegistration = async () => {
    try {
      await savePatients(patients)
      alert(`${patients.length}名の患者役情報を保存しました`)
      router.push("/admin/account-management")
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      console.error("[patient-role-registration] save failed:", msg, error)
      alert(`患者役情報の保存に失敗しました: ${msg}`)
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
          <h1 className="text-[28px] leading-tight font-bold text-primary">患者役登録</h1>
          <p className="text-muted-foreground">患者役アカウントの登録と管理</p>
        </div>

        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">手動登録</TabsTrigger>
            <TabsTrigger value="csv">CSV一括登録</TabsTrigger>
          </TabsList>

          <TabsContent value="manual">
            <Card>
              <CardHeader>
                <CardTitle>患者役情報入力</CardTitle>
                <CardDescription>1名ずつ手動で患者役情報を登録できます</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">氏名 *</Label>
                    <Input
                      id="name"
                      placeholder="高橋様"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">メールアドレス（ログインID） *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="patient@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                    />
                  </div>
                  {/* ADR-001 §7-2(b): 患者役は role="general" のみ */}
                  <input type="hidden" value="general" />
                  {/* 2026-05-19 副田さん仕様変更: 担当部屋番号 / 担当教科は登録時には入力不要 (試験割当時に決める) */}
                  {accountType === "special_master" && (
                    <div className="grid gap-2">
                      <Label htmlFor="university">大学</Label>
                      <select
                        id="university"
                        value={formData.university_code}
                        onChange={(e) => setFormData({ ...formData, university_code: e.target.value })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                <Button onClick={handleAddPatient} className="w-full" size="lg">
                  <UserPlus className="w-4 h-4 mr-2" />
                  患者役を追加
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="csv">
            <Card>
              <CardHeader>
                <CardTitle>CSV一括登録</CardTitle>
                <CardDescription>CSVファイルから複数の患者役を一度に登録できます</CardDescription>
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
                    <p className="text-sm font-semibold mb-2">CSV形式の例:</p>
                    <pre className="text-xs bg-background p-3 rounded overflow-x-auto">
                      {accountType === "special_master" ? (
                        <>
                          氏名,メールアドレス(ログインID),ログインパスワード,権限,担当部屋番号,大学コード{"\n"}
                          高橋様,takahashi@example.com,password123,一般,101,dentshowa{"\n"}
                          伊藤様,ito@example.com,password456,一般,102,kanagawadent
                        </>
                      ) : (
                        <>
                          氏名,メールアドレス(ログインID),ログインパスワード,権限,担当部屋番号{"\n"}
                          高橋様,takahashi@example.com,password123,一般,101{"\n"}
                          伊藤様,ito@example.com,password456,一般,102
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
                <CardTitle>登録済み患者役一覧</CardTitle>
                <CardDescription>現在 {patients.length} 名が登録されています</CardDescription>
              </div>
              {patients.length > 0 && (
                <Button onClick={handleExportCSV} variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  CSV出力
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {patients.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">患者役が登録されていません</div>
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
                      <TableHead className="text-center p-3 font-semibold">操作</TableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map((patient) => (
                      <TableRow key={patient.email}>
                        {accountType === "special_master" && (
                          <TableCell>{universities[patient.universityCode || ""] || "-"}</TableCell>
                        )}
                        <TableCell className="font-medium">{patient.name}</TableCell>
                        <TableCell>{patient.email}</TableCell>
                        <TableCell>{"********"}</TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              "bg-blue-100 text-blue-800"
                            }`}
                          >
                            一般
                          </span>
                        </TableCell>
                        <TableCell>{patient.assignedRoomNumber || "-"}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeletePatient(patient.id)}
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

        {patients.length > 0 && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-lg">登録を確定しますか？</p>
                  <p className="text-sm text-muted-foreground">{patients.length}名の患者役情報を保存します</p>
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
