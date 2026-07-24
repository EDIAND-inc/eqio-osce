"use client"

import { useEffect, useState, useCallback } from "react"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
// 2026-07-03 副田さん再要望対応: shadcn Table の overflow-x-auto ラッパーが
// sticky を妨げるため、raw <table> で書き換え。unused import を削除。
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Download, StopCircle, ChevronDown, ChevronRight } from "lucide-react"
import {
  loadStudents,
  loadEvaluationResults,
  loadAttendanceRecords,
  loadTests,
  loadTeachers,
  loadPatients,
  OVERALL_COMMENT_KEY,
  type Student,
  type EvaluationResult,
  type AttendanceRecord,
  type Test,
  type Teacher,
  type Patient,
} from "@/lib/data-storage"
import { computePassResult } from "@/lib/passing"
import { useSession } from "@/lib/auth/use-session"
import { StatusPill, type StatusKind } from "@/components/ui/status-pill"
import { EmptyState } from "@/components/ui/empty-state"

// ADR-005 hotfix: テスト終了ボタンを表示できる accountType / role の集合
// (api-guard.ts ADMIN_ROLES と意味的に対応)
const TEST_END_ALLOWED_ROLES = new Set([
  "master_admin",
  "university_admin",
  "subject_admin",
  "admin",
  "special_master",
  "university_master",
])

