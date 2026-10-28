"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Users, Clock, CheckCircle, XCircle, DoorOpen, Trophy } from "lucide-react"
import {
  loadStudents,
  loadTeachers,
  loadPatients,
  loadRooms,
  loadEvaluationResults,
  loadAttendanceRecords,
  loadTests,
  loadSubjects,
  type EvaluationResult,
} from "@/lib/data-storage"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSession } from "@/lib/auth/use-session"
import { computePassResult } from "@/lib/passing"

interface RoleStats {
  completedCount: number
  alertCount: number
  averageScore: number
}

// 2026-07-10 副田さん要望: 部屋詳細モーダルで教員①/教員②/患者役をそれぞれ独立集計。
interface SlotStats {
  roleType: "teacher" | "patient"
  slotIndex: number
  label: string          // "教員①" / "教員②" / "患者役" / "患者役②"
  personName: string
  personEmail: string
  completedCount: number
  alertCount: number
  averageScore: number
}

interface RoomData {
  roomNumber: string
  roomName: string
  teacherName: string  // 互換用: 主 (1 名目) の名前
  patientName: string
  // 2026-07-03 副田さん要望: 教員①②/患者役 の名前を可変 slot で表示
  teacherNames: string[]  // メール昇順で全員
  patientNames: string[]
  presentCount: number
  absentCount: number
  completedCount: number
  alertCount: number
  averageScore: number
  passCount: number
  teacherStats: RoleStats
  patientStats: RoleStats
  // 2026-07-10 副田さん要望: slot 別 (教員①/教員②/患者役) 集計
  teacherSlots: SlotStats[]
  patientSlots: SlotStats[]
  students: Array<{ id: string; name: string; status: string; isCompleted: boolean; totalScore: number; alertCount: number; combinedScore: number; passResult?: "合格" | "不合格" | ""; completedBy?: string[] }>
  universityCode?: string
}

const SLOT_LABELS_TEACHER = ["教員①", "教員②", "教員③", "教員④"]
const SLOT_LABELS_PATIENT = ["患者役", "患者役②", "患者役③", "患者役④"]

interface PersonWithEmail {
  name: string
  assignedRoomNumber: string
  email?: string
}

interface EvalRow {
  studentId: string
  evaluatorType?: string
  evaluatorId?: string
  isCompleted?: boolean
  hasAlert?: boolean
  totalScore?: number | null
}

function buildSlotStats(
  personsInRoom: PersonWithEmail[],
  roleType: "teacher" | "patient",
  roomEvaluations: EvalRow[],
): SlotStats[] {
  const labels = roleType === "teacher" ? SLOT_LABELS_TEACHER : SLOT_LABELS_PATIENT
  return personsInRoom.map((p, i) => {
    const email = (p.email || "").toLowerCase()
    const slotEvals = roomEvaluations.filter(
      (e) =>
        e.evaluatorType === roleType &&
        (e.evaluatorId || "").toLowerCase() === email,
    )
    const completed = new Set<string>()
    const alerts = new Set<string>()
    const scoreMap = new Map<string, number>()
    for (const e of slotEvals) {
      if (e.isCompleted) {
        completed.add(e.studentId)
        scoreMap.set(e.studentId, e.totalScore || 0)
      }
      if (e.hasAlert) alerts.add(e.studentId)
    }
    const scores = Array.from(scoreMap.values())
    const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    return {
      roleType,
      slotIndex: i,
      label: labels[i] || `${roleType === "teacher" ? "教員" : "患者役"}${i + 1}`,
      personName: p.name,
      personEmail: email,
      completedCount: completed.size,
      alertCount: alerts.size,
      averageScore: avg,
    }
  })
}

interface Student {
  studentId: string
  name: string
  email?: string
  roomNumber: string
  universityCode?: string
}

interface Teacher {
  name: string
  assignedRoomNumber: string
}

interface PatientRole {
  name: string
  assignedRoomNumber: string
}

interface AttendanceRecord {
  studentId: string
  status: string
}

interface Evaluation {
  studentId: string
  roomNumber: string
  totalScore: number
  testId: string
  hasAlert: boolean
  isCompleted: boolean
  evaluatorType?: string
}

interface University {
  code: string
  name: string
}

interface TestSession {
  id: string
  description: string
  universityCode: string
  testDate: string
  passingScore?: number
}

