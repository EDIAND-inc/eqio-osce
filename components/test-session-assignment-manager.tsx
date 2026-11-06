"use client"

/**
 * ADR-007 Phase C-5: 試験セッション割当管理 UI
 *
 * 教員 / 患者役 / 学生の canonical 一覧から、この試験セッションへの割当 (どの部屋を担当 /
 * 受験するか) を設定する。
 *
 * 教員/患者役: canonical 全件 + 既存 assignment を 1 画面で表示し、PUT で全置換。
 * 学生:        canonical 件数が多い想定のため、フィルタ駆動の 1 リスト UI。
 *              - 上部の大学/学年/教科/状態フィルタで絞り込み
 *              - 1 つの表に candidates + 状態 (割当済/未割当) を表示
 *              - 多選択 → 部屋を指定 → 「割当」(新規 or 移動) / 「割当解除」
 */

import { useEffect, useState, useCallback, useRef, useMemo, Fragment } from "react"
import { PageContainer } from "@/components/page-container"
import { BackLink } from "@/components/back-link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Home, Save, Search, Trash2, CheckCircle2, RotateCcw, Upload, Download, FileText } from "lucide-react"
import { useSession } from "@/lib/auth/use-session"
import { readCsvFile, csvDownloadBlob, normalizeHalfwidth } from "@/lib/csv"
import {
  loadTeachers, loadPatients, loadRooms, loadTestSessions,
  loadStudents, loadSubjects, saveStudents, loadTests,
  type Teacher, type Patient, type Room, type TestSession,
  type Student, type Subject, type Test,
} from "@/lib/data-storage"

const UNASSIGNED = "__unassigned__"

/**
 * 2026-07-13: assignments API の items から「部屋 → slot 順の id 配列」を組み立てる。
 * - slot_index が全件揃っていれば、それを実 index として疎配置(空 slot は "")。
 * - 未 backfill(slot_index が欠ける)ならメール昇順で密配置(旧挙動フォールバック)。
 */
function buildAssignmentOrder(
  items: Array<Record<string, unknown>>,
  idKey: string,
  entities: Array<{ id: string; email?: string }>,
): Record<string, string[]> {
  const emailOf = (id: string) => (entities.find((e) => e.id === id)?.email || "").toLowerCase()
  const byRoom: Record<string, Array<{ id: string; slot: number | null }>> = {}
  for (const a of items) {
    const room = ((a.assignedRoomNumber as string | null) || "").trim()
    if (!room) continue
    const id = a[idKey] as string
    if (!id) continue
    const slot = typeof a.slotIndex === "number" ? (a.slotIndex as number) : null
    ;(byRoom[room] ||= []).push({ id, slot })
  }
  const order: Record<string, string[]> = {}
  for (const [room, arr] of Object.entries(byRoom)) {
    const allHaveSlot = arr.length > 0 && arr.every((x) => typeof x.slot === "number")
    if (allHaveSlot) {
      const maxSlot = Math.max(...arr.map((x) => x.slot as number))
      const dense: string[] = new Array(maxSlot + 1).fill("")
      for (const x of arr) dense[x.slot as number] = x.id
      order[room] = dense
    } else {
      order[room] = arr
        .slice()
        .sort((a, b) => emailOf(a.id).localeCompare(emailOf(b.id)))
        .map((x) => x.id)
    }
  }
  return order
}

interface Props {
  sessionId: string
}

