"use client"

import { PAGE_WIDTH } from "@/components/page-container"
import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronRight, Shield, Filter, AlertTriangle, UserCog, Users } from "lucide-react"
import { loadTests, loadTestSessions, type Test, type TestSession, type TestSessionStatus } from "@/lib/data-storage"
import { useSession } from "@/lib/auth/use-session"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import Link from "next/link"

interface TestSelectionScreenProps {
  examPath: string
  userType: "teacher" | "patient"
}

interface SubjectInfo {
  subject_code: string
  subject_name: string
}

export function TestSelectionScreen({ examPath, userType }: TestSelectionScreenProps) {
  const router = useRouter()
  const [tests, setTests] = useState<Test[]>([])
  const [testSessions, setTestSessions] = useState<TestSession[]>([])
  const [subjects, setSubjects] = useState<SubjectInfo[]>([])
  const [teacherRole, setTeacherRole] = useState<string>("")
  const [teacherSubjectCode, setTeacherSubjectCode] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [noTestMessage, setNoTestMessage] = useState<string>("")
  // 2026-07-10 副田さん報告: 割当されていれば他教科のセッションも参加可能に。
  //   /api/my-assigned-sessions から自分がアサインされている test_session_id を
  //   取得し、subject フィルタを素通しさせる判定に使う。
  const [assignedSessionIds, setAssignedSessionIds] = useState<Set<string>>(new Set())

  // 2026-07-10 副田さん要望: 大学管理者/教科管理者/マスター管理者が「教員①/②/患者役」を
  //   選んで代理入力できるようにする。session クリック時にモーダルを開き、部屋 × 役の
  //   組合わせを提示する。
  interface AssignSlot {
    roomNumber: string
    roleType: "teacher" | "patient"
    slotIndex: number // 部屋内の何番目 (0-based)
    testId: string
    testTitle: string
    // 2026-07-11 副田さん報告: この slot の担当者メール。代理採点時の評価者 ID に使う。
    personEmail: string
  }
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [roleModalSessionId, setRoleModalSessionId] = useState<string>("")
  const [roleModalSessionName, setRoleModalSessionName] = useState<string>("")
  const [roleModalSlots, setRoleModalSlots] = useState<AssignSlot[]>([])
  const [roleModalLoading, setRoleModalLoading] = useState(false)

  // 2026-07-11 副田さん要望: 一般教員/患者役が同一セッションで複数部屋を担当する場合、
  //   部屋を選択させるモーダル。
  const [roomPickerOpen, setRoomPickerOpen] = useState(false)
  const [roomPickerSessionId, setRoomPickerSessionId] = useState<string>("")
  const [roomPickerSessionName, setRoomPickerSessionName] = useState<string>("")
  const [roomPickerRooms, setRoomPickerRooms] = useState<string[]>([])

  // Filters
  const [filterSubject, setFilterSubject] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterTestDate, setFilterTestDate] = useState<string>("")
  const [filterCreatedDate, setFilterCreatedDate] = useState<string>("")

  // Phase 9b-β2b: sessionStorage 認可キーを useSession() 経由に置換
  const { session, isLoading: isSessionLoading } = useSession()

  useEffect(() => {
    if (isSessionLoading) return
    if (!session) return

    let subjectCode = ""
    if (userType === "teacher") {
      const role = session.role || "general"
      setTeacherRole(role)
      subjectCode = session.subjectCode || ""
      setTeacherSubjectCode(subjectCode)
      if (subjectCode) {
        setFilterSubject(subjectCode)
      }
    }

    const fetchData = async () => {
      setIsLoading(true)
      try {
        // Fetch subjects
        try {
          const subjectsRes = await fetch("/api/subjects")
          if (subjectsRes.ok) {
            const subjectsData = await subjectsRes.json()
            setSubjects(subjectsData)
          }
        } catch (err) {
        }

        // Fetch test sessions
        const universityCode = session.universityCode || undefined
        try {
          const sessions = await loadTestSessions(universityCode)
          setTestSessions(sessions)
        } catch (err) {
        }

        // Fetch all tests (no subject filter, to check per-session availability)
        const fetchedTests = await loadTests(universityCode)
        if (Array.isArray(fetchedTests)) {
          setTests(fetchedTests)
        } else {
          setTests([])
        }

        // 自分がアサインされている session ID (subject フィルタ緩和用)
        try {
          const res = await fetch("/api/my-assigned-sessions", { credentials: "same-origin" })
          if (res.ok) {
            const json = await res.json()
            const ids = Array.isArray(json?.sessionIds) ? (json.sessionIds as string[]) : []
            setAssignedSessionIds(new Set(ids))
          }
        } catch {
          // network error はサイレント (フォールバック = 空 Set = 従来通り subject ロック)
        }
      } catch (error) {
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [userType, session, isSessionLoading])

  const getStatusLabel = (status: TestSessionStatus) => {
    switch (status) {
      case "not_started": return "未実施"
      case "in_progress": return "実施中"
      case "completed": return "テスト終了"
      default: return status
    }
  }

  const getStatusVariant = (status: TestSessionStatus): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "completed": return "destructive"
      case "in_progress": return "default"
      default: return "outline"
    }
  }

  const getSubjectNameByCode = (code?: string): string => {
    if (!code) return "-"
    const matched = subjects.find((s) => s.subject_code === code)
    return matched?.subject_name || code
  }

  // Get unique subject codes from sessions for filter
  const availableSubjects = useMemo(() => {
    const codes = new Set<string>()
    testSessions.forEach((s) => { if (s.subjectCode) codes.add(s.subjectCode) })
    return Array.from(codes)
  }, [testSessions])

  // 2026-07-03 副田さん報告: 熊木先生 (university_admin, subject_code=dent_education)
  // で教科プルダウンが押せない。旧判定は「teacher かつ subject_code あり」で全 teacher
  // をロックしていたが、university_admin / master_admin は複数教科を扱えるべき。
  // subject_admin / general の教員のみロックする。
  const isSubjectLocked =
    userType === "teacher" &&
    teacherSubjectCode !== "" &&
    teacherRole !== "university_admin" &&
    teacherRole !== "master_admin"

  // Filter sessions
  const filteredSessions = useMemo(() => {
    return testSessions.filter((session) => {
      // Subject filter
      // 2026-07-10 副田さん報告:
      //   (a) 過去の教科なしセッションで subject_code が NULL のままのケース。
      //       NULL セッションは教科フィルタを素通し。
      //   (b) 「割当されていれば他教科のセッションも参加できる」ようにしたい。
      //       assignedSessionIds に含まれるセッションも教科フィルタを素通し。
      if (
        filterSubject !== "all" &&
        session.subjectCode &&
        session.subjectCode !== filterSubject &&
        !assignedSessionIds.has(session.id)
      ) return false
      // Status filter
      if (filterStatus !== "all" && session.status !== filterStatus) return false
      // Test date filter
      if (filterTestDate) {
        const sessionDate = session.testDate ? session.testDate.split("T")[0] : ""
        if (sessionDate !== filterTestDate) return false
      }
      // Created date filter
      if (filterCreatedDate) {
        const createdDate = session.createdAt ? session.createdAt.split("T")[0] : ""
        if (createdDate !== filterCreatedDate) return false
      }
      return true
    }).sort((a, b) => {
      const dateA = a.testDate ? new Date(a.testDate).getTime() : 0
      const dateB = b.testDate ? new Date(b.testDate).getTime() : 0
      return dateB - dateA
    })
  }, [testSessions, filterSubject, filterStatus, filterTestDate, filterCreatedDate, assignedSessionIds])

  // Find matching test for a session (UI 表示上の可否判定用 = 1 個目でよい)
  const findTestForSession = (sessionId: string): Test | undefined => {
    const expectedRoleType = userType === "patient" ? "patient" : "teacher"
    return tests.find(
      (t) => t.testSessionId === sessionId && (t.roleType || "teacher") === expectedRoleType
    )
  }

  // 2026-07-10 副田さん報告: 砂川先生 (①（11/5） 内の 2 番目 = 教員②) が試験を選ぶと
  //   教員①用テストに飛ばされていた。教員側テストが複数ある場合、部屋内の教員を
  //   メール昇順で並べたときの自分の index (0 origin) に対応するテスト (created_at
  //   昇順で N 番目) を選ぶ。患者役側も同ロジックで動く (患者役は通常 1 種類だが将来
  //   複数対応時も破綻しない)。
  const resolveMatchingTest = async (sessionId: string, roomOverride?: string): Promise<Test | undefined> => {
    const expectedRoleType = userType === "patient" ? "patient" : "teacher"
    const matchingTests = tests
      .filter((t) => t.testSessionId === sessionId && (t.roleType || "teacher") === expectedRoleType)
      .slice()
      .sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return at - bt
      })
    if (matchingTests.length === 0) return undefined
    if (matchingTests.length === 1) return matchingTests[0]

    const myEmail = (session?.email || "").toLowerCase()
    // 2026-07-11: 複数部屋から選択された場合はその部屋で slot を判定する
    const myRoom = roomOverride || session?.assignedRoomNumber || ""
    if (!myEmail || !myRoom) return matchingTests[0]

    const endpoint =
      userType === "teacher"
        ? `/api/test-sessions/${sessionId}/teacher-assignments`
        : `/api/test-sessions/${sessionId}/patient-assignments`
    const nestedKey = userType === "teacher" ? "teacher" : "patient"

    try {
      const res = await fetch(endpoint, { credentials: "same-origin" })
      if (!res.ok) return matchingTests[0]
      const data = await res.json()
      const items = Array.isArray(data?.items) ? data.items : []
      const inRoom = items.filter(
        (a: { assignedRoomNumber?: string }) => (a.assignedRoomNumber || "") === myRoom,
      )
      // 2026-07-13: 自分の slot_index (CSV の教員①②順) が保存されていれば、それを
      //   そのまま テスト index に使う (教員① → matchingTests[0])。
      const mine = inRoom.find((a: Record<string, unknown>) => {
        const nested = a[nestedKey] as { email?: string } | undefined
        return (nested?.email || "").toLowerCase() === myEmail
      })
      const mySlot = mine ? (mine as { slotIndex?: number }).slotIndex : undefined
      if (typeof mySlot === "number" && matchingTests[mySlot]) return matchingTests[mySlot]
      // フォールバック (未 backfill 旧データ): 部屋内メール昇順の位置で判定
      const roomPeers: string[] = inRoom
        .map((a: Record<string, unknown>) => {
          const nested = a[nestedKey] as { email?: string } | undefined
          return (nested?.email || "").toLowerCase()
        })
        .filter((e: string) => e)
        .sort()
      const myIndex = roomPeers.indexOf(myEmail)
      if (myIndex >= 0 && matchingTests[myIndex]) return matchingTests[myIndex]
    } catch {
      // network error はサイレント (fallback で 1 個目のテストを返す)
    }
    return matchingTests[0]
  }

  // 2026-07-10 副田さん要望: 大学管理者/教科管理者/マスター管理者は「代理入力」として
  //   教員①/教員②/患者役 のいずれかを選んで入れるようにする。判定は teacherRole を見る。
  //   userType="teacher" 経由 (login-destination で /teacher/exam-info を選んだ管理者) の
  //   み代理役選択モーダルを出す。patient で入ってきた場合は従来通り 1 テストへ直行。
  const isAdminLikeTeacher =
    userType === "teacher" &&
    (teacherRole === "master_admin" ||
      teacherRole === "university_admin" ||
      teacherRole === "subject_admin")

  const openRoleModal = async (sessionId: string, sessionName: string) => {
    setRoleModalSessionId(sessionId)
    setRoleModalSessionName(sessionName)
    setRoleModalOpen(true)
    setRoleModalLoading(true)
    setRoleModalSlots([])

    try {
      const [teacherRes, patientRes] = await Promise.all([
        fetch(`/api/test-sessions/${sessionId}/teacher-assignments`, { credentials: "same-origin" }),
        fetch(`/api/test-sessions/${sessionId}/patient-assignments`, { credentials: "same-origin" }),
      ])
      const teacherData = teacherRes.ok ? await teacherRes.json() : { items: [] }
      const patientData = patientRes.ok ? await patientRes.json() : { items: [] }

      // 2026-07-13: 部屋ごとに教員/患者役を slot_index (CSV の①②順) でスロット化。
      //   slot_index 未保存 (旧データ) はメール昇順にフォールバック。
      type Peer = { email: string; slot: number | null }
      const teacherByRoom = new Map<string, Peer[]>()
      for (const it of teacherData.items || []) {
        const room = (it.assignedRoomNumber || "").trim()
        if (!room) continue
        const email = (it.teacher?.email || "").toLowerCase()
        const arr = teacherByRoom.get(room) || []
        arr.push({ email, slot: typeof it.slotIndex === "number" ? it.slotIndex : null })
        teacherByRoom.set(room, arr)
      }
      const patientByRoom = new Map<string, Peer[]>()
      for (const it of patientData.items || []) {
        const room = (it.assignedRoomNumber || "").trim()
        if (!room) continue
        const email = (it.patient?.email || "").toLowerCase()
        const arr = patientByRoom.get(room) || []
        arr.push({ email, slot: typeof it.slotIndex === "number" ? it.slotIndex : null })
        patientByRoom.set(room, arr)
      }
      const bySlot = (a: Peer, b: Peer): number => {
        if (typeof a.slot === "number" && typeof b.slot === "number" && a.slot !== b.slot) return a.slot - b.slot
        return a.email.localeCompare(b.email)
      }

      // テスト一覧を role_type / createdAt 順で確定
      const teacherTests = tests
        .filter((t) => t.testSessionId === sessionId && (t.roleType || "teacher") === "teacher")
        .slice()
        .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
      const patientTests = tests
        .filter((t) => t.testSessionId === sessionId && (t.roleType || "teacher") === "patient")
        .slice()
        .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())

      const rooms = new Set<string>([...teacherByRoom.keys(), ...patientByRoom.keys()])
      const roomsSorted = Array.from(rooms).sort()
      const slots: AssignSlot[] = []
      for (const room of roomsSorted) {
        const teachersHere = (teacherByRoom.get(room) || []).slice().sort(bySlot)
        teachersHere.forEach((peer, pos) => {
          // slot_index が保存されていればそれを、無ければ並び位置をテスト index に使う
          const idx = typeof peer.slot === "number" ? peer.slot : pos
          const test = teacherTests[idx]
          if (!test) return
          slots.push({
            roomNumber: room,
            roleType: "teacher",
            slotIndex: idx,
            testId: test.id,
            testTitle: test.title || `教員側テスト${idx + 1}`,
            personEmail: peer.email,
          })
        })
        const patientsHere = (patientByRoom.get(room) || []).slice().sort(bySlot)
        patientsHere.forEach((peer, pos) => {
          const idx = typeof peer.slot === "number" ? peer.slot : pos
          const test = patientTests[idx]
          if (!test) return
          slots.push({
            roomNumber: room,
            roleType: "patient",
            slotIndex: idx,
            testId: test.id,
            testTitle: test.title || `患者側テスト${idx + 1}`,
            personEmail: peer.email,
          })
        })
      }
      setRoleModalSlots(slots)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ネットワークエラー"
      setNoTestMessage(`役の候補取得中にエラー: ${msg}`)
      setTimeout(() => setNoTestMessage(""), 5000)
      setRoleModalOpen(false)
    } finally {
      setRoleModalLoading(false)
    }
  }

  const handleAdminRoleSelect = async (slot: AssignSlot) => {
    setRoleModalOpen(false)
    try {
      const res = await fetch("/api/auth/select-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          testSessionId: roleModalSessionId,
          assignedRoomNumber: slot.roomNumber,
          // 2026-07-11 副田さん報告: 代理採点する slot の担当者メールを渡す
          proxyEvaluatorEmail: slot.personEmail,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        setNoTestMessage(err?.error || `セッションの選択に失敗しました (status ${res.status})`)
        setTimeout(() => setNoTestMessage(""), 6000)
        return
      }
      try {
        const { invalidateSessionCache } = await import("@/lib/auth/use-session")
        invalidateSessionCache()
      } catch {}
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ネットワークエラー"
      setNoTestMessage(`セッションの選択中にエラー: ${msg}`)
      setTimeout(() => setNoTestMessage(""), 6000)
      return
    }

    if (slot.roleType === "patient") {
      sessionStorage.setItem("patient_selected_test", slot.testId)
      sessionStorage.setItem("testSessionId", roleModalSessionId)
      router.push("/patient/exam")
    } else {
      sessionStorage.setItem("teacher_selected_test", slot.testId)
      sessionStorage.setItem("testSessionId", roleModalSessionId)
      router.push("/teacher/exam")
    }
  }

  // 2026-07-11 副田さん要望: ログイン中の教員/患者役がこのセッションで担当する
  //   部屋の一覧を返す。複数あれば部屋選択モーダルを出すために使う。
  const fetchMyRooms = async (sessionId: string): Promise<string[]> => {
    const myEmail = (session?.email || "").toLowerCase()
    if (!myEmail) return []
    const endpoint =
      userType === "teacher"
        ? `/api/test-sessions/${sessionId}/teacher-assignments`
        : `/api/test-sessions/${sessionId}/patient-assignments`
    const nestedKey = userType === "teacher" ? "teacher" : "patient"
    try {
      const res = await fetch(endpoint, { credentials: "same-origin" })
      if (!res.ok) return []
      const data = await res.json()
      const items = Array.isArray(data?.items) ? data.items : []
      const rooms = items
        .filter((a: Record<string, unknown>) => {
          const nested = a[nestedKey] as { email?: string } | undefined
          return (nested?.email || "").toLowerCase() === myEmail
        })
        .map((a: { assignedRoomNumber?: string }) => (a.assignedRoomNumber || "").trim())
        .filter((r: string) => r)
      return Array.from(new Set<string>(rooms)).sort((a, b) => a.localeCompare(b))
    } catch {
      return []
    }
  }

  const handleSelectSession = async (sessionId: string) => {
    if (isAdminLikeTeacher) {
      const s = testSessions.find((x) => x.id === sessionId)
      await openRoleModal(sessionId, s?.description || "")
      return
    }
    // 2026-07-11 副田さん要望: 複数部屋担当なら部屋選択モーダルを出す
    const myRooms = await fetchMyRooms(sessionId)
    if (myRooms.length > 1) {
      const s = testSessions.find((x) => x.id === sessionId)
      setRoomPickerSessionId(sessionId)
      setRoomPickerSessionName(s?.description || "")
      setRoomPickerRooms(myRooms)
      setRoomPickerOpen(true)
      return
    }
    await proceedSelectSession(sessionId, myRooms[0])
  }

  // 選択された session (+ 任意で部屋) で Cookie を更新し試験画面へ遷移する
  const proceedSelectSession = async (sessionId: string, room?: string) => {
    const matchingTest = await resolveMatchingTest(sessionId, room)
    if (!matchingTest) {
      const roleLabel = userType === "teacher" ? "教員用" : "患者用"
      setNoTestMessage(`このセッションには${roleLabel}テストが登録されていません。管理者にお問い合わせください。`)
      setTimeout(() => setNoTestMessage(""), 4000)
      return
    }

    // 2026-05-13 bug fix: ログイン時 Cookie の assignedRoomNumber は login で
    // 選んだ session の room しか反映していない。ここで選び直された session の
    // 部屋情報で Cookie を refresh しないと、PR #102 useExamPageGuard が古い
    // (または空の) room を見て「セッション情報が不完全です」と誤判定する。
    try {
      const body: Record<string, unknown> = { testSessionId: sessionId }
      // 2026-07-11: 複数部屋から選んだ場合は明示的に部屋を渡す
      if (room) body.assignedRoomNumber = room
      const res = await fetch("/api/auth/select-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        const msg = err?.error || `セッションの選択に失敗しました (status ${res.status})`
        setNoTestMessage(msg)
        setTimeout(() => setNoTestMessage(""), 6000)
        return
      }
      // useSession のキャッシュ無効化 (cookie が更新されたので)
      try {
        const { invalidateSessionCache } = await import("@/lib/auth/use-session")
        invalidateSessionCache()
      } catch {
        // dynamic import failure はログのみ
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ネットワークエラー"
      setNoTestMessage(`セッションの選択中にエラーが発生しました: ${msg}`)
      setTimeout(() => setNoTestMessage(""), 6000)
      return
    }

    sessionStorage.setItem(`${userType}_selected_test`, matchingTest.id)
    sessionStorage.setItem("testSessionId", sessionId)
    router.push(examPath)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-secondary/30 flex items-center justify-center">
        <div className="inline-flex items-center gap-2.5 text-muted-foreground">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <span className="text-sm">読み込み中...</span>
        </div>
      </div>
    )
  }

  if (testSessions.length === 0) {
    return (
      <div className="min-h-screen bg-secondary/30 p-4 md:p-8">
        <div className={`mx-auto ${PAGE_WIDTH.menu}`}>
          <Card>
            <CardHeader>
              <CardTitle className="text-center">テストセッションが登録されていません</CardTitle>
              <CardDescription className="text-center">
                管理者にテストセッションの登録を依頼してください
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button variant="outline" onClick={() => router.push("/")}>
                トップページに戻る
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-secondary/30 p-4 md:p-8">
      {/* 2026-11-06 デザイン見直し: 試験選択はメニュー画面なので menu(1,024px) */}
      <div className={`mx-auto space-y-4 ${PAGE_WIDTH.menu}`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary">評価テスト選択</h1>
            <p className="text-sm text-muted-foreground mt-1">実施するテストセッションを選択してください</p>
          </div>
          {userType === "teacher" && teacherRole !== "general" && teacherRole !== "" && (
            <Link href="/admin/dashboard">
              <Button variant="outline" size="sm" className="flex items-center gap-2 border-blue-500 text-blue-700 hover:bg-blue-50">
                <Shield className="w-4 h-4" />
                管理画面
              </Button>
            </Link>
          )}
        </div>

        {/* Alert message */}
        {noTestMessage && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {noTestMessage}
          </div>
        )}

        {/* Filter panel */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
              <Select value={filterSubject} onValueChange={setFilterSubject} disabled={isSubjectLocked}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="教科" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全ての教科</SelectItem>
                  {availableSubjects.map((code) => (
                    <SelectItem key={code} value={code}>
                      {getSubjectNameByCode(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="ステータス" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全てのステータス</SelectItem>
                  <SelectItem value="not_started">未実施</SelectItem>
                  <SelectItem value="in_progress">実施中</SelectItem>
                  <SelectItem value="completed">テスト終了</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground whitespace-nowrap">実施日:</span>
                <Input
                  type="date"
                  value={filterTestDate}
                  onChange={(e) => setFilterTestDate(e.target.value)}
                  className="w-[140px] h-8 text-xs"
                />
              </div>

              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground whitespace-nowrap">作成日:</span>
                <Input
                  type="date"
                  value={filterCreatedDate}
                  onChange={(e) => setFilterCreatedDate(e.target.value)}
                  className="w-[140px] h-8 text-xs"
                />
              </div>

              {(filterSubject !== "all" || filterStatus !== "all" || filterTestDate || filterCreatedDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    if (!isSubjectLocked) setFilterSubject("all")
                    setFilterStatus("all")
                    setFilterTestDate("")
                    setFilterCreatedDate("")
                  }}
                >
                  リセット
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Session table */}
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs text-muted-foreground sticky top-0">
                    <th className="text-left py-2 px-3 font-medium">実施日</th>
                    <th className="text-left py-2 px-3 font-medium">テスト名</th>
                    <th className="text-left py-2 px-3 font-medium">ステータス</th>
                    <th className="text-left py-2 px-3 font-medium">教科名</th>
                    <th className="text-left py-2 px-3 font-medium">作成日</th>
                    <th className="py-2 px-3 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <EmptyState
                          icon={Filter}
                          title="該当するテストセッションがありません"
                          description="教科・ステータス・日付の絞り込み条件を見直してください。"
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredSessions.map((session) => {
                      const hasTest = !!findTestForSession(session.id)
                      return (
                        <tr
                          key={session.id}
                          className={`border-b last:border-b-0 transition-colors cursor-pointer ${
                            hasTest ? "hover:bg-accent/50" : "hover:bg-accent/30 opacity-70"
                          }`}
                          onClick={() => handleSelectSession(session.id)}
                        >
                          <td className="py-2 px-3 text-sm font-medium whitespace-nowrap">
                            {session.testDate ? new Date(session.testDate).toLocaleDateString("ja-JP") : "-"}
                          </td>
                          <td className="py-2 px-3 text-sm font-semibold text-primary">
                            {session.description || "(名称未設定)"}
                          </td>
                          <td className="py-2 px-3">
                            <Badge variant={getStatusVariant(session.status)} className="text-xs">
                              {getStatusLabel(session.status)}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-sm text-muted-foreground">
                            {getSubjectNameByCode(session.subjectCode)}
                          </td>
                          <td className="py-2 px-3 text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(session.createdAt).toLocaleDateString("ja-JP")}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {hasTest ? (
                              <Button size="sm" variant="default" className="h-7 text-xs px-3">
                                選択
                                <ChevronRight className="w-3 h-3 ml-1" />
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">未登録</span>
                            )}
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

      {/* 2026-07-10 副田さん要望: 管理者代理入力の役選択モーダル */}
      <Dialog open={roleModalOpen} onOpenChange={setRoleModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>代理入力する役を選択</DialogTitle>
            <DialogDescription>
              {roleModalSessionName ? `${roleModalSessionName} で ` : ""}
              担当する部屋 × 役を選んでください。選んだ役として試験画面が開きます。
            </DialogDescription>
          </DialogHeader>
          {roleModalLoading ? (
            <p className="text-sm text-muted-foreground py-4">候補を読み込み中...</p>
          ) : roleModalSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              このセッションには教員/患者役の割当が登録されていません。先に割当を登録してください。
            </p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {(() => {
                const byRoom = new Map<string, AssignSlot[]>()
                for (const s of roleModalSlots) {
                  const arr = byRoom.get(s.roomNumber) || []
                  arr.push(s)
                  byRoom.set(s.roomNumber, arr)
                }
                return Array.from(byRoom.entries()).map(([room, slotsInRoom]) => (
                  <div key={room} className="border rounded-md p-3">
                    <div className="font-semibold text-sm text-primary mb-2">部屋: {room}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {slotsInRoom.map((s) => {
                        const label =
                          s.roleType === "patient"
                            ? `患者役${slotsInRoom.filter((x) => x.roleType === "patient").length > 1 ? s.slotIndex + 1 : ""}`
                            : `教員${["①", "②", "③", "④"][s.slotIndex] || `${s.slotIndex + 1}`}`
                        return (
                          <Button
                            key={`${s.roleType}-${s.slotIndex}`}
                            variant="outline"
                            className="justify-start h-auto py-2"
                            onClick={() => handleAdminRoleSelect(s)}
                          >
                            {s.roleType === "patient" ? (
                              <Users className="w-4 h-4 mr-2 text-blue-600" />
                            ) : (
                              <UserCog className="w-4 h-4 mr-2 text-emerald-600" />
                            )}
                            <div className="text-left">
                              <div className="font-medium">{label}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {s.testTitle}
                              </div>
                            </div>
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                ))
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 2026-07-11 副田さん要望: 複数部屋担当者の部屋選択モーダル */}
      <Dialog open={roomPickerOpen} onOpenChange={setRoomPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>担当する部屋を選択</DialogTitle>
            <DialogDescription>
              {roomPickerSessionName ? `${roomPickerSessionName} で ` : ""}
              あなたは複数の部屋を担当しています。採点する部屋を選んでください。
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 py-2">
            {roomPickerRooms.map((room) => (
              <Button
                key={room}
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={async () => {
                  setRoomPickerOpen(false)
                  await proceedSelectSession(roomPickerSessionId, room)
                }}
              >
                <ChevronRight className="w-4 h-4 mr-2 text-primary" />
                <span className="font-medium">部屋 {room}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
