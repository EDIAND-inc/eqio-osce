"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Plus, Edit, Trash2, ArrowLeft, Calendar, Copy, Hourglass, Users } from "lucide-react"
import Link from "next/link"
import { loadTests, saveTests, deleteTest, type Test } from "@/lib/data-storage"
import { buildTestLabelMap } from "@/lib/exam/test-labels"
import { useSession } from "@/lib/auth/use-session"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export function QuestionManagement() {
  const router = useRouter()
  const [tests, setTests] = useState<Test[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isSpecialMaster, setIsSpecialMaster] = useState(false)
  const [universities, setUniversities] = useState<Array<{ code: string; name: string }>>([])
  const [selectedUniversity, setSelectedUniversity] = useState<string>("all")
  const [testSessions, setTestSessions] = useState<any[]>([])
  const [subjects, setSubjects] = useState<Array<{ code: string; name: string }>>([])
  const [selectedSubject, setSelectedSubject] = useState<string>("all")
  const [teacherSubjectCode, setTeacherSubjectCode] = useState<string>("")
  const [isTeacher, setIsTeacher] = useState(false)
  const [authRole, setAuthRole] = useState<string>("")

  const [showSessionDialog, setShowSessionDialog] = useState(false)
  const [newTestName, setNewTestName] = useState("")
  const [newTestDate, setNewTestDate] = useState("")

  // 複製ダイアログ用state
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [duplicateSourceId, setDuplicateSourceId] = useState<string | null>(null)
  const [duplicateMode, setDuplicateMode] = useState<"same" | "new">("same")
  const [duplicateTargetSessionId, setDuplicateTargetSessionId] = useState<string>("")
  const [duplicateRoleType, setDuplicateRoleType] = useState<"teacher" | "patient">("teacher")
  const [duplicateStep, setDuplicateStep] = useState<1 | 2 | 3>(1)
  const [duplicateLoading, setDuplicateLoading] = useState(false)
  const [duplicateNewSessionMode, setDuplicateNewSessionMode] = useState<"existing" | "create">("existing")
  const [dupNewTestName, setDupNewTestName] = useState("")
  const [dupNewTestDate, setDupNewTestDate] = useState("")
  const [newUniversityCode, setNewUniversityCode] = useState("")
  const [newSubjectCode, setNewSubjectCode] = useState("")
  // 2026-10-28 熊木先生要望: セッション名のインライン編集用
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [renameSaving, setRenameSaving] = useState(false)

  // Phase 9b-β2e: sessionStorage 認可キーを useSession() に置換
  // userType キーは dead 値だったため session.loginType で代替
  const { session, isLoading: isSessionLoading } = useSession()

  useEffect(() => {
    if (isSessionLoading || !session) return
    const accountType = session.accountType || ""
    const userUniversityCode = session.universityCode || ""
    const subjectCode = session.subjectCode || ""
    const userType = session.loginType // "admin" or "teacher" or "patient"
    const role = session.role || ""

    setIsSpecialMaster(accountType === "special_master")
    setIsTeacher(userType === "teacher")
    setAuthRole(role)

    // 教科ロック: subject_admin と general のみ（university_admin, master_admin は自由に切替可能）
    const isSubjectLocked = role === "subject_admin" || role === "general" || (userType === "teacher" && role !== "university_admin" && role !== "master_admin")
    if (subjectCode && isSubjectLocked) {
      setTeacherSubjectCode(subjectCode)
      setSelectedSubject(subjectCode)
    }
    // university_admin, master_admin は初期値 "all" のまま（教科フィルタを自由に変更可能）

    if (accountType === "special_master") {
      fetch("/api/universities")
        .then((res) => res.json())
        .then((data) => {
          const universityList: Array<{ code: string; name: string }> = []
          data.forEach((uni: any) => {
            universityList.push({ code: uni.university_code, name: uni.university_name })
          })
          setUniversities(universityList)
        })
        .catch((err) => {})
    }

    fetchSubjects(userUniversityCode)
    fetchTestSessions()
    fetchTests()
  }, [session, isSessionLoading])

  const fetchTestSessions = async () => {
    try {
      const res = await fetch("/api/test-sessions")
      const data = await res.json()
      setTestSessions(data)
    } catch (err) {
    }
  }

  const fetchTests = async () => {
    const loadedTests = await loadTests()
    setTests(Array.isArray(loadedTests) ? loadedTests : [])
  }

  const handleAddTestSession = async () => {
    if (!newTestName.trim() || !newTestDate || !newUniversityCode) {
      alert("テスト名、実施日、大学を入力してください")
      return
    }
    // 2026-05-20 副田さん仕様: 試験セッションは教科に属する必要がある
    if (!newSubjectCode) {
      alert("教科を選択してください")
      return
    }

    try {
      const res = await fetch("/api/test-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: newTestName,
          test_date: newTestDate,
          university_code: newUniversityCode,
          subject_code: newSubjectCode,
        }),
      })

      if (res.ok) {
        alert("試験セッションを登録しました")
        setShowSessionDialog(false)
        setNewTestName("")
        setNewTestDate("")
        setNewUniversityCode("")
        setNewSubjectCode("")
        fetchTestSessions()
      } else {
        alert("試験セッションの登録に失敗しました")
      }
    } catch (err) {
      alert("エラーが発生しました")
    }
  }

  // 2026-10-28 熊木先生要望: 作成済みセッション名(description)をその場で編集(インライン)
  const startRename = (sessionId: string, currentLabel: string) => {
    setEditingSessionId(sessionId)
    setEditingName(currentLabel)
  }
  const cancelRename = () => {
    setEditingSessionId(null)
    setEditingName("")
  }
  const saveRename = async (sessionId: string, currentLabel: string) => {
    const newName = editingName.trim()
    if (!newName) {
      alert("セッション名を入力してください")
      return
    }
    if (newName === currentLabel) {
      cancelRename()
      return
    }
    if (testSessions.some((ts) => ts.id !== sessionId && ts.description === newName)) {
      alert(`「${newName}」は既に使われています。別の名称にしてください。`)
      return
    }
    setRenameSaving(true)
    try {
      const res = await fetch(`/api/test-sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: newName }),
      })
      if (res.ok) {
        await fetchTestSessions()
        cancelRename()
      } else {
        const err = await res.json().catch(() => null)
        alert(`変更に失敗しました: ${err?.error || res.status}`)
      }
    } catch (e) {
      alert("エラーが発生しました")
    } finally {
      setRenameSaving(false)
    }
  }

  // 2026-07-03 副田さん要望: 試験セッション削除機能
  // - 依存 (テスト/割当/評価結果) があれば 409 で件数を返す
  // - 副田さんが確認ダイアログで OK すれば cascade=true で強制削除
  const handleDeleteTestSession = async (sessionId: string, sessionLabel: string) => {
    // 誤クリック防止の初回確認
    if (!confirm(`試験セッション「${sessionLabel}」を削除しますか?`)) return
    // 1st try: cascade なしで依存 pre-check
    try {
      const preRes = await fetch(`/api/test-sessions/${sessionId}`, { method: "DELETE" })
      if (preRes.ok) {
        alert(`「${sessionLabel}」を削除しました`)
        await Promise.all([fetchTestSessions(), fetchTests()])
        return
      }
      if (preRes.status === 409) {
        const j = await preRes.json().catch(() => null)
        const detail = j?.error || "依存データが存在します"
        if (!confirm(`「${sessionLabel}」の削除:\n\n${detail}\n\n関連データを全て削除しますか? (この操作は取り消せません)`)) {
          return
        }
        const forceRes = await fetch(`/api/test-sessions/${sessionId}?cascade=true`, {
          method: "DELETE",
        })
        if (!forceRes.ok) {
          const err = await forceRes.json().catch(() => null)
          alert(`削除に失敗しました: ${err?.error || forceRes.status}`)
          return
        }
        alert(`「${sessionLabel}」を関連データと共に削除しました`)
        await Promise.all([fetchTestSessions(), fetchTests()])
        return
      }
      // 依存無しなのに 500 等
      const err = await preRes.json().catch(() => null)
      alert(`削除に失敗しました: ${err?.error || preRes.status}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`削除中にエラー: ${msg}`)
    }
  }

  const fetchSubjects = async (universityCode: string | null) => {
    try {
      const res = await fetch(`/api/subjects${universityCode ? `?university_code=${universityCode}` : ""}`)
      const data = await res.json()
      if (Array.isArray(data)) {
        const mapped = data.map((s: any) => ({
          code: s.subject_code,
          name: s.subject_name,
        }))
        setSubjects(mapped)
      }
    } catch (err) {
    }
  }

  const filteredTests = tests.filter((test) => {
    const matchesSearch = test.title.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesUniversity = selectedUniversity === "all" || (test as any).universityCode === selectedUniversity
    const matchesSubject = selectedSubject === "all" || (test as any).subjectCode === selectedSubject

    if (isTeacher && teacherSubjectCode) {
      return matchesSearch && matchesUniversity && (test as any).subjectCode === teacherSubjectCode
    }

    return matchesSearch && matchesUniversity && matchesSubject
  })

  // testSessionIdでグルーピング（通常ユーザー向け）
  // まずフィルタ条件に合うセッションを全て含める（テスト0件のセッションも表示）
  const groupedBySession: Record<string, Test[]> = {}
  const userUniversityCode = session?.universityCode || null
  testSessions.forEach((session) => {
    // 大学フィルタ
    if (userUniversityCode && !isSpecialMaster && session.university_code !== userUniversityCode) return
    if (isSpecialMaster && selectedUniversity !== "all" && session.university_code !== selectedUniversity) return
    // 教科フィルタ
    if (teacherSubjectCode && session.subject_code !== teacherSubjectCode) return
    if (!teacherSubjectCode && selectedSubject !== "all" && session.subject_code !== selectedSubject) return
    groupedBySession[session.id] = []
  })
  filteredTests.forEach((test) => {
    const sessionId = (test as any).testSessionId || "unassigned"
    if (!groupedBySession[sessionId]) {
      groupedBySession[sessionId] = []
    }
    groupedBySession[sessionId].push(test)
  })
  // 各グループ内で教員側を先、患者役側を後にソート (同 roleType 内は createdAt 昇順)
  Object.values(groupedBySession).forEach((group) => {
    group.sort((a, b) => {
      const roleOrder = { teacher: 0, patient: 1 }
      const ra = roleOrder[(a as any).roleType as keyof typeof roleOrder] ?? 2
      const rb = roleOrder[(b as any).roleType as keyof typeof roleOrder] ?? 2
      if (ra !== rb) return ra - rb
      const da = new Date(a.createdAt || 0).getTime()
      const db = new Date(b.createdAt || 0).getTime()
      return da - db
    })
  })

  // A-2 (2026-05-20 副田さん仕様): 同セッション内で同 roleType が複数あれば
  // 「教員側①」「教員側②」のように自動採番。filteredTests 全体で 1 回計算して再利用。
  const testLabelMap = buildTestLabelMap(filteredTests)

  const groupedByUniversityAndTestCode: Record<string, Record<string, Test[]>> = {}

  if (isSpecialMaster && selectedUniversity === "all") {
    universities.forEach((uni) => {
      groupedByUniversityAndTestCode[uni.code] = {}
      const universityTests = filteredTests.filter((test) => (test as any).universityCode === uni.code)

      universityTests.forEach((test) => {
        const testSession = testSessions.find((ts) => ts.id === (test as any).testSessionId)
        const sessionLabel = testSession?.description || "未分類"

        if (!groupedByUniversityAndTestCode[uni.code][sessionLabel]) {
          groupedByUniversityAndTestCode[uni.code][sessionLabel] = []
        }
        groupedByUniversityAndTestCode[uni.code][sessionLabel].push(test)
      })
    })
  }

  const openDuplicateDialog = (testId: string) => {
    const original = tests.find((t) => t.id === testId)
    if (!original) return
    setDuplicateSourceId(testId)
    setDuplicateMode("same")
    setDuplicateTargetSessionId((original as any).testSessionId || "")
    setDuplicateRoleType((original as any).roleType === "patient" ? "teacher" : "patient")
    setDuplicateNewSessionMode("existing")
    setDupNewTestName("")
    setDupNewTestDate("")
    setDuplicateStep(1)
    setShowDuplicateDialog(true)
  }

  const dupGeneratedDescription = dupNewTestDate && dupNewTestName.trim()
    ? `${dupNewTestDate.replace(/-/g, "")}_${dupNewTestName.trim()}`
    : ""

  const executeDuplicate = async () => {
    if (!duplicateSourceId || duplicateLoading) return
    setDuplicateLoading(true)
    const original = tests.find((t) => t.id === duplicateSourceId)
    if (!original) { setDuplicateLoading(false); return }

    let targetSessionId = ""

    if (duplicateMode === "same") {
      targetSessionId = (original as any).testSessionId
    } else if (duplicateNewSessionMode === "existing") {
      targetSessionId = duplicateTargetSessionId
      if (!targetSessionId) {
        alert("複製先のテストを選択してください")
        setDuplicateLoading(false)
        return
      }
    } else {
      // 新規テスト作成
      if (!dupNewTestName.trim() || !dupNewTestDate) {
        alert("テスト名と実施日を入力してください")
        setDuplicateLoading(false)
        return
      }
      const description = dupGeneratedDescription
      const isDuplicate = testSessions.some((ts) => ts.description === description)
      if (isDuplicate) {
        alert(`「${description}」は既に登録されています。テスト名を変更してください。`)
        setDuplicateLoading(false)
        return
      }
      try {
        const universityCode = (original as any).universityCode || session?.universityCode || ""
        const res = await fetch("/api/test-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description,
            test_date: dupNewTestDate,
            university_code: universityCode,
            subject_code: (original as any).subjectCode || null,
          }),
        })
        if (!res.ok) throw new Error("Failed to create test session")
        const newSession = await res.json()
        setTestSessions([...testSessions, newSession])
        targetSessionId = newSession.id
      } catch (error) {
        alert("新規テストの作成に失敗しました")
        return
      }
    }

    const roleLabel = duplicateRoleType === "teacher" ? "教員側" : "患者役側"

    // Deep copy with all new UUIDs for sheets, categories, and questions
    const newSheets = original.sheets.map((sheet) => ({
      ...sheet,
      id: crypto.randomUUID(),
      categories: sheet.categories.map((cat) => ({
        ...cat,
        id: crypto.randomUUID(),
        questions: cat.questions.map((q) => ({
          ...q,
          id: crypto.randomUUID(),
        })),
      })),
    }))

    const duplicated: Test = {
      ...original,
      id: crypto.randomUUID(),
      title: `${original.title}（${roleLabel}コピー）`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sheets: newSheets,
    }
    ;(duplicated as any).testSessionId = targetSessionId
    ;(duplicated as any).roleType = duplicateRoleType

    try {
      await saveTests([duplicated])
      setTests([...tests, duplicated])
      setDuplicateLoading(false)
      setShowDuplicateDialog(false)
      setDuplicateSourceId(null)
    } catch (err) {
      setDuplicateLoading(false)
      alert("テストの複製に失敗しました")
    }
  }

  const handleDelete = async (testId: string) => {
    if (!confirm("このテストを削除してもよろしいですか？")) return

    try {
      await deleteTest(testId)
      setTests(tests.filter((t) => t.id !== testId))
    } catch (err) {
      alert("テストの削除に失敗しました")
    }
  }

  const handleCreateNew = () => {
    router.push("/admin/question-management/create")
  }

  const handleEdit = (testId: string) => {
    router.push(`/admin/question-management/edit/${testId}`)
  }

  return (
    <div className="min-h-screen bg-secondary/30 p-4 md:p-8">
      <div className="mx-auto ">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/dashboard">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                ダッシュボードに戻る
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-[#00417A]">問題管理</h1>
          </div>
          <div className="flex gap-2">
            {isSpecialMaster && (
              <Dialog open={showSessionDialog} onOpenChange={setShowSessionDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="border-[#00417A] text-[#00417A] bg-transparent">
                    <Calendar className="mr-2 h-4 w-4" />
                    試験セッション管理
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>新しい試験セッションを登録</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>テスト名</Label>
                      <Input
                        value={newTestName}
                        onChange={(e) => setNewTestName(e.target.value)}
                        placeholder="例: 202512 全身の医療面接評価"
                      />
                    </div>
                    <div>
                      <Label>実施日</Label>
                      <Input type="date" value={newTestDate} onChange={(e) => setNewTestDate(e.target.value)} />
                    </div>
                    <div>
                      <Label>大学</Label>
                      <Select value={newUniversityCode} onValueChange={setNewUniversityCode}>
                        <SelectTrigger>
                          <SelectValue placeholder="大学を選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {universities.map((uni) => (
                            <SelectItem key={uni.code} value={uni.code}>
                              {uni.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>教科 *</Label>
                      <Select value={newSubjectCode} onValueChange={setNewSubjectCode}>
                        <SelectTrigger>
                          <SelectValue placeholder="教科を選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {subjects.map((subject) => (
                            <SelectItem key={subject.code} value={subject.code}>
                              {subject.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleAddTestSession} className="w-full bg-[#00417A]">
                      登録
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            <Button onClick={handleCreateNew} className="bg-[#00417A] hover:bg-[#00417A]/90">
              <Plus className="mr-2 h-4 w-4" />
              新規作成
            </Button>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-4">
          {isSpecialMaster && (
            <div className="flex items-center gap-3 h-9">
              <label className="text-sm font-medium">大学:</label>
              <Select value={selectedUniversity} onValueChange={setSelectedUniversity}>
                <SelectTrigger className="h-9 w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての大学</SelectItem>
                  {universities.map((uni) => (
                    <SelectItem key={uni.code} value={uni.code}>
                      {uni.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!isTeacher && !teacherSubjectCode && (
            <div className="flex items-center gap-3 h-9">
              <label className="text-sm font-medium">教科:</label>
              <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                <SelectTrigger className="h-9 w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての教科</SelectItem>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.code} value={subject.code}>
                      {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {teacherSubjectCode && (
            <div className="flex items-center gap-3 h-9 bg-blue-50 px-3 py-2 rounded-md">
              <label className="text-sm font-medium">担当教科:</label>
              <span className="text-sm text-[#00417A] font-semibold">
                {subjects.find((s) => s.code === teacherSubjectCode)?.name || teacherSubjectCode}
              </span>
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>テスト一覧</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Input
                placeholder="テスト名で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-md"
              />
            </div>

            {isSpecialMaster && selectedUniversity === "all" ? (
              <div className="space-y-6">
                {universities.map((uni) => {
                  const universityGroups = groupedByUniversityAndTestCode[uni.code] || {}
                  const hasTests = Object.keys(universityGroups).length > 0

                  if (!hasTests) return null

                  return (
                    <div key={uni.code} className="space-y-4 border rounded-lg p-4 bg-gray-50">
                      <h3 className="text-xl font-bold text-[#00417A]">{uni.name}</h3>

                      {Object.entries(universityGroups).map(([sessionLabel, testsInCode]) => (
                        <div key={sessionLabel} className="space-y-3 ml-4">
                          <h4 className="text-lg font-semibold text-[#00417A] border-b pb-2">
                            {sessionLabel}
                          </h4>

                          {testsInCode.map((test) => (
                            <div
                              key={test.id}
                              className="flex items-center justify-between rounded-lg border bg-white p-4 ml-4"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <h5 className="font-semibold text-[#00417A]">{test.title}</h5>
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    (test as any).roleType === "patient"
                                      ? "bg-pink-100 text-pink-800"
                                      : "bg-blue-100 text-blue-800"
                                  }`}>
                                    {testLabelMap[test.id] || ((test as any).roleType === "patient" ? "患者役側" : "教員側")}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-500">
                                  {(test as any).subjectCode && (
                                    <>
                                      教科:{" "}
                                      {subjects.find((s) => s.code === (test as any).subjectCode)?.name ||
                                        (test as any).subjectCode}{" "}
                                      |{" "}
                                    </>
                                  )}
                                  シート数: {test.sheets.length} | 作成日:{" "}
                                  {new Date(test.createdAt).toLocaleDateString("ja-JP")}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => openDuplicateDialog(test.id)}>
                                  <Copy className="mr-1 h-4 w-4" />
                                  複製
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handleEdit(test.id)}>
                                  <Edit className="mr-1 h-4 w-4" />
                                  編集
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDelete(test.id)}
                                  className="text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="mr-1 h-4 w-4" />
                                  削除
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-5">
                {Object.entries(groupedBySession)
                  .sort(([idA], [idB]) => {
                    const sessionA = testSessions.find((ts) => ts.id === idA)
                    const sessionB = testSessions.find((ts) => ts.id === idB)
                    const dateA = sessionA?.test_date ? new Date(sessionA.test_date).getTime() : 0
                    const dateB = sessionB?.test_date ? new Date(sessionB.test_date).getTime() : 0
                    return dateB - dateA
                  })
                  .map(([sessionId, testsInSession]) => {
                  const testSession = testSessions.find((ts) => ts.id === sessionId)
                  const sessionLabel = testSession?.description || "未分類"

                  return (
                    <div key={sessionId} className="rounded-lg border bg-card overflow-hidden">
                      <div className="px-4 py-3 bg-[#00417A]/5 border-b flex items-center justify-between gap-2">
                        {editingSessionId === sessionId ? (
                          <div className="flex items-center gap-2 flex-1">
                            <Input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveRename(sessionId, sessionLabel)
                                if (e.key === "Escape") cancelRename()
                              }}
                              autoFocus
                              className="h-8 text-sm font-bold text-[#00417A]"
                              placeholder="セッション名"
                            />
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-[#00417A] hover:bg-[#00417A]/90"
                              onClick={() => saveRename(sessionId, sessionLabel)}
                              disabled={renameSaving}
                            >
                              {renameSaving ? "保存中..." : "保存"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={cancelRename}
                              disabled={renameSaving}
                            >
                              キャンセル
                            </Button>
                          </div>
                        ) : (
                          <h4 className="text-base font-bold text-[#00417A]">{sessionLabel}</h4>
                        )}
                        {sessionId !== "unassigned" && editingSessionId !== sessionId && (
                          <div className="flex gap-2">
                            <Link href={`/admin/test-sessions/${sessionId}/assignments`}>
                              <Button variant="outline" size="sm" className="h-7 text-xs">
                                <Users className="w-3 h-3 mr-1" />
                                割当を編集
                              </Button>
                            </Link>
                            {/* 2026-10-28 熊木先生要望: セッション名をその場で編集(インライン) */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => startRename(sessionId, sessionLabel)}
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              名称変更
                            </Button>
                            {/* 2026-07-03 副田さん要望: 試験セッション削除ボタン */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                              onClick={() => handleDeleteTestSession(sessionId, sessionLabel)}
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              削除
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="divide-y">
                        {testsInSession.length === 0 && (
                          <div className="px-4 py-4 text-sm text-muted-foreground italic">
                            このセッションにはテスト（評価シート）がまだ登録されていません。「新規作成」からテストを追加してください。
                          </div>
                        )}
                        {testsInSession.map((test) => {
                          const subjectName = subjects.find((s) => s.code === (test as any).subjectCode)?.name || (test as any).subjectCode
                          return (
                            <div key={test.id} className="flex items-center justify-between px-4 py-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    (test as any).roleType === "patient"
                                      ? "bg-pink-100 text-pink-800"
                                      : "bg-blue-100 text-blue-800"
                                  }`}>
                                    {testLabelMap[test.id] || ((test as any).roleType === "patient" ? "患者役側" : "教員側")}
                                  </span>
                                  <h5 className="font-semibold text-[#00417A]">{test.title}</h5>
                                </div>
                                <p className="text-sm text-gray-500 mt-0.5">
                                  {(test as any).subjectCode && (
                                    <>教科: {subjectName} | </>
                                  )}
                                  シート数: {test.sheets.length} | 作成日: {new Date(test.createdAt).toLocaleDateString("ja-JP")}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => openDuplicateDialog(test.id)}>
                                  <Copy className="mr-1 h-4 w-4" />
                                  複製
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handleEdit(test.id)}>
                                  <Edit className="mr-1 h-4 w-4" />
                                  編集
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDelete(test.id)}
                                  className="text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="mr-1 h-4 w-4" />
                                  削除
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 複製ダイアログ */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>テストの複製</DialogTitle>
          </DialogHeader>
          {duplicateSourceId && (() => {
            const source = tests.find((t) => t.id === duplicateSourceId)
            if (!source) return null
            const sourceSession = testSessions.find((ts) => ts.id === (source as any).testSessionId)
            return (
              <div className="space-y-5">
                {/* 元テスト情報 */}
                <div className="px-3 py-2 rounded-md bg-secondary/50 border">
                  <p className="text-xs text-muted-foreground">複製元</p>
                  <p className="text-sm font-medium">{source.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sourceSession?.description || "未分類"} / {(source as any).roleType === "patient" ? "患者役側" : "教員側"}
                  </p>
                </div>

                {/* ステップ1: 複製先のテスト */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">複製先のテスト</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={`flex-1 py-2 px-3 rounded-md text-sm font-medium border transition-colors ${
                        duplicateMode === "same"
                          ? "bg-[#00417A] text-white border-[#00417A]"
                          : "bg-card text-foreground border-border hover:bg-secondary"
                      }`}
                      onClick={() => {
                        setDuplicateMode("same")
                        setDuplicateTargetSessionId((source as any).testSessionId || "")
                        setDuplicateStep(2)
                      }}
                    >
                      同一テストに追加
                    </button>
                    <button
                      type="button"
                      className={`flex-1 py-2 px-3 rounded-md text-sm font-medium border transition-colors ${
                        duplicateMode === "new"
                          ? "bg-[#00417A] text-white border-[#00417A]"
                          : "bg-card text-foreground border-border hover:bg-secondary"
                      }`}
                      onClick={() => {
                        setDuplicateMode("new")
                        setDuplicateTargetSessionId("")
                        setDuplicateStep(1)
                      }}
                    >
                      別のテストに複製
                    </button>
                  </div>
                  {duplicateMode === "same" && sourceSession && (
                    <p className="text-xs text-muted-foreground px-1">
                      {sourceSession.description} に追加されます
                    </p>
                  )}
                  {duplicateMode === "new" && (
                    <div className="space-y-2 pt-1">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={`flex-1 py-1.5 px-2 rounded text-xs font-medium border transition-colors ${
                            duplicateNewSessionMode === "existing"
                              ? "bg-secondary text-foreground border-border"
                              : "bg-card text-muted-foreground border-border hover:bg-secondary/50"
                          }`}
                          onClick={() => setDuplicateNewSessionMode("existing")}
                        >
                          既存テストから選択
                        </button>
                        <button
                          type="button"
                          className={`flex-1 py-1.5 px-2 rounded text-xs font-medium border transition-colors ${
                            duplicateNewSessionMode === "create"
                              ? "bg-secondary text-foreground border-border"
                              : "bg-card text-muted-foreground border-border hover:bg-secondary/50"
                          }`}
                          onClick={() => setDuplicateNewSessionMode("create")}
                        >
                          新規テスト作成
                        </button>
                      </div>
                      {duplicateNewSessionMode === "existing" && (
                        <Select value={duplicateTargetSessionId} onValueChange={(val) => {
                          setDuplicateTargetSessionId(val)
                          setDuplicateStep(2)
                        }}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="複製先のテストを選択" />
                          </SelectTrigger>
                          <SelectContent>
                            {testSessions
                              .filter((ts) => ts.id !== (source as any).testSessionId)
                              .map((ts) => (
                                <SelectItem key={ts.id} value={ts.id}>
                                  {ts.description || "(名称未設定)"}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                      {duplicateNewSessionMode === "create" && (
                        <div className="space-y-2 p-3 rounded-md border bg-secondary/30">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">実施日</Label>
                              <Input
                                type="date"
                                className="h-8 text-sm"
                                value={dupNewTestDate}
                                onChange={(e) => {
                                  setDupNewTestDate(e.target.value)
                                  if (e.target.value && dupNewTestName.trim()) setDuplicateStep(2)
                                }}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">テスト名</Label>
                              <Input
                                className="h-8 text-sm"
                                value={dupNewTestName}
                                onChange={(e) => {
                                  setDupNewTestName(e.target.value)
                                  if (dupNewTestDate && e.target.value.trim()) setDuplicateStep(2)
                                }}
                                placeholder="例: 全身医療面接"
                              />
                            </div>
                          </div>
                          {dupGeneratedDescription && (
                            <div className="px-2 py-1.5 bg-blue-50 rounded border border-blue-200">
                              <p className="text-xs text-muted-foreground">登録名称:</p>
                              <p className="text-sm font-medium text-blue-900">{dupGeneratedDescription}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ステップ2: ロールタイプ（複製先決定後に表示） */}
                {duplicateStep >= 2 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">ロールタイプ</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium border-2 transition-colors ${
                          duplicateStep >= 3 && duplicateRoleType === "teacher"
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-card text-blue-700 border-blue-300 hover:bg-blue-50"
                        }`}
                        onClick={() => {
                          setDuplicateRoleType("teacher")
                          setDuplicateStep(3)
                        }}
                      >
                        教員側
                      </button>
                      <button
                        type="button"
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium border-2 transition-colors ${
                          duplicateStep >= 3 && duplicateRoleType === "patient"
                            ? "bg-pink-600 text-white border-pink-600"
                            : "bg-card text-pink-700 border-pink-300 hover:bg-pink-50"
                        }`}
                        onClick={() => {
                          setDuplicateRoleType("patient")
                          setDuplicateStep(3)
                        }}
                      >
                        患者役側
                      </button>
                    </div>
                  </div>
                )}

                {/* ステップ3: 実行ボタン（ロール選択後に表示） */}
                {duplicateStep >= 3 && (
                  <div className="pt-2">
                    <Button
                      className="w-full bg-[#00417A] hover:bg-[#00417A]/90"
                      onClick={executeDuplicate}
                      disabled={duplicateLoading}
                    >
                      {duplicateLoading ? (
                        <>
                          <Hourglass className="mr-2 h-4 w-4 animate-pulse" />
                          処理中...
                        </>
                      ) : (
                        "複製を実行"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