export default function StudentsDetailPage() {
  const { session } = useSession()
  // ADR-005 hotfix: admin 権限がないユーザーには「テスト終了」ボタンを非表示
  const canEndTest = !!session && (
    TEST_END_ALLOWED_ROLES.has(session.role || "") ||
    TEST_END_ALLOWED_ROLES.has(session.accountType || "")
  )
  const [students, setStudents] = useState<Student[]>([])
  const [evaluations, setEvaluations] = useState<EvaluationResult[]>([])
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [tests, setTests] = useState<Test[]>([])
  const [testSessions, setTestSessions] = useState<any[]>([])
  // 2026-07-13: 教員①②/患者役の slot 順を assignments の slot_index で決めるため保持
  const [teacherAssignments, setTeacherAssignments] = useState<Teacher[]>([])
  const [patientAssignments, setPatientAssignments] = useState<Patient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEndingTest, setIsEndingTest] = useState(false)
  const [filterUniversity, setFilterUniversity] = useState<string>("")
  const [filterTestSessionId, setFilterTestSessionId] = useState<string>("")
  // 2026-07-03 副田さん要望: 「内容」列 (問題ごとの点数) をアコーディオン開閉
  const [contentExpanded, setContentExpanded] = useState(false)
  // 2026-07-16 副田さん要望: 列名クリックでソート。既定は学籍番号の昇順。
  const [sortKey, setSortKey] = useState<string>("studentId")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }
  // アクティブ列は ▲/▼、非アクティブ列は薄い ⇅ を表示
  const sortCaret = (key: string) =>
    sortKey === key ? (
      <span className="ml-0.5 text-primary">{sortDir === "asc" ? "▲" : "▼"}</span>
    ) : (
      <span className="ml-0.5 text-muted-foreground/30">⇅</span>
    )
  const SORTABLE_TH = "cursor-pointer select-none hover:text-foreground transition-colors"

  // 2026-07-10 副田さん要望 (案 C ハイブリッド自動更新): 受験者一覧を
  //   タブフォーカス時 + 30 秒 polling で自動再取得。fetchData を useCallback
  //   でラップして stable な参照にする。
  const fetchData = useCallback(async (opts: { silent?: boolean } = {}) => {
    const params = new URLSearchParams(window.location.search)
    const university = params.get("university") || ""
    try {
      const testSessionId = sessionStorage.getItem("testSessionId") || ""
      const [studentsData, evaluationsData, attendanceData, testsData, testSessionsData, teachersData, patientsData] = await Promise.all([
        loadStudents(university || undefined, undefined, testSessionId),
        loadEvaluationResults(university || undefined, testSessionId),
        loadAttendanceRecords(university || undefined, testSessionId),
        loadTests(university || undefined),
        fetch("/api/test-sessions")
          .then((res) => res.json())
          .catch(() => []),
        testSessionId ? loadTeachers(university || undefined, undefined, testSessionId) : Promise.resolve([]),
        testSessionId ? loadPatients(university || undefined, undefined, testSessionId) : Promise.resolve([]),
      ])

      setStudents(Array.isArray(studentsData) ? studentsData : [])
      setEvaluations(Array.isArray(evaluationsData) ? evaluationsData : [])
      setAttendanceRecords(Array.isArray(attendanceData) ? attendanceData : [])
      setTests(Array.isArray(testsData) ? testsData : [])
      setTestSessions(Array.isArray(testSessionsData) ? testSessionsData : [])
      setTeacherAssignments(Array.isArray(teachersData) ? teachersData : [])
      setPatientAssignments(Array.isArray(patientsData) ? patientsData : [])
    } catch (error) {
    } finally {
      if (!opts.silent) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // URL パラメータ初期化 (初回のみ)
    const params = new URLSearchParams(window.location.search)
    setFilterUniversity(params.get("university") || "")
    setFilterTestSessionId(params.get("testSessionId") || "")
    void fetchData()
  }, [fetchData])

  const autoRefreshHandler = useCallback(() => fetchData({ silent: true }), [fetchData])
  useAutoRefresh(autoRefreshHandler, 30000)

  const filteredTests = filterTestSessionId
    ? tests.filter((test) => test.testSessionId === filterTestSessionId)
    : tests

  // 2026-07-03 副田さん要望: 現セッションのテストから教員① / 教員② / 患者役 slot を割り出す
  const sessionTests = filteredTests.slice().sort((a, b) => {
    // teacher を先に、その中で createdAt 昇順
    const ra = ((a as any).roleType || "teacher") === "teacher" ? 0 : 1
    const rb = ((b as any).roleType || "teacher") === "teacher" ? 0 : 1
    if (ra !== rb) return ra - rb
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  })
  const teacherSlotTests = sessionTests.filter((t) => ((t as any).roleType || "teacher") === "teacher")
  const patientSlotTests = sessionTests.filter((t) => (t as any).roleType === "patient")

  // 2026-07-03: 「内容」列 (問題別点数) の列を組み立てる
  //   問題文を列名にする。教員側テストの全問題 + 患者側テストの全問題を横に並べる。
  interface ContentColumn {
    testId: string
    testTitle: string
    roleType: "teacher" | "patient"
    sheetTitle: string
    categoryNumber: number
    categoryTitle: string
    questionNumber: number
    questionText: string
    compositeKey: string  // カテゴリ跨ぎで一意
    maxScore: number  // 2026-07-11: scoreMap の max (question > category > 5)
  }
  const contentColumns: ContentColumn[] = []
  for (const test of sessionTests) {
    const role: "teacher" | "patient" = ((test as any).roleType || "teacher") === "teacher" ? "teacher" : "patient"
    for (const sheet of test.sheets || []) {
      for (const cat of sheet.categories || []) {
        // 2026-07-11 副田さん要望: カテゴリー単位 scoreMap を満点に反映 (問題個別があれば優先)
        const catMap = Array.isArray((cat as any).scoreMap) && (cat as any).scoreMap.length > 0
          ? (cat as any).scoreMap as number[]
          : [1, 2, 3, 4, 5]
        for (const q of (cat as any).questions || []) {
          const qMap = Array.isArray((q as any).scoreMap) && (q as any).scoreMap.length > 0
            ? (q as any).scoreMap as number[]
            : null
          const effMap = qMap || catMap
          contentColumns.push({
            testId: test.id,
            testTitle: test.title,
            roleType: role,
            sheetTitle: sheet.title,
            categoryNumber: cat.number,
            categoryTitle: cat.title,
            questionNumber: q.number,
            questionText: q.text || "",
            compositeKey: `${cat.number}-${q.number}`,
            maxScore: Math.max(...effMap),
          })
        }
      }
    }
  }
  // カテゴリ+質問の重複を除去
  const seenKeys = new Set<string>()
  const dedupedContentColumns: ContentColumn[] = []
  for (const col of contentColumns) {
    const k = `${col.testId}::${col.compositeKey}`
    if (seenKeys.has(k)) continue
    seenKeys.add(k)
    dedupedContentColumns.push(col)
  }

  // セッションの合計満点 (各問題の実 maxScore を合算)
  const sessionMaxTotal = dedupedContentColumns.reduce((sum, c) => sum + c.maxScore, 0)

  // 2026-07-13: 部屋 → slot 順 (CSV の教員①②順 = slot_index) の採点者メール配列。
  //   slot_index が揃っていれば実 index として疎配置、無ければメール昇順フォールバック。
  const buildRoomEmailOrder = (
    people: Array<{ email?: string; assignedRoomNumber?: string; slotIndex?: number }>,
  ): Record<string, string[]> => {
    const byRoom: Record<string, Array<{ email: string; slot: number | null }>> = {}
    for (const p of people) {
      const room = p.assignedRoomNumber || ""
      const email = (p.email || "").toLowerCase()
      if (!room || !email) continue
      ;(byRoom[room] ||= []).push({ email, slot: typeof p.slotIndex === "number" ? p.slotIndex : null })
    }
    const out: Record<string, string[]> = {}
    for (const [room, arr] of Object.entries(byRoom)) {
      const allSlot = arr.length > 0 && arr.every((x) => typeof x.slot === "number")
      if (allSlot) {
        const maxSlot = Math.max(...arr.map((x) => x.slot as number))
        const dense: string[] = new Array(maxSlot + 1).fill("")
        for (const x of arr) dense[x.slot as number] = x.email
        out[room] = dense
      } else {
        out[room] = arr.slice().sort((a, b) => a.email.localeCompare(b.email)).map((x) => x.email)
      }
    }
    return out
  }
  const teacherEmailsByRoom = buildRoomEmailOrder(teacherAssignments)
  const patientEmailsByRoom = buildRoomEmailOrder(patientAssignments)

  const getStudentData = (student: Student) => {
    // ADR-005 F5: attendance_records.student_id / exam_results.student_id は students.id (UUID) を参照する。
    // student.studentId(学籍番号 text)で比較していたため常に miss して全員「未受験」扱いになっていた。
    const studentAttendance = attendanceRecords.find((a) => a.studentId === student.id)

    const studentEvaluations = evaluations.filter((e) => {
      if (e.studentId !== student.id) return false
      if (!filterTestSessionId) return true

      // 2026-07-11 副田さん報告バグ修正: exam_results には test_id が無く、評価は
      //   test_session_id を直接持つ。旧実装は `tests.find(t => t.id === e.testId)`
      //   で照合していたが e.testId は常に undefined → 全評価が除外され「未受験」に
      //   なっていた。評価の testSessionId を直接比較する。
      return (e as any).testSessionId === filterTestSessionId
    })

    const completedEvaluations = studentEvaluations.filter((e) => e.isCompleted)
    const totalScore = completedEvaluations.reduce((sum, e) => sum + (e.totalScore || 0), 0)
    const averageScore = completedEvaluations.length > 0 ? Math.round(totalScore / completedEvaluations.length) : 0

    // Calculate teacher and patient scores separately
    const teacherEvals = completedEvaluations.filter((e: any) => e.evaluatorType === "teacher")
    const patientEvals = completedEvaluations.filter((e: any) => e.evaluatorType === "patient")
    const teacherScore = teacherEvals.reduce((sum, e) => sum + (e.totalScore || 0), 0)
    const patientScore = patientEvals.reduce((sum, e) => sum + (e.totalScore || 0), 0)
    const combinedScore = teacherScore + patientScore

    // 2026-07-13 副田さん要望: 教員①/教員②/患者役 の個別点数。
    //   slot 順は assignments の slot_index (CSV の教員①②順) を正とする。学生の部屋の
    //   割当採点者をその順で並べる。割当が取れない場合のみ、採点者メール昇順にフォールバック。
    const studentRoom = (student as any).roomNumber || ""
    const roomTeacherEmails =
      (studentRoom && teacherEmailsByRoom[studentRoom]) ||
      teacherEvals
        .map((e: any) => (e.evaluatorEmail || e.evaluatorId || "").toLowerCase())
        .filter((email, idx, arr) => email && arr.indexOf(email) === idx)
        .sort((a, b) => a.localeCompare(b))
    const roomPatientEmails =
      (studentRoom && patientEmailsByRoom[studentRoom]) ||
      patientEvals
        .map((e: any) => (e.evaluatorEmail || e.evaluatorId || "").toLowerCase())
        .filter((email, idx, arr) => email && arr.indexOf(email) === idx)
        .sort((a, b) => a.localeCompare(b))

    // 割当メールは小文字化されているので、採点者側も小文字化して照合する
    const teacherSlotScores: (number | "")[] = teacherSlotTests.map((_, slotIdx) => {
      const email = roomTeacherEmails[slotIdx]
      if (!email) return ""
      const evalsForSlot = teacherEvals.filter((e: any) => (e.evaluatorEmail || e.evaluatorId || "").toLowerCase() === email)
      if (evalsForSlot.length === 0) return ""
      return evalsForSlot.reduce((sum, e) => sum + (e.totalScore || 0), 0)
    })
    const patientSlotScores: (number | "")[] = patientSlotTests.map((_, slotIdx) => {
      const email = roomPatientEmails[slotIdx]
      if (!email) return ""
      const evalsForSlot = patientEvals.filter((e: any) => (e.evaluatorEmail || e.evaluatorId || "").toLowerCase() === email)
      if (evalsForSlot.length === 0) return ""
      return evalsForSlot.reduce((sum, e) => sum + (e.totalScore || 0), 0)
    })

    // 2026-07-11 副田さん報告バグ修正: 問題別スコア (「内容」列用)。
    //   exam_results には test_id が無いため、旧実装の `ev.testId === col.testId` は
    //   常に false で内容が空だった。col のテストが role 内の何番目 (slot) かを求め、
    //   その slot 担当者 (メール) の評価から compositeKey で点数を引く。
    const contentScores: Record<string, number | ""> = {}
    for (const col of dedupedContentColumns) {
      const slotTests = col.roleType === "teacher" ? teacherSlotTests : patientSlotTests
      const slotEmails = col.roleType === "teacher" ? roomTeacherEmails : roomPatientEmails
      const slotIdx = slotTests.findIndex((t: any) => t.id === col.testId)
      const slotEmail = slotIdx >= 0 ? slotEmails[slotIdx] : undefined
      let val: number | "" = ""
      if (slotEmail) {
        const ev = completedEvaluations.find(
          (e: any) => e.evaluatorType === col.roleType && (e.evaluatorEmail || e.evaluatorId || "").toLowerCase() === slotEmail,
        )
        const answers = (ev as any)?.answers as Record<string, number> | undefined
        const v = answers ? (answers[col.compositeKey] ?? answers[col.questionNumber as any]) : undefined
        if (typeof v === "number") val = v
      }
      contentScores[`${col.testId}::${col.compositeKey}`] = val
    }

    // 2026-07-24 熊木先生要望: コメント(設問別 + 総評)を教員内部向けに集約
    const commentEntries: { slot: string; label: string; text: string }[] = []
    for (const e of studentEvaluations) {
      const ans = (e as any).answers as Record<string, unknown> | undefined
      if (!ans) continue
      const email = ((e as any).evaluatorEmail || (e as any).evaluatorId || "").toLowerCase()
      const isTeacher = (e as any).evaluatorType === "teacher"
      const emails = isTeacher ? roomTeacherEmails : roomPatientEmails
      const idx = emails.indexOf(email)
      const slot = isTeacher
        ? `教員${["①", "②", "③", "④"][idx] ?? (idx >= 0 ? idx + 1 : "")}`
        : roomPatientEmails.length > 1
          ? `患者役${idx >= 0 ? idx + 1 : ""}`
          : "患者役"
      for (const [k, v] of Object.entries(ans)) {
        if (typeof v !== "string" || v.trim() === "") continue
        if (k === OVERALL_COMMENT_KEY) {
          commentEntries.push({ slot, label: "総評", text: v })
        } else if (k.startsWith("comment:")) {
          const ck = k.slice("comment:".length)
          const col = dedupedContentColumns.find((c) => c.compositeKey === ck)
          commentEntries.push({ slot, label: col ? col.questionText || `問${ck}` : `問${ck}`, text: v })
        }
      }
    }

    // 2026-07-03 副田さん要望: 割合 = 合計得点 / セッション満点 × 100
    const percentage = sessionMaxTotal > 0 ? Math.round((combinedScore / sessionMaxTotal) * 100) : null
    const isBelow50 = percentage !== null && percentage < 50 && completedEvaluations.length > 0

    // ADR-006: 合格判定を passing_score (% 0-100) で行う
    const currentSessionId = sessionStorage.getItem("testSessionId") || filterTestSessionId
    const currentSession = testSessions.find((s: any) => s.id === currentSessionId)
    const passingScore = currentSession?.passing_score
    const passDetail = computePassResult({
      evaluations: completedEvaluations.map((e: any) => ({
        totalScore: e.totalScore,
        maxScore: e.maxScore,
        isCompleted: e.isCompleted,
        evaluatorType: e.evaluatorType,
      })),
      passingScore,
    })
    const passResult = passDetail.result

    // ADR-005 F5: 旧実装は filteredTests[0].title を全行にコピーしていたため、
    // testSessionId フィルタが効いていない場合は他大学の test 名がそのまま表示されていた。
    // 試験セッション名(description)は学生横串で意味のある単一値なのでこれを採用する。
    const sessionForRow = currentSession || testSessions.find((s: any) => s.id === filterTestSessionId)
    const testTitle = sessionForRow?.description || ""

    let status = "未受験"
    if (studentAttendance?.status === "present") {
      if (completedEvaluations.length > 0) {
        status = "完了"
      } else {
        status = "進行中"
      }
    } else if (studentAttendance?.status === "absent") {
      status = "欠席"
    }

    const progress = completedEvaluations.length > 0 ? "完了" : studentAttendance?.status === "present" ? "進行中" : ""

    return {
      testTitle,
      progress,
      score: combinedScore > 0 ? combinedScore : "",
      teacherScore: teacherEvals.length > 0 ? teacherScore : "",
      patientScore: patientEvals.length > 0 ? patientScore : "",
      passResult,
      status,
      // 2026-07-13 副田さん要望: ステータス列を出欠表示に。present/absent/"" (未確認)
      attendanceStatus: (studentAttendance?.status as string) || "",
      hasEvaluations: completedEvaluations.length > 0,
      // 2026-07-03: 新項目
      teacherSlotScores,
      patientSlotScores,
      contentScores,
      percentage,
      isBelow50,
      combinedScore,
      // 2026-07-24: コメント(教員内部)
      commentEntries,
    }
  }

  const currentSessionId = typeof window !== "undefined" ? (sessionStorage.getItem("testSessionId") || filterTestSessionId) : filterTestSessionId
  const currentSession = testSessions.find((s: any) => s.id === currentSessionId)
  const sessionStatus = currentSession?.status || "not_started"

  // 2026-07-13 副田さん要望: 学籍番号の数値順に並べ、同一学籍番号の重複を排除(採点/出席のある方を優先)。
  //   重複は架空大学 SMUD4xxx の重複コピー等で起こりうるため、表示側でも防御的に 1 名にまとめる。
  const studentHasData = (st: Student) =>
    attendanceRecords.some((a) => a.studentId === st.id) ||
    evaluations.some((e) => e.studentId === st.id)
  const dedupedStudents = (() => {
    const byId = new Map<string, Student>()
    for (const s of students) {
      const key = s.studentId
      const existing = byId.get(key)
      if (!existing) { byId.set(key, s); continue }
      if (!studentHasData(existing) && studentHasData(s)) byId.set(key, s)
    }
    return Array.from(byId.values())
  })()
  const parseSeat = (v: string): number | null => {
    const n = parseInt(v, 10)
    return Number.isNaN(n) ? null : n
  }

  // 2026-07-16 副田さん要望: 列名クリックでソート。
  //   各行の表示データ (getStudentData) を先に 1 度だけ計算し、その値でソート/描画する。
  type StudentRow = { student: Student; data: ReturnType<typeof getStudentData> }
  const studentRows: StudentRow[] = dedupedStudents.map((student) => ({ student, data: getStudentData(student) }))

  // 学籍番号(数値)を第 2 キーにした安定タイブレーク
  const seatCompare = (a: StudentRow, b: StudentRow): number => {
    const na = parseSeat(a.student.studentId), nb = parseSeat(b.student.studentId)
    if (na != null && nb != null && na !== nb) return na - nb
    if (na != null && nb == null) return -1
    if (na == null && nb != null) return 1
    return (a.student.studentId || "").localeCompare(b.student.studentId || "")
  }
  // ソートキーごとの比較値 (number は数値、string は文字列、未入力は null=常に末尾)
  const sortValueFor = (row: StudentRow, key: string): number | string | null => {
    const { student, data } = row
    if (key === "studentId") return parseSeat(student.studentId)
    if (key === "name") return student.name || ""
    if (key === "room") return student.roomNumber || ""
    if (key === "email") return student.email || ""
    if (key === "score") return typeof data.score === "number" ? data.score : null
    if (key === "percentage") return data.percentage ?? null
    if (key === "attendance") {
      // 出席 → 欠席 → 未確認 の順
      return data.attendanceStatus === "present" ? 0 : data.attendanceStatus === "absent" ? 1 : 2
    }
    if (key.startsWith("teacher:")) {
      const v = data.teacherSlotScores[Number(key.slice(8))]
      return typeof v === "number" ? v : null
    }
    if (key.startsWith("patient:")) {
      const v = data.patientSlotScores[Number(key.slice(8))]
      return typeof v === "number" ? v : null
    }
    if (key.startsWith("content:")) {
      const v = data.contentScores[key.slice(8)]
      return typeof v === "number" ? v : null
    }
    return null
  }
  const sortedRows = studentRows.slice().sort((a, b) => {
    const va = sortValueFor(a, sortKey)
    const vb = sortValueFor(b, sortKey)
    const aEmpty = va == null || va === ""
    const bEmpty = vb == null || vb === ""
    // 未入力は方向に関わらず常に末尾へ
    if (aEmpty && bEmpty) return seatCompare(a, b)
    if (aEmpty) return 1
    if (bEmpty) return -1
    let c: number
    if (typeof va === "number" && typeof vb === "number") c = va - vb
    else c = String(va).localeCompare(String(vb), "ja")
    if (c === 0) return seatCompare(a, b)
    return sortDir === "asc" ? c : -c
  })

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "not_started": return "未実施"
      case "in_progress": return "実施中"
      case "completed": return "テスト終了"
      default: return status
    }
  }

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "completed": return "destructive"
      case "in_progress": return "default"
      default: return "outline"
    }
  }

  const handleEndTest = async () => {
    if (!currentSessionId) {
      alert("試験セッションが選択されていません。ダッシュボードから受験者一覧を開き直してください。")
      return
    }
    setIsEndingTest(true)
    try {
      const res = await fetch(`/api/test-sessions/${currentSessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      })
      if (res.ok) {
        setTestSessions((prev) =>
          prev.map((s) => (s.id === currentSessionId ? { ...s, status: "completed" } : s))
        )
      } else {
        // ADR-005 hotfix: 旧実装は silent fail だったため何が起きているか不明だった
        let detail = ""
        try {
          const j = await res.json()
          detail = j?.error ? `: ${j.error}` : ""
        } catch {}
        if (res.status === 401) {
          alert(`ログインセッションが切れている可能性があります。再度ログインしてください${detail}`)
        } else if (res.status === 403) {
          alert(`このアカウントには「テスト終了」操作の権限がありません(管理者・大学管理者のみ可能)${detail}`)
        } else {
          alert(`テスト終了に失敗しました (HTTP ${res.status})${detail}`)
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      alert(`テスト終了処理でネットワークエラー: ${msg}`)
    } finally {
      setIsEndingTest(false)
    }
  }

  const handleExportCSV = () => {
    // 2026-07-03 副田さん要望に合わせて列を再構成
    const CIRCLE = ["①", "②", "③", "④", "⑤"]
    const teacherHeaders = teacherSlotTests.map((_, i) =>
      `教員${teacherSlotTests.length > 1 ? CIRCLE[i] || `(${i + 1})` : ""}`,
    )
    const patientHeaders = patientSlotTests.map((_, i) =>
      `患者役${patientSlotTests.length > 1 ? CIRCLE[i] || `(${i + 1})` : ""}`,
    )
    const contentHeaders = dedupedContentColumns.map(
      (col) => `${col.categoryTitle}/${col.questionText}`,
    )
    const headers = [
      "学籍番号",
      "氏名",
      "部屋",
      "メールアドレス",
      ...contentHeaders,
      "点数",
      ...teacherHeaders,
      ...patientHeaders,
      "割合",
      "出欠",
      "コメント",
    ]
    const rows = sortedRows.map(({ student, data }) => {
      return [
        student.studentId,
        student.name,
        student.roomNumber || "",
        student.email || "",
        ...dedupedContentColumns.map((col) => {
          const val = data.contentScores[`${col.testId}::${col.compositeKey}`]
          return typeof val === "number" ? String(val) : ""
        }),
        typeof data.score === "number" ? String(data.score) : "",
        ...data.teacherSlotScores.map((s) => (typeof s === "number" ? String(s) : "")),
        ...data.patientSlotScores.map((s) => (typeof s === "number" ? String(s) : "")),
        data.percentage != null ? `${data.percentage}%` : "",
        data.attendanceStatus === "present" ? "出席" : data.attendanceStatus === "absent" ? "欠席" : "未確認",
        data.commentEntries.map((c) => `【${c.slot}】${c.label}：${c.text}`).join(" / "),
      ]
    })

    const bom = "\uFEFF"
    const csvContent = bom + [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    const sessionDesc = currentSession?.description || "students"
    link.download = `${sessionDesc}_受験者一覧.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="inline-flex items-center gap-2.5 text-muted-foreground">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <span className="text-sm">データ読み込み中...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">受験者一覧</h1>
              <Badge variant={getStatusVariant(sessionStatus)} className="text-sm px-3 py-1">
                {getStatusLabel(sessionStatus)}
              </Badge>
            </div>
            {(filterUniversity || filterTestSessionId) && (
              <p className="text-sm text-muted-foreground mt-1">
                {filterUniversity && `大学: ${filterUniversity}`}
                {filterUniversity && filterTestSessionId && " / "}
                {filterTestSessionId && (() => {
                  const session = testSessions.find((s: any) => s.id === filterTestSessionId)
                  return `試験: ${session?.description || filterTestSessionId}`
                })()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleExportCSV} variant="outline" className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              CSV出力
            </Button>

            {/* ADR-005 hotfix: admin 権限がないユーザー(教員一般 / 患者役)には非表示 */}
            {canEndTest && sessionStatus !== "completed" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="flex items-center gap-2" disabled={isEndingTest}>
                    <StopCircle className="w-4 h-4" />
                    テスト終了
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>テストを終了しますか？</AlertDialogTitle>
                    <AlertDialogDescription>
                      この操作により、テストセッションのステータスが「テスト終了」に変更されます。この操作は取り消せません。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>キャンセル</AlertDialogCancel>
                    <AlertDialogAction onClick={handleEndTest} disabled={isEndingTest}>
                      {isEndingTest ? "処理中..." : "テスト終了"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <Button onClick={() => (window.location.href = "/admin/dashboard")} variant="outline">
              ダッシュボードに戻る
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-baseline gap-3">
              <CardTitle>全受験者</CardTitle>
              {/* 2026-07-03 副田さん要望: セッションタイトル + 合計点表示 */}
              {currentSession?.description && (
                <span className="text-base font-medium text-primary">
                  {currentSession.description}
                </span>
              )}
              {sessionMaxTotal > 0 && (
                <span className="text-sm text-muted-foreground">
                  合計点: <span className="font-semibold text-foreground">{sessionMaxTotal}</span> 点満点
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* 2026-07-03 副田さん要望: 内容 (問題別点数) の表示切替 */}
            <div className="mb-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setContentExpanded((v) => !v)}
                className="h-8 text-xs"
              >
                {contentExpanded ? (
                  <ChevronDown className="w-3 h-3 mr-1" />
                ) : (
                  <ChevronRight className="w-3 h-3 mr-1" />
                )}
                内容 (全 {dedupedContentColumns.length} 問) を{contentExpanded ? "非表示" : "表示"}
              </Button>
            </div>
            {/* 2026-07-03 副田さん再要望: 列名スクロール固定 + 横スクロール常に表示
                shadcn <Table> は内部で overflow-x-auto の div を wrap するため、
                縦スクロール container 内で thead の sticky が効かない。
                生の <table> で書き換えて sticky を確実に効かせる。 */}
            <div
              className="border rounded-md max-h-[70vh]"
              style={{
                overflowX: "scroll",   // 横スクロールバー常時表示
                overflowY: "auto",     // 縦は必要時のみ
              }}
            >
              <table className="w-max min-w-full text-sm caption-bottom">
                <thead className="sticky top-0 z-20 bg-white shadow-sm">
                  {/* 2026-07-12 デザイン Phase 2-3: ヘッダーをラベル調 (小さめ太字・グレー) に。
                      数値列は右揃え。 */}
                  {/* 2026-07-16 副田さん要望: 列名クリックでソート (再クリックで昇順⇔降順) */}
                  <tr className="border-b-2 border-primary/15">
                    <th onClick={() => toggleSort("studentId")} className={`h-10 px-2 text-left align-middle text-[11px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap bg-white ${SORTABLE_TH}`}>学籍番号{sortCaret("studentId")}</th>
                    <th onClick={() => toggleSort("name")} className={`h-10 px-2 text-left align-middle text-[11px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap bg-white ${SORTABLE_TH}`}>氏名{sortCaret("name")}</th>
                    <th onClick={() => toggleSort("room")} className={`h-10 px-2 text-left align-middle text-[11px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap bg-white ${SORTABLE_TH}`}>部屋{sortCaret("room")}</th>
                    <th onClick={() => toggleSort("email")} className={`h-10 px-2 text-left align-middle text-[11px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap bg-white ${SORTABLE_TH}`}>メールアドレス{sortCaret("email")}</th>
                    {contentExpanded && dedupedContentColumns.map((col) => {
                      const ckey = `content:${col.testId}::${col.compositeKey}`
                      return (
                      <th
                        key={`${col.testId}::${col.compositeKey}`}
                        onClick={() => toggleSort(ckey)}
                        className={`h-10 px-2 text-right align-middle font-medium whitespace-nowrap bg-white text-xs ${SORTABLE_TH}`}
                        title={`${col.testTitle} / ${col.sheetTitle} / ${col.categoryTitle} / ${col.questionText}`}
                      >
                        <span className="text-[10px] text-muted-foreground block">
                          {col.roleType === "teacher" ? "教員側" : "患者側"} {col.categoryTitle}
                        </span>
                        <span className="block truncate">{col.questionText}{sortCaret(ckey)}</span>
                      </th>
                      )
                    })}
                    <th onClick={() => toggleSort("score")} className={`h-10 px-2 text-right align-middle text-[11px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap bg-white ${SORTABLE_TH}`}>点数{sortCaret("score")}</th>
                    {teacherSlotTests.map((_, i) => (
                      <th key={`th-t-${i}`} onClick={() => toggleSort(`teacher:${i}`)} className={`h-10 px-2 text-right align-middle text-[11px] font-bold uppercase tracking-wide text-primary whitespace-nowrap bg-white ${SORTABLE_TH}`}>
                        教員{teacherSlotTests.length > 1 ? ["①", "②", "③"][i] || `(${i + 1})` : ""}{sortCaret(`teacher:${i}`)}
                      </th>
                    ))}
                    {patientSlotTests.map((_, i) => (
                      <th key={`th-p-${i}`} onClick={() => toggleSort(`patient:${i}`)} className={`h-10 px-2 text-right align-middle text-[11px] font-bold uppercase tracking-wide text-primary/70 whitespace-nowrap bg-white ${SORTABLE_TH}`}>
                        患者役{patientSlotTests.length > 1 ? ["①", "②"][i] || `(${i + 1})` : ""}{sortCaret(`patient:${i}`)}
                      </th>
                    ))}
                    <th onClick={() => toggleSort("percentage")} className={`h-10 px-2 text-right align-middle text-[11px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap bg-white ${SORTABLE_TH}`}>割合{sortCaret("percentage")}</th>
                    <th onClick={() => toggleSort("attendance")} className={`h-10 px-2 text-center align-middle text-[11px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap bg-white ${SORTABLE_TH}`}>出欠{sortCaret("attendance")}</th>
                    {/* 2026-07-24 熊木先生要望: コメント(教員内部) */}
                    <th className="h-10 px-2 text-left align-middle text-[11px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap bg-white">コメント</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.length === 0 && (
                    <tr>
                      <td colSpan={99} className="p-0">
                        <EmptyState
                          title="受験者がいません"
                          description="この試験セッションに割り当てられた学生がいないか、絞り込み条件に一致しません。"
                        />
                      </td>
                    </tr>
                  )}
                  {sortedRows.map(({ student, data }) => {
                    // 2026-07-13 副田さん要望: ステータス列を出欠 (出席/欠席/未確認) に。
                    const attKind: StatusKind =
                      data.attendanceStatus === "present" ? "present"
                        : data.attendanceStatus === "absent" ? "absent"
                        : "neutral"
                    const attLabel =
                      data.attendanceStatus === "present" ? "出席"
                        : data.attendanceStatus === "absent" ? "欠席"
                        : "未確認"
                    return (
                      <tr
                        key={student.id}
                        // 2026-07-12: ゼブラ縞 + 50%未満は critical 帯 (左) + 淡い赤 tint
                        className={`border-b border-border/50 transition-colors ${
                          data.isBelow50
                            ? "bg-critical/[0.05] hover:bg-critical/[0.09] [&>td:first-child]:shadow-[inset_3px_0_0_var(--color-critical)]"
                            : "even:bg-muted/25 hover:bg-primary/[0.04]"
                        }`}
                      >
                        <td className={`p-2 align-middle whitespace-nowrap font-medium ${data.isBelow50 ? "text-critical" : ""}`}>{student.studentId}</td>
                        <td className={`p-2 align-middle whitespace-nowrap ${data.isBelow50 ? "text-critical font-medium" : ""}`}>{student.name}</td>
                        <td className="p-2 align-middle whitespace-nowrap text-muted-foreground">{student.roomNumber || "-"}</td>
                        <td className="p-2 align-middle whitespace-nowrap text-xs font-mono text-muted-foreground">{student.email || "-"}</td>
                        {contentExpanded && dedupedContentColumns.map((col) => {
                          const val = data.contentScores[`${col.testId}::${col.compositeKey}`]
                          return (
                            <td
                              key={`${student.id}-${col.testId}-${col.compositeKey}`}
                              className="p-2 align-middle text-right text-sm whitespace-nowrap tnum"
                            >
                              {typeof val === "number" ? val : <span className="text-muted-foreground/50">-</span>}
                            </td>
                          )
                        })}
                        <td className="p-2 align-middle whitespace-nowrap text-right font-bold tnum">
                          {typeof data.score === "number" ? data.score : <span className="text-muted-foreground/50 font-normal">-</span>}
                        </td>
                        {data.teacherSlotScores.map((s, i) => (
                          <td key={`td-t-${student.id}-${i}`} className="p-2 align-middle whitespace-nowrap text-right tnum text-primary">
                            {typeof s === "number" ? s : <span className="text-muted-foreground/50">-</span>}
                          </td>
                        ))}
                        {data.patientSlotScores.map((s, i) => (
                          <td key={`td-p-${student.id}-${i}`} className="p-2 align-middle whitespace-nowrap text-right tnum text-primary/70">
                            {typeof s === "number" ? s : <span className="text-muted-foreground/50">-</span>}
                          </td>
                        ))}
                        <td className="p-2 align-middle whitespace-nowrap text-right tnum">
                          {data.percentage != null ? (
                            <span className={data.isBelow50 ? "font-extrabold text-critical" : "font-bold"}>
                              {data.percentage}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap text-center">
                          <StatusPill kind={attKind}>{attLabel}</StatusPill>
                        </td>
                        {/* 2026-07-24 熊木先生要望: コメント(教員内部) */}
                        <td className="p-2 align-top text-xs min-w-[220px] max-w-[340px]">
                          {data.commentEntries.length === 0 ? (
                            <span className="text-muted-foreground/40">-</span>
                          ) : (
                            <div className="space-y-1 whitespace-normal">
                              {data.commentEntries.map((c, i) => (
                                <div key={i} className="leading-snug">
                                  <span className="font-semibold text-primary/80">{c.slot}・{c.label}：</span>
                                  {c.text}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