export function TestSessionAssignmentManager({ sessionId }: Props) {
  const router = useRouter()
  const { session, isLoading: isSessionLoading } = useSession()

  const [testSession, setTestSession] = useState<TestSession | null>(null)
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [teacherRooms, setTeacherRooms] = useState<Record<string, string>>({}) // teacher.id → roomNumber("" = unassigned) [互換用/主部屋のみ]
  const [patientRooms, setPatientRooms] = useState<Record<string, string>>({})
  // 2026-07-03 熊木先生指摘対応: 1 教員/1 患者役が複数部屋を担当できる。
  // 2026-07-13: slot 順(CSV の教員①②順)を保持するため、部屋 → [teacherId,...] の
  //   順序付き配列 (index = slot_index) を authoritative source にする。空 slot は "" で保持。
  //   teacherPairs (membership 判定用 Set) は order から派生。
  const [teacherOrder, setTeacherOrder] = useState<Record<string, string[]>>({})
  const [patientOrder, setPatientOrder] = useState<Record<string, string[]>>({})
  const teacherPairs = useMemo(() => {
    const s = new Set<string>()
    for (const [room, ids] of Object.entries(teacherOrder))
      for (const id of ids) if (id) s.add(`${id}::${room}`)
    return s
  }, [teacherOrder])
  const patientPairs = useMemo(() => {
    const s = new Set<string>()
    for (const [room, ids] of Object.entries(patientOrder))
      for (const id of ids) if (id) s.add(`${id}::${room}`)
    return s
  }, [patientOrder])
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string>("")

  // 2026-05-19 副田さん仕様変更 B-1 Step 2:
  // セッションに含まれる tests から slot 数を決める。
  //   roleType=teacher の数 = 教員 slot 列数
  //   roleType=patient の数 = 患者役 slot 列数
  // 例: 教員側テスト 1 つだけのセッションでは「教員①, 権限」のみ。
  // 副田さん上限指示 (Step 1 質問) は 教員②/患者役1 だが、tests 構成に応じて
  // 動的に増減させるのが本仕様。
  const [sessionTests, setSessionTests] = useState<Test[]>([])
  const teacherSlotCount = sessionTests.filter((t) => (t.roleType || "teacher") === "teacher").length
  const patientSlotCount = sessionTests.filter((t) => t.roleType === "patient").length
  // inline edit が走っているセル (重複保存防止)
  const [savingSlot, setSavingSlot] = useState<string | null>(null)

  // 学生タブ用 state (ADR-007 C-5 補強 v2 — 1 リスト+フィルタ駆動)
  const [universities, setUniversities] = useState<Record<string, string>>({})
  const [subjects, setSubjects] = useState<Subject[]>([])
  // フィルタ
  const [studentSearchUniv, setStudentSearchUniv] = useState<string>("")
  const [studentSearchGrade, setStudentSearchGrade] = useState<string>("all")
  const [studentSearchSubject, setStudentSearchSubject] = useState<string>("all")
  const [studentSearchStatus, setStudentSearchStatus] = useState<"all" | "assigned" | "unassigned">("all")
  // 検索結果(canonical 学生 list、フィルタ反映済)
  const [studentList, setStudentList] = useState<Student[]>([])
  // この試験セッションでの割当 map: studentId → roomNumber("" は割当無し)
  const [assignmentMap, setAssignmentMap] = useState<Record<string, string>>({})
  // チェック付き学生(確定対象を絞り込むため)
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())
  // 進行状態
  const [studentSearching, setStudentSearching] = useState(false)
  const [studentProcessing, setStudentProcessing] = useState(false)
  const [studentResultMsg, setStudentResultMsg] = useState<string>("")

  // ADR-007 C-5 v3: ステージング (確定前の保留変更)
  // 各 studentId に対して未保存の変更を保持する:
  //   string => その部屋に割当(新規 or 移動)
  //   null   => 割当解除
  //   キーが存在しない => 変更なし(現在の DB 状態のまま)
  const [pendingMap, setPendingMap] = useState<Record<string, string | null>>({})
  // shift+クリックで範囲選択するための「直前にクリックされた行 index」
  const [lastClickedIdx, setLastClickedIdx] = useState<number | null>(null)
  // shift キー押下中フラグ (Radix Checkbox の onCheckedChange は event を受け取らないため
  // window レベルの keydown/keyup で track する)
  const isShiftDownRef = useRef(false)

  // 試験セッションでの学生 assignments を再取得して assignmentMap を更新
  const refreshStudentAssignments = useCallback(async (): Promise<Record<string, string>> => {
    const res = await fetch(`/api/test-sessions/${sessionId}/student-assignments`, {
      credentials: "same-origin",
    })
    if (!res.ok) return {}
    const j = await res.json()
    const map: Record<string, string> = {}
    for (const a of j.items || []) {
      map[a.studentId] = (a.roomNumber as string) || ""
    }
    setAssignmentMap(map)
    return map
  }, [sessionId])

  // shift キー押下を window レベルで監視 (Radix Checkbox 経由で取れないため)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      isShiftDownRef.current = e.shiftKey
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("keyup", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("keyup", onKey)
    }
  }, [])

  useEffect(() => {
    if (isSessionLoading || !session) return
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const universityCode = session.universityCode || undefined

        const [
          allSessions,
          canonicalTeachers,
          canonicalPatients,
          canonicalRooms,
          subjectsData,
          teacherAssignsRes,
          patientAssignsRes,
          universitiesRes,
          studentAssignsMap,
          allTests,
        ] = await Promise.all([
          loadTestSessions(universityCode),
          loadTeachers(universityCode, undefined, undefined),  // canonical (no session filter)
          loadPatients(universityCode, undefined, undefined),  // canonical
          loadRooms(universityCode, undefined, undefined),
          loadSubjects(),
          fetch(`/api/test-sessions/${sessionId}/teacher-assignments`, { credentials: "same-origin" }),
          fetch(`/api/test-sessions/${sessionId}/patient-assignments`, { credentials: "same-origin" }),
          fetch(`/api/universities`, { credentials: "same-origin" }),
          refreshStudentAssignments(),
          loadTests(universityCode),
        ])

        const ts = (Array.isArray(allSessions) ? allSessions : []).find((s) => s.id === sessionId) || null
        setTestSession(ts)
        setTeachers(Array.isArray(canonicalTeachers) ? canonicalTeachers : [])
        setPatients(Array.isArray(canonicalPatients) ? canonicalPatients : [])
        setRooms(Array.isArray(canonicalRooms) ? canonicalRooms : [])
        setSubjects(Array.isArray(subjectsData) ? subjectsData : [])
        // 本セッションに紐づく tests のみ抽出 (副田さん B-1 Step 2)
        const myTests = Array.isArray(allTests)
          ? allTests.filter((t) => (t as Test & { testSessionId?: string }).testSessionId === sessionId)
          : []
        setSessionTests(myTests as Test[])

        // 学生フィルタの初期値を session 文脈から
        const initUniv = session.universityCode || ""
        if (initUniv) setStudentSearchUniv(initUniv)
        const initSubject =
          session.accountType === "subject_admin" && session.subjectCode ? session.subjectCode : "all"
        setStudentSearchSubject(initSubject)

        if (universitiesRes.ok) {
          const data = await universitiesRes.json()
          const map: Record<string, string> = {}
          if (Array.isArray(data)) {
            for (const u of data) map[u.university_code] = u.university_name
          }
          setUniversities(map)
        }

        const teacherEntities = Array.isArray(canonicalTeachers) ? canonicalTeachers : []
        const patientEntities = Array.isArray(canonicalPatients) ? canonicalPatients : []
        if (teacherAssignsRes.ok) {
          const tj = await teacherAssignsRes.json()
          const map: Record<string, string> = {}
          for (const a of tj.items || []) {
            const room = a.assignedRoomNumber || ""
            map[a.teacherId] = room  // 最後の部屋で上書き (互換用)
          }
          setTeacherRooms(map)
          setTeacherOrder(buildAssignmentOrder(tj.items || [], "teacherId", teacherEntities))
        }
        if (patientAssignsRes.ok) {
          const pj = await patientAssignsRes.json()
          const map: Record<string, string> = {}
          for (const a of pj.items || []) {
            const room = a.assignedRoomNumber || ""
            map[a.patientId] = room
          }
          setPatientRooms(map)
          setPatientOrder(buildAssignmentOrder(pj.items || [], "patientId", patientEntities))
        }

        // 初回 auto-search: 初期フィルタで学生 list をロード(status は render 時に絞る)
        // assignmentMap は別変数で受けているが、render はその後に流れるので順序問題なし
        void studentAssignsMap
        try {
          const initData = await loadStudents(
            initUniv || undefined,
            initSubject === "all" ? undefined : initSubject || undefined,
            undefined,
            undefined,
          )
          setStudentList(Array.isArray(initData) ? initData : [])
        } catch (e) {
          console.error("[assignment-manager] initial student load failed:", e)
        }
      } catch (err) {
        console.error("[assignment-manager] fetch error:", err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isSessionLoading, sessionId])

  const handleTeacherRoomChange = (teacherId: string, roomNumber: string) => {
    setTeacherRooms((prev) => ({
      ...prev,
      [teacherId]: roomNumber === UNASSIGNED ? "" : roomNumber,
    }))
    setSavedMsg("")
  }
  const handlePatientRoomChange = (patientId: string, roomNumber: string) => {
    setPatientRooms((prev) => ({
      ...prev,
      [patientId]: roomNumber === UNASSIGNED ? "" : roomNumber,
    }))
    setSavedMsg("")
  }

  // 2026-05-19 B-1 Step 2: inline edit ハンドラ
  // 任意の部屋 R の N 番目 slot (メール昇順) の教員 / 患者役 を入れ替える。
  //   - new = "" / null → 旧 slot 教員を unassign のみ
  //   - new = teacherId → 旧 slot 教員を外し、新教員を同じ R に assign
  // 即時 PUT で全教員 (or 全患者役) の割当を再送信する。
  const persistTeacherRooms = async (next: Record<string, string>) => {
    const items = Object.entries(next)
      .filter(([, room]) => room !== "")
      .map(([teacherId, room]) => ({ teacherId, assignedRoomNumber: room }))
    const res = await fetch(`/api/test-sessions/${sessionId}/teacher-assignments`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new Error(err?.error || `${res.status}`)
    }
  }
  const persistPatientRooms = async (next: Record<string, string>) => {
    const items = Object.entries(next)
      .filter(([, room]) => room !== "")
      .map(([patientId, room]) => ({ patientId, assignedRoomNumber: room }))
    const res = await fetch(`/api/test-sessions/${sessionId}/patient-assignments`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new Error(err?.error || `${res.status}`)
    }
  }

  // 2026-07-13: order (部屋 → slot 順 id 配列) を PUT。slot_index も送り、CSV の①②順を保存。
  const persistOrder = async (
    endpoint: "teacher-assignments" | "patient-assignments",
    idField: "teacherId" | "patientId",
    order: Record<string, string[]>,
  ) => {
    const items: Array<Record<string, unknown>> = []
    for (const [room, ids] of Object.entries(order)) {
      ids.forEach((id, slot) => {
        if (!id) return // 空 slot は送らない
        items.push({ [idField]: id, assignedRoomNumber: room, slotIndex: slot })
      })
    }
    const res = await fetch(`/api/test-sessions/${sessionId}/${endpoint}`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new Error(err?.error || `${res.status}`)
    }
  }

  // 2026-07-13: slot 順 (teacherOrder) ベースの inline edit。
  //   部屋 R の slot N を newId に置き換え、slot_index を明示保存する。
  //   同一部屋の別 slot に同一人物がいれば重複を除去(同一人物は①②を兼務しない)。
  const setSlotInOrder = (arr: string[], slotIndex: number, newId: string | null): string[] => {
    const next = arr.slice()
    while (next.length <= slotIndex) next.push("")
    next[slotIndex] = newId || ""
    if (newId) for (let i = 0; i < next.length; i++) if (i !== slotIndex && next[i] === newId) next[i] = ""
    while (next.length > 0 && next[next.length - 1] === "") next.pop() // 末尾の空 slot を除去
    return next
  }

  const handleSlotChangeTeacher = async (
    room: string,
    slotIndex: number,
    newTeacherId: string | null,
  ) => {
    if (!room) return
    const key = `t:${room}:${slotIndex}`
    setSavingSlot(key)
    setSavedMsg("")
    try {
      const prev = teacherOrder[room] || []
      const old = prev[slotIndex]
      const nextArr = setSlotInOrder(prev, slotIndex, newTeacherId)
      const nextOrder = { ...teacherOrder, [room]: nextArr }
      await persistOrder("teacher-assignments", "teacherId", nextOrder)
      setTeacherOrder(nextOrder)
      // 互換用: teacherRooms も更新 (最後の部屋を記憶)
      setTeacherRooms((prevRooms) => {
        const next = { ...prevRooms }
        if (old) next[old] = ""
        if (newTeacherId) next[newTeacherId] = room
        return next
      })
      setSavedMsg(`部屋 ${room} の教員${slotIndex + 1}を更新しました`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error"
      alert(`教員割当の更新に失敗: ${msg}`)
    } finally {
      setSavingSlot(null)
    }
  }

  const handleSlotChangePatient = async (
    room: string,
    slotIndex: number,
    newPatientId: string | null,
  ) => {
    if (!room) return
    const key = `p:${room}:${slotIndex}`
    setSavingSlot(key)
    setSavedMsg("")
    try {
      const prev = patientOrder[room] || []
      const old = prev[slotIndex]
      const nextArr = setSlotInOrder(prev, slotIndex, newPatientId)
      const nextOrder = { ...patientOrder, [room]: nextArr }
      await persistOrder("patient-assignments", "patientId", nextOrder)
      setPatientOrder(nextOrder)
      setPatientRooms((prevRooms) => {
        const next = { ...prevRooms }
        if (old) next[old] = ""
        if (newPatientId) next[newPatientId] = room
        return next
      })
      setSavedMsg(`部屋 ${room} の患者役${slotIndex + 1}を更新しました`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error"
      alert(`患者役割当の更新に失敗: ${msg}`)
    } finally {
      setSavingSlot(null)
    }
  }

  // 2026-07-13: 部屋 R の slot 順で人物配列を返す(index = slot、空 slot は undefined)。
  //   order が無い部屋はメール昇順フォールバック。
  const orderedTeachersInRoom = (room: string): Array<Teacher | undefined> => {
    if (!room) return []
    const ids = teacherOrder[room]
    if (ids && ids.length) return ids.map((id) => (id ? teachers.find((t) => t.id === id) : undefined))
    return teachers
      .filter((t) => teacherPairs.has(`${t.id}::${room}`))
      .sort((a, b) => (a.email || "").localeCompare(b.email || ""))
  }
  const orderedPatientsInRoom = (room: string): Array<Patient | undefined> => {
    if (!room) return []
    const ids = patientOrder[room]
    if (ids && ids.length) return ids.map((id) => (id ? patients.find((p) => p.id === id) : undefined))
    return patients
      .filter((p) => patientPairs.has(`${p.id}::${room}`))
      .sort((a, b) => (a.email || "").localeCompare(b.email || ""))
  }

  const handleSaveTeachers = async () => {
    setSaving(true)
    setSavedMsg("")
    try {
      // 2026-07-13: この教員タブは「1 教員 → 1 部屋」の粗い編集面。①②の明示順を持たない
      //   ため、部屋内はメール昇順で slot_index を採番して保存する(学生タブ/CSV は明示順)。
      const byRoom: Record<string, string[]> = {}
      for (const [teacherId, room] of Object.entries(teacherRooms)) {
        if (!room) continue
        ;(byRoom[room] ||= []).push(teacherId)
      }
      const emailOf = (id: string) => (teachers.find((t) => t.id === id)?.email || "").toLowerCase()
      const nextOrder: Record<string, string[]> = {}
      for (const [room, ids] of Object.entries(byRoom)) {
        ids.sort((a, b) => emailOf(a).localeCompare(emailOf(b)))
        nextOrder[room] = ids
      }
      await persistOrder("teacher-assignments", "teacherId", nextOrder)
      setTeacherOrder(nextOrder)
      const count = Object.values(nextOrder).reduce((n, ids) => n + ids.length, 0)
      setSavedMsg(`教員 ${count} 件の割当を保存しました`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error"
      alert(`教員割当の保存に失敗: ${msg}`)
    } finally {
      setSaving(false)
    }
  }
  const handleSavePatients = async () => {
    setSaving(true)
    setSavedMsg("")
    try {
      const byRoom: Record<string, string[]> = {}
      for (const [patientId, room] of Object.entries(patientRooms)) {
        if (!room) continue
        ;(byRoom[room] ||= []).push(patientId)
      }
      const emailOf = (id: string) => (patients.find((p) => p.id === id)?.email || "").toLowerCase()
      const nextOrder: Record<string, string[]> = {}
      for (const [room, ids] of Object.entries(byRoom)) {
        ids.sort((a, b) => emailOf(a).localeCompare(emailOf(b)))
        nextOrder[room] = ids
      }
      await persistOrder("patient-assignments", "patientId", nextOrder)
      setPatientOrder(nextOrder)
      const count = Object.values(nextOrder).reduce((n, ids) => n + ids.length, 0)
      setSavedMsg(`患者役 ${count} 件の割当を保存しました`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error"
      alert(`患者役割当の保存に失敗: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  // === 学生タブ handler (v3: ステージング+確定パターン) ===

  // ある学生の effective room (pending 反映後の "見た目" 上の部屋)
  // saved を返すか pending を返すか、または null (解除予定 / 未割当)
  const getEffective = (id: string): { savedRoom: string; effectiveRoom: string; hasPending: boolean; pendingKind: "none" | "new" | "move" | "unassign" | "noop" } => {
    const savedRoom = assignmentMap[id] || ""
    if (id in pendingMap) {
      const pending = pendingMap[id]
      if (pending === null) {
        return savedRoom
          ? { savedRoom, effectiveRoom: "", hasPending: true, pendingKind: "unassign" }
          : { savedRoom, effectiveRoom: "", hasPending: false, pendingKind: "noop" }
      }
      // pending is a string
      if (!savedRoom) return { savedRoom, effectiveRoom: pending, hasPending: true, pendingKind: "new" }
      if (savedRoom !== pending) return { savedRoom, effectiveRoom: pending, hasPending: true, pendingKind: "move" }
      return { savedRoom, effectiveRoom: savedRoom, hasPending: false, pendingKind: "noop" }
    }
    return { savedRoom, effectiveRoom: savedRoom, hasPending: false, pendingKind: "none" }
  }

  // 状態フィルタ適用後の visible list (render 時に絞り込み)
  // 「割当済 / 未割当」は effective (pending 反映後) で判定する
  const filteredStudentList = studentList.filter((s) => {
    const eff = getEffective(s.id)
    const isEffectivelyAssigned = !!eff.effectiveRoom
    if (studentSearchStatus === "assigned" && !isEffectivelyAssigned) return false
    if (studentSearchStatus === "unassigned" && isEffectivelyAssigned) return false
    return true
  })
  const visibleStudentIds = filteredStudentList.map((s) => s.id)
  const allVisibleSelected =
    visibleStudentIds.length > 0 && visibleStudentIds.every((id) => selectedStudentIds.has(id))
  const assignedCount = studentList.filter((s) => !!getEffective(s.id).effectiveRoom).length
  const unassignedCount = studentList.length - assignedCount

  // 保留中の有効な変更件数(noop は除外)
  const meaningfulPendingCount = Object.keys(pendingMap).filter((id) => {
    const eff = getEffective(id)
    return eff.hasPending
  }).length

  const handleSearchStudents = async () => {
    if (meaningfulPendingCount > 0) {
      if (!confirm("保留中の変更があります。検索しなおすと選択は解除されます。続けますか?")) return
    }
    setStudentSearching(true)
    setStudentResultMsg("")
    try {
      const univ = studentSearchUniv || undefined
      const subj = studentSearchSubject === "all" ? undefined : studentSearchSubject || undefined
      const grade = studentSearchGrade === "all" ? undefined : studentSearchGrade || undefined
      const [data] = await Promise.all([
        loadStudents(univ, subj, undefined, grade),
        refreshStudentAssignments(),
      ])
      setStudentList(Array.isArray(data) ? data : [])
      setSelectedStudentIds(new Set())
      setLastClickedIdx(null)
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      console.error("[assignment-manager] student search failed:", msg, error)
      alert(`学生検索に失敗しました: ${msg}`)
    } finally {
      setStudentSearching(false)
    }
  }

  // shift+クリックで範囲選択。filteredStudentList の表示順での range を toggle する。
  const toggleStudent = (id: string, checked: boolean) => {
    const idx = filteredStudentList.findIndex((s) => s.id === id)
    if (
      isShiftDownRef.current &&
      lastClickedIdx !== null &&
      idx !== -1 &&
      idx !== lastClickedIdx
    ) {
      const [from, to] = lastClickedIdx < idx ? [lastClickedIdx, idx] : [idx, lastClickedIdx]
      setSelectedStudentIds((prev) => {
        const next = new Set(prev)
        for (let i = from; i <= to; i++) {
          const sid = filteredStudentList[i]?.id
          if (!sid) continue
          if (checked) next.add(sid)
          else next.delete(sid)
        }
        return next
      })
    } else {
      setSelectedStudentIds((prev) => {
        const next = new Set(prev)
        if (checked) next.add(id)
        else next.delete(id)
        return next
      })
    }
    setLastClickedIdx(idx)
  }

  const toggleAllVisibleStudents = (checked: boolean) => {
    setSelectedStudentIds(checked ? new Set(visibleStudentIds) : new Set())
    setLastClickedIdx(null)
  }

  // 2026-05-19 B-1 Step 3: 行ごと部屋セル Select の onValueChange
  // 「(未割当)」を選んだ場合と部屋を選んだ場合で pending を更新する。
  // saved と同じ部屋を選んだ場合は pending を消す (差分なしを示す)。
  const handleStageRowAssign = (studentId: string, roomNumber: string) => {
    setPendingMap((prev) => {
      const next = { ...prev }
      const saved = assignmentMap[studentId] || ""
      if (!roomNumber) {
        // (未割当)
        if (!saved) {
          delete next[studentId]
        } else {
          next[studentId] = null
        }
      } else {
        if (saved === roomNumber) {
          delete next[studentId]
        } else {
          next[studentId] = roomNumber
        }
      }
      return next
    })
    setStudentResultMsg("")
  }

  // 1 行の保留変更を取り消す (元の状態に戻す)
  const handleRevertOneRow = (studentId: string) => {
    setPendingMap((prev) => {
      if (!(studentId in prev)) return prev
      const next = { ...prev }
      delete next[studentId]
      return next
    })
  }

  // 行ごとの 🗑 ボタン: 保留にして解除予定とする (saved がある場合のみ意味がある)
  const handleStageRowUnassign = (studentId: string) => {
    const saved = assignmentMap[studentId] || ""
    if (!saved) return
    setPendingMap((prev) => ({ ...prev, [studentId]: null }))
  }

  const handleDiscardPending = () => {
    if (meaningfulPendingCount === 0) return
    if (!confirm(`保留中の ${meaningfulPendingCount} 件の変更をすべて取り消します。よろしいですか?`)) return
    setPendingMap({})
    setStudentResultMsg("")
  }

  // 確定: チェックを付けた学生に紐づく pending のみ DB に反映する
  // - 部屋指定の pending → POST /api/students (upsert: register_student_canonical RPC)
  // - null pending → DELETE assignment
  const handleCommitChanges = async () => {
    if (selectedStudentIds.size === 0) {
      alert("確定対象の学生にチェックを付けてください")
      return
    }
    // チェック付き学生のうち pending を持つ ID 集合
    const targetIds = Array.from(selectedStudentIds).filter((id) => {
      const eff = getEffective(id)
      return eff.hasPending
    })
    if (targetIds.length === 0) {
      alert("チェックを付けた学生に保留中の変更がありません")
      return
    }
    setStudentProcessing(true)
    setStudentResultMsg("")
    try {
      // 1. 部屋指定 pending を抽出 → bulk POST
      const toAssign: Array<{ student: Student; room: string }> = []
      const toUnassign: string[] = []
      for (const id of targetIds) {
        const val = pendingMap[id]
        if (val === null) {
          toUnassign.push(id)
        } else if (typeof val === "string") {
          const s = studentList.find((x) => x.id === id)
          if (s) toAssign.push({ student: s, room: val })
        }
      }

      let assigned = 0
      let unassigned = 0
      let failed = 0
      const failureReasons: string[] = []

      // 部屋ごとにまとめて 1 回ずつ POST するのも考えられるが、register_student_canonical は
      // 1 件ずつしか受けないため、items 配列でまとめて 1 リクエストに送る方がよい。
      if (toAssign.length > 0) {
        try {
          const items = toAssign.map(({ student, room }) => ({
            ...student,
            roomNumber: room,
            testSessionId: sessionId,
          }))
          await saveStudents(items)
          assigned = items.length
        } catch (e) {
          failed += toAssign.length
          const msg = e instanceof Error ? e.message : String(e)
          failureReasons.push(`割当 ${toAssign.length} 件: ${msg}`)
          console.error("[assignment-manager] bulk assign commit failed:", e)
        }
      }

      if (toUnassign.length > 0) {
        const results = await Promise.allSettled(
          toUnassign.map((id) =>
            fetch(
              `/api/test-sessions/${sessionId}/student-assignments?studentId=${encodeURIComponent(id)}`,
              { method: "DELETE", credentials: "same-origin" },
            ).then(async (r) => {
              if (!r.ok) {
                const err = await r.json().catch(() => null)
                throw new Error(err?.error || `${r.status}`)
              }
            }),
          ),
        )
        const ok = results.filter((r) => r.status === "fulfilled").length
        unassigned = ok
        const rejections = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        )
        failed += rejections.length
        // 同じ理由が並びがちなので最大 3 件・重複排除して表示する
        const uniqueReasons = Array.from(
          new Set(
            rejections.map((r) =>
              r.reason instanceof Error ? r.reason.message : String(r.reason),
            ),
          ),
        ).slice(0, 3)
        for (const reason of uniqueReasons) {
          failureReasons.push(`解除: ${reason}`)
        }
      }

      const parts: string[] = []
      if (assigned > 0) parts.push(`${assigned} 件の割当`)
      if (unassigned > 0) parts.push(`${unassigned} 件の解除`)
      const summary = parts.length > 0 ? parts.join(" / ") : "(変更なし)"
      if (failed > 0) {
        const detail = failureReasons.length > 0 ? ` / 失敗理由: ${failureReasons.join("; ")}` : ""
        setStudentResultMsg(`⚠ ${summary} を保存しましたが ${failed} 件失敗しました${detail}`)
      } else {
        setStudentResultMsg(`✅ ${summary} を保存しました`)
      }

      // 確定対象の pending をクリアして DB から再取得
      setPendingMap((prev) => {
        const next = { ...prev }
        for (const id of targetIds) delete next[id]
        return next
      })
      await refreshStudentAssignments()
      setSelectedStudentIds(new Set())
      setLastClickedIdx(null)
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      console.error("[assignment-manager] commit failed:", msg, error)
      alert(`確定に失敗しました: ${msg}`)
    } finally {
      setStudentProcessing(false)
    }
  }

  // ============================================================
  // 2026-07-01 熊木先生要望: 試験セッション割当 CSV 取込 / エクスポート
  // 案 A (統合 1 CSV): 学籍番号,氏名,部屋番号,教員①メール,教員②メール,患者役メール
  // ============================================================
  const CIRCLE_NUM = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"]

  const buildAssignmentCsv = (targetStudents: Student[]): string => {
    const headers: string[] = ["学籍番号", "氏名", "部屋番号"]
    for (let i = 0; i < teacherSlotCount; i++) {
      headers.push(`教員${teacherSlotCount > 1 ? CIRCLE_NUM[i] || `(${i + 1})` : ""}メール`)
    }
    for (let i = 0; i < patientSlotCount; i++) {
      headers.push(`患者役${patientSlotCount > 1 ? CIRCLE_NUM[i] || `(${i + 1})` : ""}メール`)
    }
    const rows: string[][] = [headers]
    for (const s of targetStudents) {
      const room = assignmentMap[s.id] || ""
      // 2026-07-13: slot 順 (①②…) で書き出す
      const teachersHere = orderedTeachersInRoom(room)
      const patientsHere = orderedPatientsInRoom(room)
      const row: string[] = [s.studentId, s.name, room]
      for (let i = 0; i < teacherSlotCount; i++) row.push(teachersHere[i]?.email || "")
      for (let i = 0; i < patientSlotCount; i++) row.push(patientsHere[i]?.email || "")
      rows.push(row)
    }
    return rows.map((r) => r.map((c) => (c ?? "").replace(/,/g, " ")).join(",")).join("\n")
  }

  const handleAssignmentTemplateDownload = () => {
    // ヘッダー行だけ buildAssignmentCsv で流用し、データ行は空欄でテンプレ生成
    const headerLine = buildAssignmentCsv([]).split("\n")[0]
    const emptyCells = new Array(teacherSlotCount + patientSlotCount).fill("").join(",")
    const tplLines: string[] = [headerLine]
    for (const s of studentList) {
      const row = [s.studentId, (s.name || "").replace(/,/g, " "), ""]
      const dataRow = emptyCells ? `${row.join(",")},${emptyCells}` : row.join(",")
      tplLines.push(dataRow)
    }
    const blob = csvDownloadBlob(tplLines.join("\n"))
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `試験セッション割当テンプレート_${testSession?.description || sessionId}.csv`
    link.click()
  }

  const handleAssignmentExport = () => {
    if (studentList.length === 0) {
      alert("エクスポートする学生がいません")
      return
    }
    const csv = buildAssignmentCsv(studentList)
    const blob = csvDownloadBlob(csv)
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `試験セッション割当_${testSession?.description || sessionId}_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
  }

  const handleAssignmentCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    event.target.value = ""
    let text: string
    try {
      text = await readCsvFile(file)
    } catch (err) {
      alert(err instanceof Error ? err.message : "CSV ファイルの読み込みに失敗しました")
      return
    }
    const lines = text.split("\n").filter((l) => l.trim())
    if (lines.length < 2) {
      alert("CSV にデータ行がありません(ヘッダー行のみ等)")
      return
    }
    const headers = lines[0].split(",").map((s) => s.trim())
    const stuIdIdx = headers.findIndex((h) => h.includes("学籍番号") || h.toLowerCase().includes("student"))
    const roomIdx = headers.findIndex((h) => h.includes("部屋番号") || h.toLowerCase().includes("room"))
    if (stuIdIdx < 0 || roomIdx < 0) {
      alert("CSV に「学籍番号」列または「部屋番号」列が見つかりません")
      return
    }
    const teacherColIdxs: number[] = []
    const patientColIdxs: number[] = []
    headers.forEach((h, i) => {
      if (h.includes("教員") && h.includes("メール")) teacherColIdxs.push(i)
      if (h.includes("患者") && h.includes("メール")) patientColIdxs.push(i)
    })

    const nextPendingMap = { ...pendingMap }
    // 2026-07-13: 教員/患者役は複数部屋担当可 (DB PK scripts/246)。
    //   CSV 列位置 (教員①=0, 教員②=1...) を slot_index として保存し、①②順を保持する。
    //   部屋 → slot 順 id 配列 (index = slot) を組み立てる。
    const teacherOrderMap: Record<string, string[]> = {}
    const patientOrderMap: Record<string, string[]> = {}
    const foundStudentIds = new Set<string>()
    const warnings: string[] = []
    let assignCount = 0
    let unassignCount = 0

    for (let li = 1; li < lines.length; li++) {
      // 2026-07-03 副田さん指摘: 全角英数字が混入しているとメール/学籍番号がマッチしない。
      // 各セルを半角に normalize してから解釈する (部屋番号の丸数字 ①②... は影響なし)。
      const cols = lines[li].split(",").map((s) => normalizeHalfwidth(s.trim()))
      const studentIdVal = cols[stuIdIdx]
      const roomVal = cols[roomIdx] || ""
      if (!studentIdVal) continue
      const student = studentList.find((s) => s.studentId === studentIdVal)
      if (!student) {
        warnings.push(`行 ${li + 1}: 学籍番号 "${studentIdVal}" は学生一覧にありません`)
        continue
      }
      foundStudentIds.add(student.id)

      if (!roomVal) {
        // 部屋番号空欄 → 割当解除 (saved が空なら noop)
        const saved = assignmentMap[student.id] || ""
        if (saved) nextPendingMap[student.id] = null
        else delete nextPendingMap[student.id]
        unassignCount++
        continue
      }

      const roomExists = rooms.some((r) => r.roomNumber === roomVal)
      if (!roomExists) {
        warnings.push(`行 ${li + 1}: 部屋番号 "${roomVal}" は部屋マスターに存在しません`)
        continue
      }

      // 学生の部屋 pending
      const saved = assignmentMap[student.id] || ""
      if (saved === roomVal) delete nextPendingMap[student.id]
      else nextPendingMap[student.id] = roomVal

      // 教員割当: 列位置 (teacherColIdxs の index) = slot_index (教員①=0, 教員②=1...)
      teacherColIdxs.forEach((ci, slot) => {
        const email = (cols[ci] || "").trim()
        if (!email) return
        const teacher = teachers.find((t) => (t.email || "").toLowerCase() === email.toLowerCase())
        if (!teacher) {
          warnings.push(`行 ${li + 1}: 教員メール "${email}" は見つかりません`)
          return
        }
        const arr = teacherOrderMap[roomVal] || (teacherOrderMap[roomVal] = [])
        arr[slot] = teacher.id
      })
      // 患者役割当: 同様に列位置 = slot_index
      patientColIdxs.forEach((ci, slot) => {
        const email = (cols[ci] || "").trim()
        if (!email) return
        const patient = patients.find((p) => (p.email || "").toLowerCase() === email.toLowerCase())
        if (!patient) {
          warnings.push(`行 ${li + 1}: 患者役メール "${email}" は見つかりません`)
          return
        }
        const arr = patientOrderMap[roomVal] || (patientOrderMap[roomVal] = [])
        arr[slot] = patient.id
      })
      assignCount++
    }

    setPendingMap(nextPendingMap)
    setSelectedStudentIds(foundStudentIds)  // 確定対象に自動セット

    // 教員/患者役は即時 PUT (完全置換 = 既存 assignment を全て削除して CSV 内容で作り直す)。
    //   slot_index も送るため①②順が保存される。
    try {
      // 空 slot ("") を正規化し、末尾の空 slot を除去
      const normalize = (m: Record<string, string[]>): Record<string, string[]> => {
        const out: Record<string, string[]> = {}
        for (const [room, arr] of Object.entries(m)) {
          const dense = arr.map((x) => x || "")
          while (dense.length > 0 && dense[dense.length - 1] === "") dense.pop()
          if (dense.length > 0) out[room] = dense
        }
        return out
      }
      const teacherOrderNext = normalize(teacherOrderMap)
      const patientOrderNext = normalize(patientOrderMap)
      await Promise.all([
        persistOrder("teacher-assignments", "teacherId", teacherOrderNext),
        persistOrder("patient-assignments", "patientId", patientOrderNext),
      ])
      // UI 表示 state を更新。teacherRooms/patientRooms は互換用に「最後の部屋」で埋める。
      const displayTeacherRooms: Record<string, string> = {}
      for (const [room, ids] of Object.entries(teacherOrderNext))
        for (const id of ids) if (id) displayTeacherRooms[id] = room
      const displayPatientRooms: Record<string, string> = {}
      for (const [room, ids] of Object.entries(patientOrderNext))
        for (const id of ids) if (id) displayPatientRooms[id] = room
      setTeacherRooms(displayTeacherRooms)
      setPatientRooms(displayPatientRooms)
      setTeacherOrder(teacherOrderNext)
      setPatientOrder(patientOrderNext)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`教員/患者役割当の保存に失敗しました: ${msg}`)
      return
    }

    const warnMsg = warnings.length
      ? `\n\n警告:\n${warnings.slice(0, 10).join("\n")}${warnings.length > 10 ? `\n... 他 ${warnings.length - 10} 件` : ""}`
      : ""
    alert(
      `CSV 取込完了\n` +
        `- 学生 ${assignCount} 件を部屋割当 pending に追加\n` +
        (unassignCount > 0 ? `- 学生 ${unassignCount} 件を割当解除 pending に追加\n` : "") +
        `- 教員/患者役の部屋割当は保存済み\n\n` +
        `続いて下部の「確定」ボタンで学生の割当を保存してください${warnMsg}`,
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-secondary/30 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      </div>
    )
  }

  if (!testSession) {
    return (
      <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>試験セッションが見つかりません</CardTitle>
            <CardDescription>指定された試験セッションは存在しないか、アクセス権限がありません。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/admin/dashboard")}>
              <Home className="w-4 h-4 mr-2" />ダッシュボードに戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const renderTeacherTab = () => (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        canonical な教員 {teachers.length} 名から、この試験で担当する部屋を選んでください。
        「未割当」を選ぶと割当解除です。
      </div>
      <div className="border rounded-md max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="text-left p-2">氏名</th>
              <th className="text-left p-2">メール</th>
              <th className="text-left p-2">権限</th>
              <th className="text-left p-2 w-48">担当部屋</th>
            </tr>
          </thead>
          <tbody>
            {teachers.length === 0 ? (
              <tr><td colSpan={4} className="text-center p-6 text-muted-foreground">登録済み教員がありません</td></tr>
            ) : (
              teachers.map((t) => (
                <tr key={t.id} className="border-t hover:bg-muted/30">
                  <td className="p-2 font-medium">{t.name}</td>
                  <td className="p-2 font-mono text-xs">{t.email}</td>
                  <td className="p-2 text-xs text-muted-foreground">{t.role}</td>
                  <td className="p-2">
                    <Select
                      value={teacherRooms[t.id] || UNASSIGNED}
                      onValueChange={(v) => handleTeacherRoomChange(t.id, v)}
                    >
                      <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue placeholder="未割当" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>(未割当)</SelectItem>
                        {rooms.map((r) => (
                          <SelectItem key={r.id} value={r.roomNumber}>
                            {r.roomNumber} - {r.roomName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSaveTeachers} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "保存中..." : "教員の割当を保存"}
        </Button>
      </div>
    </div>
  )

  const renderPatientTab = () => (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        canonical な患者役 {patients.length} 名から、この試験で担当する部屋を選んでください。
      </div>
      <div className="border rounded-md max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="text-left p-2">氏名</th>
              <th className="text-left p-2">メール</th>
              <th className="text-left p-2 w-48">担当部屋</th>
            </tr>
          </thead>
          <tbody>
            {patients.length === 0 ? (
              <tr><td colSpan={3} className="text-center p-6 text-muted-foreground">登録済み患者役がありません</td></tr>
            ) : (
              patients.map((p) => (
                <tr key={p.id} className="border-t hover:bg-muted/30">
                  <td className="p-2 font-medium">{p.name}</td>
                  <td className="p-2 font-mono text-xs">{p.email}</td>
                  <td className="p-2">
                    <Select
                      value={patientRooms[p.id] || UNASSIGNED}
                      onValueChange={(v) => handlePatientRoomChange(p.id, v)}
                    >
                      <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue placeholder="未割当" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>(未割当)</SelectItem>
                        {rooms.map((r) => (
                          <SelectItem key={r.id} value={r.roomNumber}>
                            {r.roomNumber} - {r.roomName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSavePatients} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "保存中..." : "患者役の割当を保存"}
        </Button>
      </div>
    </div>
  )

  const renderStudentTab = () => {
    const accountType = session?.accountType || ""

    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-[280px]">
              <CardTitle className="text-base">学生の割当</CardTitle>
              <CardDescription className="space-y-1">
                <span className="block">
                  行の「部屋」プルダウンで部屋を選び、対象学生のチェックボックスをオン(Shift で範囲選択可)にしてから
                  <strong>「確定」</strong> ボタンで一括保存します。確定するまで DB は変更されません。
                </span>
                <span className="block text-amber-700">
                  ⚠ 教員/患者役は <strong>部屋単位</strong> の割当です。同じ部屋にいる学生は同じ教員ペアで評価されるため、
                  ある学生の行で教員を変更すると、同じ部屋の他の学生行にも同じ教員が表示されます(セル選択と同時に保存)。
                </span>
              </CardDescription>
            </div>
            {/* 2026-07-01 熊木先生要望: CSV 一括割当 (600 人規模対応) */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAssignmentTemplateDownload}
                title="現在の学生一覧に基づく空欄テンプレートをダウンロード"
              >
                <FileText className="w-4 h-4 mr-1" />
                CSV テンプレDL
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAssignmentExport}
                title="現在の割当状態を CSV でエクスポート"
              >
                <Download className="w-4 h-4 mr-1" />
                CSV エクスポート
              </Button>
              <label>
                <input
                  id="assignment-csv-upload"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleAssignmentCSVUpload}
                />
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => document.getElementById("assignment-csv-upload")?.click()}
                  title="CSV で学生-部屋-教員-患者役の割当を一括登録"
                >
                  <Upload className="w-4 h-4 mr-1" />
                  CSV 一括取込
                </Button>
              </label>
            </div>
          </div>
          {/* 2026-07-01 副田さん指摘: 自動切替の挙動を UI 上明示 */}
          <div className="mt-2 text-xs text-muted-foreground bg-blue-50 border border-blue-100 rounded px-2 py-1 inline-block">
            現セッションの構成
            <span className="font-semibold text-blue-800 mx-1">
              教員側 {teacherSlotCount} 個
              {patientSlotCount > 0 && ` + 患者役 ${patientSlotCount} 個`}
            </span>
            に応じて、CSV テンプレの列は
            <span className="font-semibold text-blue-800 mx-1">
              {[
                ...Array.from({ length: teacherSlotCount }, (_, i) =>
                  teacherSlotCount > 1 ? `教員${["①", "②", "③"][i] || `(${i + 1})`}` : "教員",
                ),
                ...Array.from({ length: patientSlotCount }, (_, i) =>
                  patientSlotCount > 1 ? `患者役${["①", "②", "③"][i] || `(${i + 1})`}` : "患者役",
                ),
              ].join("・") || "(なし)"}
            </span>
            のメールを含む形で自動生成されます。
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* フィルタ */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">大学</Label>
              {accountType === "special_master" ? (
                <Select
                  value={studentSearchUniv || "all"}
                  onValueChange={(v) => setStudentSearchUniv(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="すべて" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    {Object.entries(universities).map(([code, name]) => (
                      <SelectItem key={code} value={code}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center h-9 px-3 bg-muted rounded-md text-sm">
                  {universities[studentSearchUniv] || studentSearchUniv || "未設定"}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">学年</Label>
              <Select value={studentSearchGrade} onValueChange={setStudentSearchGrade}>
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
                  {subjects.find((s) => s.subjectCode === studentSearchSubject)?.subjectName ||
                    studentSearchSubject ||
                    "未設定"}
                </div>
              ) : (
                <Select value={studentSearchSubject} onValueChange={setStudentSearchSubject}>
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

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">状態</Label>
              <Select
                value={studentSearchStatus}
                onValueChange={(v) => setStudentSearchStatus(v as "all" | "assigned" | "unassigned")}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                  <SelectItem value="assigned">割当済のみ</SelectItem>
                  <SelectItem value="unassigned">未割当のみ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSearchStudents} disabled={studentSearching}>
              <Search className="w-4 h-4 mr-2" />
              {studentSearching ? "検索中..." : "検索"}
            </Button>
          </div>

          {/* 一覧 */}
          <div className="space-y-2 border-t pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={(v) => toggleAllVisibleStudents(Boolean(v))}
                  disabled={visibleStudentIds.length === 0}
                />
                <span>
                  全選択({selectedStudentIds.size} / {visibleStudentIds.length} 名選択中)
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                表示 {filteredStudentList.length} 名(該当 {studentList.length} 名: 割当済 {assignedCount} / 未割当 {unassignedCount})
              </div>
            </div>

            <div className="border rounded-md max-h-[60vh] overflow-auto bg-white">
              <table className="min-w-full text-sm bg-white">
                <thead className="sticky top-0 bg-white border-b z-10">
                  <tr>
                    <th className="w-10 p-2"></th>
                    <th className="p-2 text-left whitespace-nowrap">学籍番号</th>
                    <th className="p-2 text-left whitespace-nowrap">氏名</th>
                    <th className="p-2 text-left whitespace-nowrap">メール</th>
                    <th className="p-2 text-left whitespace-nowrap">学年</th>
                    <th className="p-2 text-left whitespace-nowrap">部屋</th>
                    {/* 2026-05-19 B-1 Step 2: teacherSlotCount に応じて動的に列を生成
                        副田さん指示: 教員側テスト 1 つだけなら教員①のみ、2 つなら教員①②
                        2026-05-20 B-1 Step 3 補強: 部屋単位仕様であることをヘッダーに明示 */}
                    {Array.from({ length: teacherSlotCount }, (_, i) => (
                      <Fragment key={`th-teacher-${i}`}>
                        <th className="p-2 text-left whitespace-nowrap">
                          教員{["①", "②", "③", "④", "⑤"][i] || `(${i + 1})`}
                          <span className="text-xs text-amber-700 font-normal block">部屋共通</span>
                        </th>
                        <th className="p-2 text-left whitespace-nowrap">
                          教員{["①", "②", "③", "④", "⑤"][i] || `(${i + 1})`}の権限
                        </th>
                      </Fragment>
                    ))}
                    {Array.from({ length: patientSlotCount }, (_, i) => (
                      <th key={`th-patient-${i}`} className="p-2 text-left whitespace-nowrap">
                        患者役{patientSlotCount > 1 ? ["①", "②", "③"][i] || `(${i + 1})` : ""}
                        <span className="text-xs text-amber-700 font-normal block">部屋共通</span>
                      </th>
                    ))}
                    <th className="p-2 text-left whitespace-nowrap">状態</th>
                    <th className="p-2 w-12"></th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {filteredStudentList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6 + teacherSlotCount * 2 + patientSlotCount + 2}
                        className="text-center p-6 text-muted-foreground"
                      >
                        {studentSearching
                          ? "検索中..."
                          : studentList.length === 0
                            ? "条件に該当する学生がいません。フィルタを変えて再検索してください。"
                            : "現在のフィルタでは表示する学生がありません(状態フィルタを変えてみてください)"}
                      </td>
                    </tr>
                  ) : (
                    filteredStudentList.map((s) => {
                      const eff = getEffective(s.id)
                      // 行の背景色: pending 種別ごとに薄い色
                      const rowBg =
                        eff.pendingKind === "new" ? "bg-green-50" :
                        eff.pendingKind === "move" ? "bg-amber-50" :
                        eff.pendingKind === "unassign" ? "bg-red-50" :
                        "bg-white"
                      // 2026-07-13: その学生の effective room に assign されている
                      // 教員 / 患者役 を slot 順(①②…)で表示
                      const room = eff.effectiveRoom
                      const teachersHere = orderedTeachersInRoom(room)
                      const patientsHere = orderedPatientsInRoom(room)
                      const roleLabel = (role: string | undefined): string => {
                        switch (role) {
                          case "master_admin": return "マスター管理者"
                          case "university_admin": return "大学管理者"
                          case "university_master": return "大学管理者"
                          case "subject_admin": return "教科管理者"
                          case "general": return "一般"
                          default: return role || ""
                        }
                      }
                      return (
                        <tr key={s.id} className={`border-t hover:bg-blue-50/40 ${rowBg}`}>
                          <td className="p-2">
                            <Checkbox
                              checked={selectedStudentIds.has(s.id)}
                              onCheckedChange={(v) => toggleStudent(s.id, Boolean(v))}
                            />
                          </td>
                          <td className="p-2 font-mono whitespace-nowrap">{s.studentId}</td>
                          <td className="p-2 whitespace-nowrap">{s.name}</td>
                          <td className="p-2 text-xs font-mono text-muted-foreground whitespace-nowrap">{s.email || "—"}</td>
                          <td className="p-2 whitespace-nowrap">{s.grade || "—"}</td>
                          <td className="p-1.5 whitespace-nowrap">
                            <Select
                              value={eff.effectiveRoom || UNASSIGNED}
                              onValueChange={(v) =>
                                handleStageRowAssign(s.id, v === UNASSIGNED ? "" : v)
                              }
                            >
                              <SelectTrigger
                                className={`h-8 w-32 text-xs bg-white ${
                                  eff.pendingKind === "move"
                                    ? "border-amber-500"
                                    : eff.pendingKind === "new"
                                      ? "border-green-500"
                                      : eff.pendingKind === "unassign"
                                        ? "border-red-500"
                                        : ""
                                }`}
                              >
                                <SelectValue placeholder="(未割当)" />
                              </SelectTrigger>
                              <SelectContent className="max-h-[300px] overflow-y-auto">
                                <SelectItem value={UNASSIGNED}>(未割当)</SelectItem>
                                {rooms.map((r) => (
                                  <SelectItem key={r.id} value={r.roomNumber}>
                                    {r.roomNumber} - {r.roomName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          {/* 教員 slot N: 名前 + 権限ペア (動的) */}
                          {Array.from({ length: teacherSlotCount }, (_, i) => {
                            const slotKey = `t:${room}:${i}`
                            const tHere = teachersHere[i]
                            const currentId = tHere?.id || ""
                            const candidates = teachers
                              .slice()
                              .sort((a, b) => (a.email || "").localeCompare(b.email || ""))
                            const disabled = !room || savingSlot === slotKey
                            return (
                              <Fragment key={`td-teacher-${s.id}-${i}`}>
                                <td className="p-1.5 whitespace-nowrap">
                                  <Select
                                    value={currentId || UNASSIGNED}
                                    disabled={disabled}
                                    onValueChange={(v) =>
                                      handleSlotChangeTeacher(room, i, v === UNASSIGNED ? null : v)
                                    }
                                  >
                                    <SelectTrigger className="h-8 w-40 text-xs bg-white">
                                      <SelectValue placeholder={room ? "(未割当)" : "(部屋未定)"} />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[400px] overflow-y-auto">
                                      <SelectItem value={UNASSIGNED}>(未割当)</SelectItem>
                                      {candidates.map((tt) => (
                                        <SelectItem key={tt.id} value={tt.id}>
                                          {tt.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                                  {tHere ? roleLabel(tHere.role) : "—"}
                                </td>
                              </Fragment>
                            )
                          })}
                          {/* 患者役 slot N (動的) */}
                          {Array.from({ length: patientSlotCount }, (_, i) => {
                            const slotKey = `p:${room}:${i}`
                            const pHere = patientsHere[i]
                            const currentId = pHere?.id || ""
                            const candidates = patients
                              .slice()
                              .sort((a, b) => (a.email || "").localeCompare(b.email || ""))
                            const disabled = !room || savingSlot === slotKey
                            return (
                              <td key={`td-patient-${s.id}-${i}`} className="p-1.5 whitespace-nowrap">
                                <Select
                                  value={currentId || UNASSIGNED}
                                  disabled={disabled}
                                  onValueChange={(v) =>
                                    handleSlotChangePatient(room, i, v === UNASSIGNED ? null : v)
                                  }
                                >
                                  <SelectTrigger className="h-8 w-40 text-xs bg-white">
                                    <SelectValue placeholder={room ? "(未割当)" : "(部屋未定)"} />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-[300px] overflow-y-auto">
                                    <SelectItem value={UNASSIGNED}>(未割当)</SelectItem>
                                    {candidates.map((pp) => (
                                      <SelectItem key={pp.id} value={pp.id}>
                                        {pp.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                            )
                          })}
                          <td className="p-2">
                            {eff.pendingKind === "new" && (
                              <span className="text-xs px-2 py-0.5 rounded bg-green-200 text-green-800">新規(保留)</span>
                            )}
                            {eff.pendingKind === "move" && (
                              <span className="text-xs px-2 py-0.5 rounded bg-amber-200 text-amber-800">移動(保留)</span>
                            )}
                            {eff.pendingKind === "unassign" && (
                              <span className="text-xs px-2 py-0.5 rounded bg-red-200 text-red-800">解除(保留)</span>
                            )}
                            {!eff.hasPending && eff.savedRoom && (
                              <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">割当済</span>
                            )}
                            {!eff.hasPending && !eff.savedRoom && (
                              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">未割当</span>
                            )}
                          </td>
                          <td className="p-2 text-right">
                            {eff.hasPending ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRevertOneRow(s.id)}
                                title="この行の保留変更を取り消す"
                              >
                                <RotateCcw className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            ) : eff.savedRoom ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStageRowUnassign(s.id)}
                                title="この学生の割当を保留で解除"
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* 確定 / キャンセル */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t bg-muted/40 -mx-6 px-6 py-3 mt-3 rounded-b">
              <div className="text-sm">
                {meaningfulPendingCount > 0 ? (
                  <span className="font-medium text-amber-700">
                    保留中の変更: {meaningfulPendingCount} 件
                    {selectedStudentIds.size > 0 && (
                      <span className="ml-2 text-muted-foreground">
                        (チェック付き: {selectedStudentIds.size} 名)
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">保留中の変更はありません</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleDiscardPending}
                  disabled={studentProcessing || meaningfulPendingCount === 0}
                  title="保留中の変更をすべて取り消す"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  キャンセル
                </Button>
                <Button
                  size="lg"
                  className="bg-primary hover:bg-primary/90"
                  onClick={handleCommitChanges}
                  disabled={studentProcessing || selectedStudentIds.size === 0}
                  title="チェックを付けた学生の保留中変更を保存します"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {studentProcessing
                    ? "保存中..."
                    : selectedStudentIds.size > 0
                      ? `確定 (${selectedStudentIds.size} 名)`
                      : "確定"}
                </Button>
              </div>
            </div>

            {studentResultMsg && (
              <div
                className={
                  studentResultMsg.startsWith("⚠")
                    ? "p-3 rounded-md bg-amber-50 text-sm border border-amber-200 text-amber-900 break-words"
                    : "p-3 rounded-md bg-green-50 text-sm border border-green-200"
                }
              >
                {studentResultMsg}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <PageContainer width="wide">
      <div className="space-y-6">
        {/* 2026-11-06 デザイン見直し: 割当表は情報量が多いので wide(1,600px)。
            「戻る」はヘッダー右上と重複するため削除し、ダッシュボードへのリンクは見出しの上に統一 */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <BackLink href="/admin/dashboard" label="ダッシュボードに戻る" hideWhenAdminNav />
            <h1 className="text-[28px] leading-tight font-bold text-primary">試験セッション割当管理</h1>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-medium">{testSession.description || "(名称未設定)"}</span>
              {testSession.testDate && ` — ${new Date(testSession.testDate).toLocaleDateString("ja-JP")}`}
            </p>
            {testSession.universityCode && (
              <p className="text-xs text-muted-foreground mt-1">
                大学:{" "}
                <span className="font-medium text-foreground">
                  {universities[testSession.universityCode] || testSession.universityCode}
                </span>
                {" — "}この大学に属する教員・患者役・学生・部屋のみが候補に出ます
              </p>
            )}
          </div>
        </div>

        {savedMsg && (
          <div className="p-3 rounded-md bg-green-50 border border-green-200 text-sm text-green-800">
            ✅ {savedMsg}
          </div>
        )}

        {/* 2026-05-19 副田さん仕様変更: 教員/患者役/学生 3 タブを学生中心 1 テーブルに統合
            Step 1: 学生テーブルに 教員①/②/患者役 を read-only カラムとして表示
            Step 2 (次 PR): 各セル inline edit ドロップダウン */}
        {renderStudentTab()}
      </div>
    </PageContainer>
  )
}