const AdminDashboard = () => {
  const router = useRouter()
  const [userRole, setUserRole] = useState<string | null>(null)
  const [rooms, setRooms] = useState<RoomData[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [patients, setPatients] = useState<PatientRole[]>([])
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null)
  const selectedRoomData = selectedRoom ? rooms.find((r) => r.roomNumber === selectedRoom) : null
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [updateCounter, setUpdateCounter] = useState(0)
  const [accountType, setAccountType] = useState<string | null>(null)
  const [universities, setUniversities] = useState<University[]>([])
  const [testSessions, setTestSessions] = useState<TestSession[]>([])
  const [selectedUniversity, setSelectedUniversity] = useState<string>("")
  // 2026-05-07: 試験セッションセレクタの初期値を sessionStorage から復元する
  // (これまで dashboard 上ではセッションを切り替える手段が無く、
  //  sessionStorage の testSessionId が UI と乖離していた)
  const [selectedTestCode, setSelectedTestCode] = useState<string>(() => {
    if (typeof window === "undefined") return "all"
    return sessionStorage.getItem("testSessionId") || "all"
  })
  const [tests, setTests] = useState<any[]>([])
  const [isTeacherLogin, setIsTeacherLogin] = useState(false)
  const [assignedSubjectName, setAssignedSubjectName] = useState<string>("")
  const hasSetDefaultUniversity = useRef(false)
  const currentPassingScore = (() => {
    if (typeof window === "undefined") return undefined
    const sid = sessionStorage.getItem("testSessionId") || ""
    return testSessions.find((s) => s.id === sid)?.passingScore
  })()

  // Phase 9b-β2c: sessionStorage 認可キーを useSession() に置換
  const { session, isLoading: isSessionLoading } = useSession()

  useEffect(() => {
    if (isSessionLoading) return
    const fetchData = async () => {
      if (!session) {
        router.push("/admin/login")
        return
      }

      const universityCodes = session.universityCodes && session.universityCodes.length > 0
        ? session.universityCodes
        : ["dentshowa"]
      const isMasterAdmin = universityCodes.includes("ALL")
      let fetchedSessions: TestSession[] = []

      // userRole は "admin" を設定（ダッシュボードのアクセス許可用）
      setUserRole("admin")

      const storedAccountType = session.accountType
      setAccountType(storedAccountType || "admin")

      // teacherRole 相当: session.role を直接使う(教員ログイン経由の admin 画面アクセス判定用)
      // teacherId は session.userId を流用
      if (session.loginType === "teacher") {
        setIsTeacherLogin(true)
      }

      // アカウントに割り当てられた教科名を取得
      const mySubjectCode = session.subjectCode || ""
      if (mySubjectCode) {
        try {
          const allSubjects = await loadSubjects()
          const mySubject = allSubjects.find((s: any) => s.subjectCode === mySubjectCode)
          if (mySubject) {
            setAssignedSubjectName(mySubject.subjectName)
          }
        } catch (e) {
        }
      }

      if (storedAccountType === "special_master") {
        try {
          const response = await fetch("/api/universities")
          if (response.ok) {
            const universitiesData = await response.json()

            const transformedUniversities = universitiesData.map((uni: any) => ({
              code: uni.university_code,
              name: uni.university_name,
            }))
            setUniversities(transformedUniversities)

            if (!hasSetDefaultUniversity.current && transformedUniversities.length > 0) {
              setSelectedUniversity(transformedUniversities[0].code)
              hasSetDefaultUniversity.current = true
            }
          }
        } catch (error) {
        }

        try {
          const response = await fetch("/api/test-sessions")
          if (response.ok) {
            const sessionsData = await response.json()

            // Transform snake_case to camelCase
            const transformedSessions = Array.isArray(sessionsData)
              ? sessionsData.map((session: any) => ({
                  id: session.id,
                  description: session.description || "(名称未設定)",
                  universityCode: session.university_code,
                  testDate: session.test_date,
                  passingScore: session.passing_score ?? undefined,
                }))
              : []

            fetchedSessions = transformedSessions
            setTestSessions(transformedSessions)
          } else {
            setTestSessions([])
          }
        } catch (error) {
          setTestSessions([])
        }
      } else {
        // special_master以外でもテストセッションを取得
        try {
          const response = await fetch("/api/test-sessions")
          if (response.ok) {
            const sessionsData = await response.json()
            const transformedSessions = Array.isArray(sessionsData)
              ? sessionsData.map((session: any) => ({
                  id: session.id,
                  description: session.description || "(名称未設定)",
                  universityCode: session.university_code,
                  testDate: session.test_date,
                  passingScore: session.passing_score ?? undefined,
                }))
              : []
            fetchedSessions = transformedSessions
            setTestSessions(transformedSessions)
          }
        } catch (error) {
        }
      }

      try {
        const universityCode = isMasterAdmin ? undefined : universityCodes[0]

        const testsData = await loadTests(universityCode)
        setTests(Array.isArray(testsData) ? testsData : [])

        const testSessionId = sessionStorage.getItem("testSessionId") || ""

        let evaluationsData: any[] = []
        try {
          evaluationsData = await loadEvaluationResults(universityCode, testSessionId)
        } catch (error) {
        }

        const [studentsData, teachersData, patientsData, roomsData, attendanceData] = await Promise.all([
          loadStudents(universityCode, undefined, testSessionId),
          loadTeachers(universityCode, undefined, testSessionId),
          loadPatients(universityCode, undefined, testSessionId),
          loadRooms(universityCode, undefined, testSessionId),
          loadAttendanceRecords(universityCode, testSessionId),
        ])


        setStudents(Array.isArray(studentsData) ? studentsData : [])
        setTeachers(Array.isArray(teachersData) ? teachersData : [])
        setPatients(Array.isArray(patientsData) ? patientsData : [])
        setAttendanceRecords(Array.isArray(attendanceData) ? attendanceData : [])
        setEvaluations(Array.isArray(evaluationsData) ? evaluationsData : [])

        const roomMap = new Map<string, RoomData>()

        if (
          Array.isArray(roomsData) &&
          Array.isArray(studentsData) &&
          Array.isArray(evaluationsData) &&
          Array.isArray(attendanceData)
        ) {
          roomsData.forEach((room) => {
            const roomStudents = studentsData.filter((s) => s.roomNumber === room.roomNumber)

            const roomAttendanceRecords = attendanceData.filter((a) => a.roomNumber === room.roomNumber)

            const studentStatusMap = new Map<string, { status: string; isCompleted: boolean }>()

            roomAttendanceRecords.forEach((record) => {
              studentStatusMap.set(record.studentId, {
                status: record.status,
                isCompleted: false,
              })
            })

            const roomEvaluations = evaluationsData.filter((e) => e.roomNumber === room.roomNumber)
            roomEvaluations.forEach((evaluation) => {
              const existing = studentStatusMap.get(evaluation.studentId)
              if (existing && evaluation.isCompleted === true) {
                existing.isCompleted = true
              }
            })

            let presentCount = 0
            let absentCount = 0
            let completedCount = 0

            roomStudents.forEach((student) => {
              // attendance records use student UUID (student.id), not student_id (student number)
              const statusInfo = studentStatusMap.get(student.id)
              if (statusInfo) {
                if (statusInfo.status === "present") {
                  presentCount++
                  if (statusInfo.isCompleted) {
                    completedCount++
                  }
                } else if (statusInfo.status === "absent") {
                  absentCount++
                  // 2026-07-12 副田さん要望: 欠席は採点不要なので完了として数える
                  completedCount++
                }
              }
            })

            const studentsWithAlerts = new Set<string>()
            roomEvaluations.forEach((evaluation) => {
              if (evaluation.hasAlert === true) {
                studentsWithAlerts.add(evaluation.studentId)
              }
            })
            const alertCount = studentsWithAlerts.size

            const completedEvaluationsByStudent = new Map<string, number>()
            roomEvaluations.forEach((evaluation) => {
              if (evaluation.isCompleted === true) {
                completedEvaluationsByStudent.set(evaluation.studentId, evaluation.totalScore || 0)
              }
            })

            const totalScore = Array.from(completedEvaluationsByStudent.values()).reduce((sum, score) => sum + score, 0)
            const avgScore =
              completedEvaluationsByStudent.size > 0 ? Math.round(totalScore / completedEvaluationsByStudent.size) : 0

            // Split stats by evaluatorType (teacher/patient)
            const teacherEvals = roomEvaluations.filter((e) => e.evaluatorType === "teacher")
            const patientEvals = roomEvaluations.filter((e) => e.evaluatorType === "patient")

            const calcRoleStats = (evals: typeof roomEvaluations): RoleStats => {
              const completed = new Set<string>()
              const alerts = new Set<string>()
              const scoreMap = new Map<string, number>()
              evals.forEach((e) => {
                if (e.isCompleted) completed.add(e.studentId)
                if (e.hasAlert) alerts.add(e.studentId)
                if (e.isCompleted) scoreMap.set(e.studentId, e.totalScore || 0)
              })
              const scores = Array.from(scoreMap.values())
              const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
              return { completedCount: completed.size, alertCount: alerts.size, averageScore: avg }
            }

            const teacherStats = calcRoleStats(teacherEvals)
            const patientStats = calcRoleStats(patientEvals)

            // 2026-07-03 副田さん要望: 複数教員/患者役を全員名前で表示 (メール昇順)
            const teachersInRoom = Array.isArray(teachersData)
              ? teachersData
                  .filter((t) => t.assignedRoomNumber === room.roomNumber)
                  .sort((a, b) => {
                    // 2026-07-13: slot_index (部屋内①②…順) 優先、無ければメール順にフォールバック
                    const sa = (a as any).slotIndex, sb = (b as any).slotIndex
                    if (typeof sa === "number" && typeof sb === "number" && sa !== sb) return sa - sb
                    return ((a as any).email || "").localeCompare((b as any).email || "")
                  })
              : []
            const patientsInRoom = Array.isArray(patientsData)
              ? patientsData
                  .filter((p) => p.assignedRoomNumber === room.roomNumber)
                  .sort((a, b) => {
                    // 2026-07-13: slot_index (部屋内①②…順) 優先、無ければメール順にフォールバック
                    const sa = (a as any).slotIndex, sb = (b as any).slotIndex
                    if (typeof sa === "number" && typeof sb === "number" && sa !== sb) return sa - sb
                    return ((a as any).email || "").localeCompare((b as any).email || "")
                  })
              : []
            const teacherForRoom = teachersInRoom[0]  // 互換用 (主 = 1 名目)
            const patientForRoom = patientsInRoom[0]

            // 2026-07-10 副田さん要望: slot 別集計 (教員①/教員②/患者役)
            const teacherSlots = buildSlotStats(teachersInRoom as PersonWithEmail[], "teacher", roomEvaluations)
            const patientSlots = buildSlotStats(patientsInRoom as PersonWithEmail[], "patient", roomEvaluations)

            // Count alerts per student
            const studentAlertCountMap = new Map<string, number>()
            roomEvaluations.forEach((evaluation) => {
              if (evaluation.hasAlert === true) {
                studentAlertCountMap.set(evaluation.studentId, (studentAlertCountMap.get(evaluation.studentId) || 0) + 1)
              }
            })

            // ADR-006: % 判定で合格者数を集計
            const currentSessionId = sessionStorage.getItem("testSessionId") || ""
            const currentSession = fetchedSessions.find((s) => s.id === currentSessionId)
            const passingScoreVal = currentSession?.passingScore
            let passCount = 0
            if (passingScoreVal != null && passingScoreVal > 0) {
              const studentEvalsMap = new Map<string, EvaluationResult[]>()
              roomEvaluations.forEach((e) => {
                if (!e.isCompleted) return
                const arr = studentEvalsMap.get(e.studentId) || []
                arr.push(e)
                studentEvalsMap.set(e.studentId, arr)
              })
              studentEvalsMap.forEach((evals) => {
                const detail = computePassResult({
                  evaluations: evals.map((e) => ({
                    totalScore: e.totalScore,
                    maxScore: (e as any).maxScore,
                    isCompleted: e.isCompleted,
                  })),
                  passingScore: passingScoreVal,
                })
                if (detail.result === "合格") passCount++
              })
            }

            const studentsWithStatus = roomStudents.map((student) => {
              const statusInfo = studentStatusMap.get(student.id)
              const studentEvaluation = evaluationsData.find(
                (e) => e.studentId === student.id && e.roomNumber === room.roomNumber,
              )
              const totalScore = studentEvaluation?.totalScore || 0
              const studentEvals = roomEvaluations.filter((e) => e.studentId === student.id)
              const combinedScore = studentEvals.reduce((sum, e) => sum + (e.totalScore || 0), 0)
              // 2026-07-11 副田さん要望: 評価者ごと (教員①/教員②/患者役) の完了状況
              const completedBy = studentEvals
                .filter((e) => e.isCompleted)
                .map((e) => `${e.evaluatorType}::${((e as any).evaluatorId || "").toLowerCase()}`)
              // ADR-006: 学生個別の % 判定
              const passDetail = computePassResult({
                evaluations: studentEvals.map((e) => ({
                  totalScore: e.totalScore,
                  maxScore: (e as any).maxScore,
                  isCompleted: e.isCompleted,
                })),
                passingScore: passingScoreVal,
              })
              return {
                id: student.studentId,
                name: student.name,
                status: statusInfo?.status || "unknown",
                isCompleted: statusInfo?.isCompleted || false,
                totalScore: totalScore,
                alertCount: studentAlertCountMap.get(student.id) || 0,
                combinedScore,
                passResult: passDetail.result,
                completedBy,
              }
            })

            roomMap.set(room.roomNumber, {
              roomNumber: room.roomNumber,
              roomName: room.roomName,
              teacherName: teacherForRoom?.name || "未割当",
              patientName: patientForRoom?.name || "未割当",
              teacherNames: teachersInRoom.map((t) => t.name),
              patientNames: patientsInRoom.map((p) => p.name),
              presentCount,
              absentCount,
              completedCount,
              alertCount,
              averageScore: avgScore,
              passCount,
              teacherStats,
              patientStats,
              teacherSlots,
              patientSlots,
              students: studentsWithStatus,
              universityCode: room.universityCode,
            })
          })
        }

        const roomList = Array.from(roomMap.values()).sort((a, b) => {
          const aNum = Number.parseInt(a.roomNumber) || 0
          const bNum = Number.parseInt(b.roomNumber) || 0
          return aNum - bNum
        })

        setRooms(roomList)
        setUpdateCounter((prev) => prev + 1)
      } catch (error) {
      }
    }

    fetchData()
  }, [session, isSessionLoading, router])

  // 2026-05-07: selectedTestCode を sessionStorage に反映し、ダッシュボードを再ロードする。
  // 初回マウント時は sessionStorage と selectedTestCode が同期しているのでスキップする。
  const isInitialTestCodeRender = useRef(true)
  useEffect(() => {
    if (isInitialTestCodeRender.current) {
      isInitialTestCodeRender.current = false
      return
    }
    if (typeof window === "undefined") return
    const newSessionId = selectedTestCode === "all" ? "" : selectedTestCode
    sessionStorage.setItem("testSessionId", newSessionId)
    // 既にデータロード中ならスキップ。session が無いと handleRefresh が早期 return するので待つ。
    if (!session) return
    handleRefresh()
    // handleRefresh は依存トラッキング不要(state setter のみで session を ref する関数)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTestCode])

  // 2026-07-10 副田さん要望 (案 C ハイブリッド自動更新): handleRefresh を
  //   useCallback でラップして useAutoRefresh の deps に載せられるようにする。
  //   silent=true で auto refresh 時は「更新中...」表示を出さず、state リセット
  //   もスキップしてフリッカーを避ける。
  const handleRefreshInner = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) {
      setIsRefreshing(true)
      // 明示的な手動更新のみ空 → 再ロード の遷移を可視化する
      setRooms([])
      setStudents([])
      setTeachers([])
      setPatients([])
      setAttendanceRecords([])
      setEvaluations([])
      setTests([])
    }

    try {
      if (!session) return
      const universityCodes = session.universityCodes && session.universityCodes.length > 0
        ? session.universityCodes
        : ["dentshowa"]
      const isMasterAdmin = universityCodes.includes("ALL")
      const universityCode = isMasterAdmin ? undefined : universityCodes[0]

      const testSessionId = sessionStorage.getItem("testSessionId") || ""
      let fetchedEvaluations: EvaluationResult[] = []
      try {
        fetchedEvaluations = await loadEvaluationResults(universityCode, testSessionId)
      } catch (error) {
      }

      const [fetchedStudents, fetchedTeachers, fetchedPatients, fetchedRooms, fetchedAttendance, fetchedTests] =
        await Promise.all([
          loadStudents(universityCode, undefined, testSessionId),
          loadTeachers(universityCode, undefined, testSessionId),
          loadPatients(universityCode, undefined, testSessionId),
          loadRooms(universityCode, undefined, testSessionId),
          loadAttendanceRecords(universityCode, testSessionId),
          loadTests(universityCode),
        ])


      const roomMap = new Map<string, RoomData>()

      if (
        Array.isArray(fetchedRooms) &&
        Array.isArray(fetchedStudents) &&
        Array.isArray(fetchedEvaluations) &&
        Array.isArray(fetchedAttendance)
      ) {
        fetchedRooms.forEach((room) => {
          const roomStudents = fetchedStudents.filter((s) => s.roomNumber === room.roomNumber)

          const roomAttendanceRecords = fetchedAttendance.filter((a) => a.roomNumber === room.roomNumber)

          const studentStatusMap = new Map<string, { status: string; isCompleted: boolean }>()

          roomAttendanceRecords.forEach((record) => {
            studentStatusMap.set(record.studentId, {
              status: record.status,
              isCompleted: false,
            })
          })

          const roomEvaluations = fetchedEvaluations.filter((e) => e.roomNumber === room.roomNumber)
          roomEvaluations.forEach((evaluation) => {
            const existing = studentStatusMap.get(evaluation.studentId)
            if (existing && evaluation.isCompleted === true) {
              existing.isCompleted = true
            }
          })

          let presentCount = 0
          let absentCount = 0
          let completedCount = 0

          roomStudents.forEach((student) => {
            // attendance records use student UUID (student.id), not student_id (student number)
            const statusInfo = studentStatusMap.get(student.id)
            if (statusInfo) {
              if (statusInfo.status === "present") {
                presentCount++
                if (statusInfo.isCompleted) {
                  completedCount++
                }
              } else if (statusInfo.status === "absent") {
                absentCount++
                // 2026-07-12 副田さん要望: 欠席は採点不要なので完了として数える
                completedCount++
              }
            }
          })

          const studentsWithAlerts = new Set<string>()
          roomEvaluations.forEach((evaluation) => {
            if (evaluation.hasAlert === true) {
              studentsWithAlerts.add(evaluation.studentId)
            }
          })
          const alertCount = studentsWithAlerts.size

          const completedEvaluationsByStudent = new Map<string, number>()
          roomEvaluations.forEach((evaluation) => {
            if (evaluation.isCompleted === true) {
              completedEvaluationsByStudent.set(evaluation.studentId, evaluation.totalScore || 0)
            }
          })

          const totalScore = Array.from(completedEvaluationsByStudent.values()).reduce((sum, score) => sum + score, 0)
          const avgScore =
            completedEvaluationsByStudent.size > 0 ? Math.round(totalScore / completedEvaluationsByStudent.size) : 0

          // Split stats by evaluatorType
          const teacherEvalsP = roomEvaluations.filter((e) => e.evaluatorType === "teacher")
          const patientEvalsP = roomEvaluations.filter((e) => e.evaluatorType === "patient")

          const calcRoleStatsP = (evals: typeof roomEvaluations): RoleStats => {
            const completed = new Set<string>()
            const alerts = new Set<string>()
            const scoreMap = new Map<string, number>()
            evals.forEach((e) => {
              if (e.isCompleted) completed.add(e.studentId)
              if (e.hasAlert) alerts.add(e.studentId)
              if (e.isCompleted) scoreMap.set(e.studentId, e.totalScore || 0)
            })
            const scores = Array.from(scoreMap.values())
            const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
            return { completedCount: completed.size, alertCount: alerts.size, averageScore: avg }
          }

          const teacherStatsP = calcRoleStatsP(teacherEvalsP)
          const patientStatsP = calcRoleStatsP(patientEvalsP)

          // 2026-07-03 副田さん要望: 複数教員/患者役を全員名前で表示 (refresh path)
          const teachersInRoom = Array.isArray(fetchedTeachers)
            ? fetchedTeachers
                .filter((t) => t.assignedRoomNumber === room.roomNumber)
                .sort((a, b) => ((a as any).email || "").localeCompare((b as any).email || ""))
            : []
          const patientsInRoom = Array.isArray(fetchedPatients)
            ? fetchedPatients
                .filter((p) => p.assignedRoomNumber === room.roomNumber)
                .sort((a, b) => ((a as any).email || "").localeCompare((b as any).email || ""))
            : []
          const teacherForRoom = teachersInRoom[0]
          const patientForRoom = patientsInRoom[0]

          // 2026-07-10 副田さん要望: slot 別集計 (refresh path)
          const teacherSlotsR = buildSlotStats(teachersInRoom as PersonWithEmail[], "teacher", roomEvaluations)
          const patientSlotsR = buildSlotStats(patientsInRoom as PersonWithEmail[], "patient", roomEvaluations)

          // Count alerts per student
          const studentAlertCountMap = new Map<string, number>()
          roomEvaluations.forEach((evaluation) => {
            if (evaluation.hasAlert === true) {
              studentAlertCountMap.set(evaluation.studentId, (studentAlertCountMap.get(evaluation.studentId) || 0) + 1)
            }
          })

          // Calculate pass count
          // ADR-006: % 判定で合格者数を集計(refresh path)
          const currentSessionIdR = sessionStorage.getItem("testSessionId") || ""
          const currentSessionR = testSessions.find((s) => s.id === currentSessionIdR)
          const passingScoreValR = currentSessionR?.passingScore
          let passCountR = 0
          if (passingScoreValR != null && passingScoreValR > 0) {
            const studentEvalsMapR = new Map<string, EvaluationResult[]>()
            roomEvaluations.forEach((e) => {
              if (!e.isCompleted) return
              const arr = studentEvalsMapR.get(e.studentId) || []
              arr.push(e)
              studentEvalsMapR.set(e.studentId, arr)
            })
            studentEvalsMapR.forEach((evals) => {
              const detail = computePassResult({
                evaluations: evals.map((e) => ({
                  totalScore: e.totalScore,
                  maxScore: (e as any).maxScore,
                  isCompleted: e.isCompleted,
                })),
                passingScore: passingScoreValR,
              })
              if (detail.result === "合格") passCountR++
            })
          }

          const studentsWithStatus = roomStudents.map((student) => {
            const statusInfo = studentStatusMap.get(student.id)
            const studentEvaluation = fetchedEvaluations.find(
              (e) => e.studentId === student.id && e.roomNumber === room.roomNumber,
            )
            const totalScore = studentEvaluation?.totalScore || 0
            const studentEvalsR = roomEvaluations.filter((e) => e.studentId === student.id)
            const combinedScore = studentEvalsR.reduce((sum, e) => sum + (e.totalScore || 0), 0)
            // 2026-07-11 副田さん要望: 評価者ごと (教員①/教員②/患者役) の完了状況 (refresh path)
            const completedBy = studentEvalsR
              .filter((e) => e.isCompleted)
              .map((e) => `${e.evaluatorType}::${((e as any).evaluatorId || "").toLowerCase()}`)
            // ADR-006: 学生個別の % 判定 (refresh path)
            const passDetail = computePassResult({
              evaluations: studentEvalsR.map((e) => ({
                totalScore: e.totalScore,
                maxScore: (e as any).maxScore,
                isCompleted: e.isCompleted,
              })),
              passingScore: passingScoreValR,
            })
            return {
              id: student.studentId,
              name: student.name,
              status: statusInfo?.status || "unknown",
              isCompleted: statusInfo?.isCompleted || false,
              totalScore: totalScore,
              alertCount: studentAlertCountMap.get(student.id) || 0,
              combinedScore,
              passResult: passDetail.result,
              completedBy,
            }
          })

          roomMap.set(room.roomNumber, {
            roomNumber: room.roomNumber,
            roomName: room.roomName,
            teacherName: teacherForRoom?.name || "未割当",
            patientName: patientForRoom?.name || "未割当",
            teacherNames: teachersInRoom.map((t) => t.name),
            patientNames: patientsInRoom.map((p) => p.name),
            presentCount,
            absentCount,
            completedCount,
            alertCount,
            averageScore: avgScore,
            passCount: passCountR,
            teacherStats: teacherStatsP,
            patientStats: patientStatsP,
            teacherSlots: teacherSlotsR,
            patientSlots: patientSlotsR,
            students: studentsWithStatus,
            universityCode: room.universityCode,
          })
        })
      }

      const roomList = Array.from(roomMap.values()).sort((a, b) => {
        const aNum = Number.parseInt(a.roomNumber) || 0
        const bNum = Number.parseInt(b.roomNumber) || 0
        return aNum - bNum
      })

      setRooms(roomList)
      setUpdateCounter((prev) => prev + 1)
    } catch (error) {
    } finally {
      if (!opts.silent) setIsRefreshing(false)
    }
  }, [session])

  const handleRefresh = () => handleRefreshInner()
  const autoRefreshHandler = useCallback(() => handleRefreshInner({ silent: true }), [handleRefreshInner])
  // 案 C: visibilitychange (タブに戻った瞬間) + 30 秒間隔 polling
  useAutoRefresh(autoRefreshHandler, 30000)

  // 2026-05-07: special_master 以外のロールでは自大学に固定して絞り込む
  // (これまで非 special_master では試験セッションセレクタ自体が無かったので問題化していなかった)
  const userUniversityCode =
    session?.universityCodes && session.universityCodes.length > 0 && session.universityCodes[0] !== "ALL"
      ? session.universityCodes[0]
      : session?.universityCode || ""
  const filteredTestSessions = testSessions.filter((s) => {
    if (accountType === "special_master") {
      return !selectedUniversity || s.universityCode === selectedUniversity
    }
    return !userUniversityCode || s.universityCode === userUniversityCode
  })

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const matchesUniversity = !selectedUniversity || room.universityCode === selectedUniversity
    // 試験セッションが選択されている場合は、全部屋を表示
    // 実際のフィルタリングはevaluationsデータではなく、選択された試験セッションIDで行う
      return matchesUniversity
    })
  }, [rooms, selectedUniversity])

  const totalPresentCount = filteredRooms.reduce((sum, room) => sum + room.presentCount, 0)
  const totalCompletedCount = filteredRooms.reduce((sum, room) => sum + room.completedCount, 0)
  const totalAlertCount = filteredRooms.reduce((sum, room) => sum + room.alertCount, 0)
  const totalAbsentCount = filteredRooms.reduce((sum, room) => sum + room.absentCount, 0)
  const totalPassCount = filteredRooms.reduce((sum, room) => sum + room.passCount, 0)


  if (rooms.length > 0) {
    rooms.slice(0, 3).forEach((room) => {
    })
  }

  if (userRole === null) {
    return <div className="flex justify-center items-center min-h-screen">認証確認中...</div>
  }

  if (userRole !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">認証確認中...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-secondary/30 p-4 md:p-8">
      <div className="mx-auto ">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-[#00417A]">管理者ダッシュボード</h1>

          <div className="flex items-center gap-3">
            <Button onClick={() => router.push("/teacher/exam-info")} variant="outline" size="sm">
              試験選択画面を開く
            </Button>

            {accountType === "special_master" && (
              <Select
                value={selectedUniversity}
                onValueChange={(value) => {
                  setSelectedUniversity(value)
                  setSelectedTestCode("all")
                }}
              >
                <SelectTrigger className="h-9 w-[200px]">
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
            )}

            {/*
              2026-05-07: 試験セッションセレクタは subject_admin / university_master / general admin
              でも露出する。これまで dashboard 上で session を切り替える手段が無かった。
            */}
            <Select value={selectedTestCode} onValueChange={setSelectedTestCode}>
              <SelectTrigger className="h-9 w-[250px]">
                <SelectValue placeholder="試験セッションを選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての試験セッション</SelectItem>
                {filteredTestSessions.map((session) => (
                  <SelectItem key={session.id} value={session.id}>
                    {session.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mb-6 flex items-center gap-2 flex-wrap">
          <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline" size="sm">
            {isRefreshing ? "更新中..." : "データを更新"}
          </Button>
          {/* Phase 9 design refresh: 設定系へのリンクは AdminTopNav に集約 */}
          {/* 教員ログインから来た場合に試験画面に戻るボタン */}
          {isTeacherLogin && (
            <Button onClick={() => router.push("/teacher/exam-info")} variant="outline" size="sm" className="border-blue-500 text-blue-700">
              試験画面に戻る
            </Button>
          )}
        </div>

  {(assignedSubjectName || sessionStorage.getItem("testSessionId")) && (
  <div className="mb-4 flex gap-4">
    {assignedSubjectName && (
      <div className="px-4 py-3 rounded-lg border bg-card shadow-sm shrink-0">
        <p className="text-xs text-muted-foreground font-medium">担当教科</p>
        <p className="text-base font-bold text-foreground">{assignedSubjectName}</p>
      </div>
    )}
    {testSessions.find((s) => s.id === (typeof window !== "undefined" ? sessionStorage.getItem("testSessionId") : "")) && (
      <div className="px-4 py-3 rounded-lg border bg-card shadow-sm flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium">テスト名</p>
        <p className="text-base font-bold text-foreground truncate">
          {testSessions.find((s) => s.id === sessionStorage.getItem("testSessionId"))?.description}
        </p>
      </div>
    )}
  </div>
  )}

        {/* 2026-07-12 デザイン Phase 2-2: サマリー統計。意味色 + 等幅数字 + 左アクセント。 */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          {[
            { label: "総受験者数", value: totalPresentCount, Icon: Users, tone: "brand" },
            { label: "部屋数", value: filteredRooms.length, Icon: DoorOpen, tone: "brand" },
            // 2026-10-28 副田さん報告: 欠席者がいると「試験中」が負値(-1等)になる不具合。
            //   提出済み(totalCompletedCount)は欠席を「完了扱い」で +1 するが、総受験者数
            //   (totalPresentCount)は出席者のみ。試験中=「出席したが未提出」なので欠席分を
            //   戻し、0 未満にならないよう clamp する。
            { label: "試験中", value: Math.max(0, totalPresentCount - totalCompletedCount + totalAbsentCount), Icon: Clock, tone: "brand" },
            { label: "提出済み", value: totalCompletedCount, Icon: CheckCircle, tone: "success" },
            { label: "要注意", value: totalAlertCount, Icon: XCircle, tone: "critical" },
            { label: "合格者", value: totalPassCount, Icon: Trophy, tone: "warning" },
          ].map(({ label, value, Icon, tone }) => {
            const toneCls =
              tone === "success" ? "text-success before:bg-success"
                : tone === "critical" ? "text-critical before:bg-critical"
                : tone === "warning" ? "text-warning before:bg-warning"
                : "text-primary before:bg-primary"
            return (
              <Card
                key={label}
                className={`relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1 ${toneCls}`}
              >
                <CardContent className="p-3 pl-3.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-muted-foreground">{label}</span>
                    <Icon className={`w-3.5 h-3.5 ${toneCls.split(" ")[0]} opacity-70`} />
                  </div>
                  <div className={`text-[1.7rem] font-extrabold leading-none tnum ${toneCls.split(" ")[0]}`}>{value}</div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">部屋別進捗状況</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {filteredRooms.length === 0 ? (
              <EmptyState
                icon={DoorOpen}
                title="表示する部屋がありません"
                description="試験セッションを選択するか、部屋の割当を登録してください。"
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {filteredRooms.map((room) => (
                  <Card key={room.roomNumber} className={`transition-all cursor-pointer hover:shadow-md ${room.alertCount > 0 ? "bg-critical/[0.04] border-critical/40 ring-1 ring-critical/20 hover:bg-critical/[0.07]" : "bg-card hover:bg-accent/30 hover:border-primary/40"}`} onClick={() => setSelectedRoom(room.roomNumber)}>
                    <CardContent className="p-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between border-b pb-1.5">
                          <div>
                            <div className="font-bold text-sm text-primary">部屋 {room.roomNumber}</div>
                            {room.roomName && <div className="text-[11px] text-muted-foreground truncate">{room.roomName}</div>}
                          </div>
                          {room.alertCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-critical/10 px-1.5 py-0.5 text-[10px] font-bold text-critical">
                              <span className="h-1 w-1 rounded-full bg-current" />要注意
                            </span>
                          )}
                        </div>
                        <div className="text-xs space-y-0.5">
                          {/* 2026-07-03 副田さん要望: 教員①②/患者役 の全員名を可変表示 */}
                          {room.teacherNames.length === 0 ? (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">教員:</span>
                              <span className="font-medium truncate ml-1 text-muted-foreground">未割当</span>
                            </div>
                          ) : (
                            room.teacherNames.map((name, i) => (
                              <div key={`t-${i}`} className="flex justify-between">
                                <span className="text-muted-foreground">
                                  教員
                                  {room.teacherNames.length > 1
                                    ? ["①", "②", "③", "④", "⑤"][i] || `(${i + 1})`
                                    : ""}
                                  :
                                </span>
                                <span className="font-medium truncate ml-1">{name}</span>
                              </div>
                            ))
                          )}
                          {room.patientNames.length === 0 ? (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">患者:</span>
                              <span className="font-medium truncate ml-1 text-muted-foreground">未割当</span>
                            </div>
                          ) : (
                            room.patientNames.map((name, i) => (
                              <div key={`p-${i}`} className="flex justify-between">
                                <span className="text-muted-foreground">
                                  患者
                                  {room.patientNames.length > 1
                                    ? ["①", "②", "③"][i] || `(${i + 1})`
                                    : ""}
                                  :
                                </span>
                                <span className="font-medium truncate ml-1">{name}</span>
                              </div>
                            ))
                          )}
                          <div className="border-t pt-1.5 mt-1 space-y-0.5 tnum">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">出席:</span>
                              <span className="font-semibold text-success">{room.presentCount}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">完了:</span>
                              <span className="font-semibold">
                                <span className="text-primary">教 {room.teacherStats.completedCount}</span>
                                <span className="mx-0.5 text-muted-foreground">/</span>
                                <span className="text-primary/70">患 {room.patientStats.completedCount}</span>
                              </span>
                            </div>
                            {(room.teacherStats.alertCount > 0 || room.patientStats.alertCount > 0) && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">注意:</span>
                                <span className="font-semibold text-critical">
                                  教 {room.teacherStats.alertCount}
                                  <span className="mx-0.5 opacity-60">/</span>
                                  患 {room.patientStats.alertCount}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">合格:</span>
                              <span className="font-semibold text-warning">{room.passCount}</span>
                            </div>
                            {(room.teacherStats.averageScore > 0 || room.patientStats.averageScore > 0) && (
                              <div className="pt-1 border-t mt-1 space-y-0.5">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">平均(教):</span>
                                  <span className="font-bold text-primary">{room.teacherStats.averageScore}点</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">平均(患):</span>
                                  <span className="font-bold text-primary/70">{room.patientStats.averageScore}点</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>受験者一覧</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => {
                const params = new URLSearchParams()
                if (selectedUniversity) params.set("university", selectedUniversity)
                if (selectedTestCode && selectedTestCode !== "all") params.set("testSessionId", selectedTestCode)
                window.location.href = `/admin/students-detail?${params.toString()}`
              }}
              className="w-full"
            >
              受験者一覧を表示
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedRoom} onOpenChange={(open) => !open && setSelectedRoom(null)}>
        {/* 2026-07-16 副田さん要望: 全項目が改行されずに収まるよう横幅を拡大 (最大 72rem) */}
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[min(72rem,95vw)]">
          <DialogHeader>
            <DialogTitle>部屋 {selectedRoom} の詳細</DialogTitle>
          </DialogHeader>
          {selectedRoom && !selectedRoomData && (
            <p className="text-muted-foreground">部屋情報が見つかりません</p>
          )}
          {selectedRoomData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">部屋名</p>
                  <p className="text-base">{selectedRoomData.roomName}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">部屋番号</p>
                  <p className="text-base">{selectedRoomData.roomNumber}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">担当教員</p>
                  {selectedRoomData.teacherSlots && selectedRoomData.teacherSlots.length > 0 ? (
                    <div className="text-base space-y-0.5">
                      {selectedRoomData.teacherSlots.map((s) => (
                        <div key={`t-${s.slotIndex}`}>
                          <span className="text-xs text-muted-foreground mr-1">{s.label}</span>
                          {s.personName}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-base text-muted-foreground">未割当</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">患者担当</p>
                  {selectedRoomData.patientSlots && selectedRoomData.patientSlots.length > 0 ? (
                    <div className="text-base space-y-0.5">
                      {selectedRoomData.patientSlots.map((s) => (
                        <div key={`p-${s.slotIndex}`}>
                          <span className="text-xs text-muted-foreground mr-1">{s.label}</span>
                          {s.personName}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-base text-muted-foreground">未割当</p>
                  )}
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">進捗状況</h4>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-green-600">{selectedRoomData.presentCount}</p>
                    <p className="text-xs text-muted-foreground">出席</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">{selectedRoomData.absentCount}</p>
                    <p className="text-xs text-muted-foreground">欠席</p>
                  </div>
                </div>
                <div className="mt-4">
                  {/* 2026-07-10 副田さん要望: slot 別 (教員①/教員②/患者役) の集計を表示 */}
                  {(() => {
                    const slots = [
                      ...(selectedRoomData.teacherSlots || []),
                      ...(selectedRoomData.patientSlots || []),
                    ]
                    if (slots.length === 0) {
                      return (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          この部屋の教員/患者役の割当がありません
                        </p>
                      )
                    }
                    return (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-1 text-muted-foreground font-medium"></th>
                              {slots.map((s) => (
                                <th
                                  key={`${s.roleType}-${s.slotIndex}`}
                                  className={`text-center py-1 font-medium whitespace-nowrap ${
                                    s.roleType === "teacher" ? "text-blue-700" : "text-pink-700"
                                  }`}
                                >
                                  <div>{s.label}</div>
                                  <div className="text-xs font-normal text-muted-foreground">
                                    {s.personName || "未割当"}
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b">
                              <td className="py-1.5 text-muted-foreground">完了</td>
                              {slots.map((s) => (
                                <td
                                  key={`c-${s.roleType}-${s.slotIndex}`}
                                  className={`text-center font-bold ${
                                    s.roleType === "teacher" ? "text-blue-600" : "text-pink-600"
                                  }`}
                                >
                                  {s.completedCount}
                                </td>
                              ))}
                            </tr>
                            <tr className="border-b">
                              <td className="py-1.5 text-muted-foreground">アラート</td>
                              {slots.map((s) => (
                                <td
                                  key={`a-${s.roleType}-${s.slotIndex}`}
                                  className="text-center font-bold text-red-600"
                                >
                                  {s.alertCount}
                                </td>
                              ))}
                            </tr>
                            <tr>
                              <td className="py-1.5 text-muted-foreground">平均点</td>
                              {slots.map((s) => (
                                <td
                                  key={`s-${s.roleType}-${s.slotIndex}`}
                                  className={`text-center font-bold ${
                                    s.roleType === "teacher" ? "text-blue-700" : "text-pink-700"
                                  }`}
                                >
                                  {s.averageScore}点
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )
                  })()}
                </div>

              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">学生一覧</h4>
                {/* 2026-07-16: 各セルは折り返さず、収まらない場合のみ横スクロール */}
                <div className="space-y-2 overflow-x-auto">
                  {selectedRoomData.students && selectedRoomData.students.length > 0 ? (
                    <table className="w-full text-sm [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap [&_th]:px-2 [&_td]:px-2">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">学籍番号</th>
                          <th className="text-left py-2">氏名</th>
                          <th className="text-center py-2">出欠</th>
                          <th className="text-center py-2">合計点</th>
                          <th className="text-center py-2">アラート</th>
                          {/* 2026-07-11 副田さん要望: 完了を教員①/教員②/患者役 ごとに分割表示 */}
                          {[...(selectedRoomData.teacherSlots || []), ...(selectedRoomData.patientSlots || [])].map((slot) => (
                            <th
                              key={`hc-${slot.roleType}-${slot.slotIndex}`}
                              className={`text-center py-2 whitespace-nowrap ${slot.roleType === "teacher" ? "text-blue-700" : "text-pink-700"}`}
                            >
                              完了
                              <div className="text-[10px] font-normal">{slot.label}</div>
                            </th>
                          ))}
                          <th className="text-center py-2">合否</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* 2026-07-13 副田さん要望: 学籍番号(数値)の若い順に並べる */}
                        {selectedRoomData.students
                          .slice()
                          .sort((a, b) => {
                            const na = parseInt(a.id, 10), nb = parseInt(b.id, 10)
                            const va = Number.isNaN(na) ? null : na
                            const vb = Number.isNaN(nb) ? null : nb
                            if (va != null && vb != null && va !== vb) return va - vb
                            if (va != null && vb == null) return -1
                            if (va == null && vb != null) return 1
                            return (a.id || "").localeCompare(b.id || "")
                          })
                          .map((student) => (
                          <tr key={student.id} className={`border-b ${student.alertCount > 0 ? "bg-red-50" : ""}`}>
                            <td className={`py-2 ${student.alertCount > 0 ? "text-red-900" : ""}`}>{student.id}</td>
                            <td className={`py-2 ${student.alertCount > 0 ? "text-red-900" : ""}`}>{student.name}</td>
                            <td className="text-center py-2">
                              <span
                                className={`px-2 py-1 rounded text-xs ${
                                  student.status === "present"
                                    ? "bg-green-100 text-green-800"
                                    : student.status === "absent"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {student.status === "present"
                                  ? "出席"
                                  : student.status === "absent"
                                    ? "欠席"
                                    : "未確認"}
                              </span>
                            </td>
                            <td className={`text-center py-2 font-medium ${student.alertCount > 0 ? "text-red-900" : ""}`}>{student.totalScore}点</td>
                            <td className="text-center py-2">
                              {student.alertCount > 0 ? (
                                <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-800 font-semibold">{student.alertCount}</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            {/* 2026-07-11 副田さん要望: 教員①/教員②/患者役 ごとの完了 */}
                            {[...(selectedRoomData.teacherSlots || []), ...(selectedRoomData.patientSlots || [])].map((slot) => {
                              const done = (student.completedBy || []).includes(`${slot.roleType}::${slot.personEmail}`)
                              return (
                                <td key={`sc-${slot.roleType}-${slot.slotIndex}`} className="text-center py-2">
                                  {done ? (
                                    <span className={slot.roleType === "teacher" ? "text-blue-600" : "text-pink-600"}>✓</span>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </td>
                              )
                            })}
                            <td className="text-center py-2 font-semibold">
                              {/* ADR-006: 個別合格表示は student.passResult を直接読む(map 段階で % 判定済み) */}
                              {student.passResult === "合格" ? (
                                <span className="text-red-600">合格</span>
                              ) : student.passResult === "不合格" ? (
                                <span className="text-blue-600">不合格</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">学生データがありません</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AdminDashboard
export { AdminDashboard }
