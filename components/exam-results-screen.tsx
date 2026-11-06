"use client"

import { PAGE_WIDTH } from "@/components/page-container"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle, LogOut, Clock, Target, Users, AlertTriangle, ArrowLeft } from "lucide-react"
import { loadEvaluationResults, loadStudents, loadAttendanceRecords, loadTeachers, loadPatients } from "@/lib/data-storage"
import { useSession } from "@/lib/auth/use-session"
import { StatusPill } from "@/components/ui/status-pill"

export function ExamResultsScreen() {
  const router = useRouter()
  const [totalTime, setTotalTime] = useState("")
  const [roomNumber, setRoomNumber] = useState("")
  const [evaluatorType, setEvaluatorType] = useState<"teacher" | "patient">("teacher")
  const [studentDetails, setStudentDetails] = useState<any[]>([])
  // 2026-07-11 副田さん要望: どの役 (教員①/教員②/患者役) から見たサマリーか
  const [slotLabel, setSlotLabel] = useState<string>("")

  const [roomStats, setRoomStats] = useState({
    totalStudents: 0,
    presentCount: 0,
    absentCount: 0,
    completedCount: 0,
    alertCount: 0,
    averageScore: 0,
  })

  // Phase 9b-β2c: sessionStorage("loginInfo") parse を useSession() に置換
  const { session, isLoading: isSessionLoading } = useSession()

  useEffect(() => {
    if (isSessionLoading || !session) return

    setRoomNumber(session.assignedRoomNumber || "")
    const isTeacherRole = session.loginType === "teacher" || session.role === "teacher" || session.role === "subject_admin" || session.role === "university_admin"
    setEvaluatorType(isTeacherRole ? "teacher" : "patient")

    // examStartTime は UI 状態だが、現状どこからも書き込まれていない(dead path)。互換のため読込のみ残置
    const startTime = sessionStorage.getItem("examStartTime")
    if (startTime) {
      const elapsed = Date.now() - Number(startTime)
      const minutes = Math.floor(elapsed / 60000)
      const seconds = Math.floor((elapsed % 60000) / 1000)
      setTotalTime(`${minutes}分${seconds}秒`)
    }

    loadRoomStatistics()
  }, [session, isSessionLoading])

  const loadRoomStatistics = async () => {
    try {
      if (!session) return
      const currentRoomNumber = session.assignedRoomNumber
      const universityCode = session.universityCode || ""
      const testSessionId = sessionStorage.getItem("testSessionId") || ""

      const [students, evaluations, attendanceRecords] = await Promise.all([
        loadStudents(universityCode, undefined, testSessionId),
        loadEvaluationResults(universityCode, testSessionId),
        loadAttendanceRecords(universityCode, testSessionId),
      ])

      // 2026-07-11 副田さん要望: 自分が部屋内の何番目の役か (教員①/教員②/患者役) を判定
      const effEmail = (session.proxyEvaluatorEmail || session.email || "").toLowerCase()
      const isTeacherRole =
        session.loginType === "teacher" || session.role === "teacher" ||
        session.role === "subject_admin" || session.role === "university_admin" || session.role === "master_admin"
      try {
        const peers = isTeacherRole
          ? await loadTeachers(universityCode, undefined, testSessionId)
          : await loadPatients(universityCode, undefined, testSessionId)
        const inRoom = (Array.isArray(peers) ? peers : [])
          .filter((p: any) => p.assignedRoomNumber === currentRoomNumber)
          // 2026-07-13: slot_index (部屋内①②…順) 優先、無ければメール順にフォールバック
          .sort((a: any, b: any) => {
            const sa = a.slotIndex, sb = b.slotIndex
            if (typeof sa === "number" && typeof sb === "number" && sa !== sb) return sa - sb
            return (a.email || "").localeCompare(b.email || "")
          })
        const idx = inRoom.findIndex((p: any) => (p.email || "").toLowerCase() === effEmail)
        if (isTeacherRole) {
          const marks = ["①", "②", "③", "④"]
          setSlotLabel(idx >= 0 ? `教員${marks[idx] || idx + 1}` : "教員")
        } else {
          setSlotLabel(idx >= 1 ? `患者役${idx + 1}` : "患者役")
        }
      } catch {
        setSlotLabel(isTeacherRole ? "教員" : "患者役")
      }

      const roomStudents = students.filter((s) => s.roomNumber === currentRoomNumber)
      // loginType is "teacher" or "patient", role can be "teacher", "subject_admin", "university_admin", etc.
      const isTeacher = session.loginType === "teacher" || session.role === "teacher" || session.role === "subject_admin" || session.role === "university_admin"
      const expectedEvaluatorType = isTeacher ? "teacher" : "patient"
      // 2026-07-11 副田さん報告: 評価サマリーは「自分 (教員①/教員②/患者役)」の評価のみを
      //   集計する。代理採点時は proxyEvaluatorEmail (slot 担当者) で絞る。
      //   これをしないと同じ部屋の教員①と教員②の評価が混ざり、状態/得点が合わない。
      const effectiveEmail = (session.proxyEvaluatorEmail || session.email || "").toLowerCase()
      const roomEvaluations = evaluations.filter(
        (e) =>
          e.roomNumber === currentRoomNumber &&
          e.evaluatorType === expectedEvaluatorType &&
          (!effectiveEmail || ((e as any).evaluatorId || "").toLowerCase() === effectiveEmail),
      )
      const roomAttendance = attendanceRecords.filter((a) => a.roomNumber === currentRoomNumber)



      // Build a map keyed by studentId (UUID) to deduplicate attendance records
      const studentStatusMap = new Map<string, string>()
      roomAttendance.forEach((a) => {
        // Only use UUID-format student IDs, or overwrite with latest
        studentStatusMap.set(a.studentId, a.status)
      })

      // Count attendance by matching against actual students in the room
      let presentCount = 0
      let absentCount = 0
      roomStudents.forEach((student) => {
        const status = studentStatusMap.get(student.id)
        if (status === "present") presentCount++
        else if (status === "absent") absentCount++
      })

      // Build evaluation map keyed by student UUID to deduplicate and get latest
      const evaluationMap = new Map<string, typeof roomEvaluations[0]>()
      roomEvaluations.forEach((e) => {
        const existing = evaluationMap.get(e.studentId)
        // Keep the most recent or the completed one
        if (!existing || e.isCompleted || (!existing.isCompleted && (e.updatedAt || "") >= (existing.updatedAt || ""))) {
          evaluationMap.set(e.studentId, e)
        }
      })

      // 完了/アラートの集計。
      // 2026-07-12 副田さん要望: 欠席の学生は採点不要なので「完了」として数える。
      //   平均点は採点がある (出席かつ評価完了) 学生のみで計算する。
      let completedCount = 0
      let scoredCount = 0
      let alertCount = 0
      let totalScore = 0
      roomStudents.forEach((student) => {
        const attendance = studentStatusMap.get(student.id)
        if (attendance === "absent") {
          completedCount++ // 欠席は完了扱い
          return
        }
        if (attendance !== "present") return
        const evaluation = evaluationMap.get(student.id)
        if (evaluation?.isCompleted) {
          completedCount++
          scoredCount++
          totalScore += evaluation.totalScore || 0
        }
        if (evaluation?.hasAlert) alertCount++
      })
      const avgScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0

      setRoomStats({
        totalStudents: roomStudents.length,
        presentCount,
        absentCount,
        completedCount,
        alertCount,
        averageScore: avgScore,
      })

      // Count alerts per student
      const studentAlertCountMap = new Map<string, number>()
      roomEvaluations.forEach((evaluation) => {
        if (evaluation.hasAlert === true) {
          studentAlertCountMap.set(evaluation.studentId, (studentAlertCountMap.get(evaluation.studentId) || 0) + 1)
        }
      })

      const details = roomStudents.map((student) => {
        const status = studentStatusMap.get(student.id)
        const evaluation = evaluationMap.get(student.id)
        const isPresent = status === "present"
        const isAbsent = status === "absent"
        return {
          name: student.name,
          studentId: student.studentId,
          attendanceNumber: student.attendanceNumber || "",
          status: status || "未記録",
          // 2026-07-12 副田さん要望: 欠席は採点不要なので「完了」扱い。出席は評価完了で完了。
          isCompleted: isAbsent ? true : (isPresent ? (evaluation?.isCompleted || false) : false),
          // 得点は出席で採点済みのときのみ。欠席は 0(状態は完了だが点数はなし)。
          score: isPresent ? (evaluation?.totalScore || 0) : 0,
          alertCount: studentAlertCountMap.get(student.id) || 0,
        }
      })
      // 2026-11-05 副田さん要望: 出席番号順(数値優先、空欄は末尾)に並べる
      details.sort((a, b) => {
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
      setStudentDetails(details)
    } catch (error) {
    }
  }

  const handleBackToExam = () => {
    router.back()
  }

  const handleExit = () => {
    sessionStorage.clear()
    router.push("/")
  }

  return (
    <div className="min-h-screen bg-secondary/30 p-4 md:p-8">
      {/* 2026-11-06 デザイン見直し: 結果一覧は list(1,280px) */}
      <div className={`mx-auto space-y-6 ${PAGE_WIDTH.list}`}>
        <div className="flex items-center justify-between">
          <Button onClick={handleBackToExam} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            マークシートに戻る
          </Button>
          <h1 className="text-2xl font-bold">評価サマリー</h1>
          <div className="w-32" />
        </div>

        <Card>
          <CardHeader className="text-center space-y-4 pb-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-3xl">評価サマリー</CardTitle>
            <p className="text-muted-foreground">
              部屋{roomNumber}の評価結果
              <span className={`ml-2 inline-block px-2 py-0.5 rounded text-xs font-medium ${
                evaluatorType === "patient" ? "bg-patient/10 text-patient" : "bg-primary/10 text-primary"
              }`}>
                {/* 2026-07-11 副田さん要望: 教員①/教員②/患者役 のどの視点かを明示 */}
                {slotLabel || (evaluatorType === "patient" ? "患者役" : "教員")}の評価
              </span>
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="flex items-start gap-3 p-4 bg-accent/50 rounded-lg">
                <Users className="w-5 h-5 text-primary mt-1" />
                <div>
                  <div className="text-sm text-muted-foreground">総学生数</div>
                  <div className="text-2xl font-bold">{roomStats.totalStudents}人</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600 mt-1" />
                <div>
                  <div className="text-sm text-muted-foreground">出席</div>
                  <div className="text-2xl font-bold text-green-600">{roomStats.presentCount}人</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-orange-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-orange-600 mt-1" />
                <div>
                  <div className="text-sm text-muted-foreground">欠席</div>
                  <div className="text-2xl font-bold text-orange-600">{roomStats.absentCount}人</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600 mt-1" />
                <div>
                  <div className="text-sm text-muted-foreground">完了</div>
                  <div className="text-2xl font-bold text-blue-600">{roomStats.completedCount}人</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-accent/50 rounded-lg">
                <Target className="w-5 h-5 text-primary mt-1" />
                <div>
                  <div className="text-sm text-muted-foreground">平均点</div>
                  <div className="text-2xl font-bold">{roomStats.averageScore}点</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-accent/50 rounded-lg">
                <Clock className="w-5 h-5 text-primary mt-1" />
                <div>
                  <div className="text-sm text-muted-foreground">解答時間</div>
                  <div className="text-xl font-bold">{totalTime}</div>
                </div>
              </div>
            </div>

            {studentDetails.length > 0 && (
              <div className="pt-4 border-t">
                <h3 className="font-semibold mb-3">詳細（学生リスト）</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-3 text-sm font-medium">学籍番号</th>
                        <th className="text-left p-3 text-sm font-medium">出席番号</th>
                        <th className="text-left p-3 text-sm font-medium">氏名</th>
                        <th className="text-center p-3 text-sm font-medium">出欠</th>
                        <th className="text-center p-3 text-sm font-medium">状態</th>
                        <th className="text-right p-3 text-sm font-medium">得点</th>
                        <th className="text-center p-3 text-sm font-medium">アラート</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentDetails.map((student, index) => (
                        <tr key={index} className={`border-t ${student.alertCount > 0 ? "bg-red-50" : ""}`}>
                          <td className={`p-3 text-sm ${student.alertCount > 0 ? "text-red-900" : ""}`}>{student.studentId}</td>
                          <td className={`p-3 text-sm ${student.alertCount > 0 ? "text-red-900" : ""}`}>{student.attendanceNumber || "-"}</td>
                          <td className={`p-3 text-sm ${student.alertCount > 0 ? "text-red-900" : ""}`}>{student.name}</td>
                          <td className="p-3 text-sm text-center">
                            {/* 2026-07-12 デザイン Phase 1: 共通 StatusPill に統一 */}
                            <StatusPill
                              kind={student.status === "present" ? "present" : student.status === "absent" ? "absent" : "pending"}
                            >
                              {student.status === "present" ? "出席" : student.status === "absent" ? "欠席" : "未記録"}
                            </StatusPill>
                          </td>
                          <td className="p-3 text-sm text-center">
                            <StatusPill kind={student.isCompleted ? "complete" : "incomplete"} />
                          </td>
                          <td className={`p-3 text-sm text-right font-medium tnum ${student.alertCount > 0 ? "text-red-900" : ""}`}>{student.score}点</td>
                          <td className="p-3 text-sm text-center">
                            {student.alertCount > 0 ? (
                              <span className="inline-block px-2 py-1 rounded text-xs bg-red-100 text-red-800 font-semibold">{student.alertCount}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
              <Button onClick={handleBackToExam} variant="outline" className="flex-1 bg-transparent" size="lg">
                <ArrowLeft className="w-4 h-4 mr-2" />
                マークシートに戻る
              </Button>
              <Button onClick={handleExit} className="flex-1" size="lg">
                <LogOut className="w-4 h-4 mr-2" />
                退出する
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
