"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  type Student,
  type AttendanceRecord,
  type EvaluationResult,
  type Test,
  type Question,
  loadTests,
  loadStudents,
  loadRooms,
  loadAttendanceRecords,
  loadEvaluationResults,
  saveEvaluationResults,
  MAX_COMMENT_LENGTH,
  OVERALL_COMMENT_KEY,
} from "@/lib/data-storage"
import { useSession } from "@/lib/auth/use-session"
import { ExamSessionBanner } from "@/components/exam-session-banner"
import {
  calculateScore,
  countAnswered,
  getTestSessionId,
  flattenTestQuestions,
  buildEvaluationMaps,
  computeHasAlert,
  mergeAnswersAndComments,
  missingRequiredComments,
} from "@/lib/exam/utils"
import { useElapsedTimer, useGroupedQuestions } from "@/lib/exam/hooks"
import { ExamQuestionsRenderer } from "@/components/exam-questions-renderer"
import { ExamQuestionsWizard, type WizardQuestion } from "@/components/exam-questions-wizard"
import { ExamActionBar } from "@/components/exam-action-bar"

interface PatientExamTabsProps {
  patientEmail: string
  patientRoomNumber: string
  testId: string
}

interface Answer {
  [key: number]: number
}

interface QuestionWithMeta extends Question {
  // Use the declared Question type instead of any
  sheetTitle: string
  categoryTitle: string
  categoryNumber: number
  displayNumber: number
}

export default function PatientExamTabs({
  patientEmail,
  patientRoomNumber,
  testId,
}: PatientExamTabsProps) {
  const router = useRouter()
  const [selectedTest, setSelectedTest] = useState<Test | null>(null)
  const [tests, setTests] = useState<Test[]>([])
  const [assignedStudents, setAssignedStudents] = useState<Student[]>([])
  const [activeStudentIndex, setActiveStudentIndex] = useState(0)
  // 2026-07-03: compositeKey (`${categoryNumber}-${questionNumber}`) ベースに変更
  const [studentAnswers, setStudentAnswers] = useState<Record<string, Record<string, number>>>({})
  // 2026-07-24 熊木先生要望: コメント (学生 → compositeKey / OVERALL_COMMENT_KEY → 本文)
  const [studentComments, setStudentComments] = useState<Record<string, Record<string, string>>>({})
  // 2026-07-24 熊木先生要望 Phase 2: SP 入力の表示形式。既定は「1問ずつ」(誤タップ防止)。
  //   端末ごとに localStorage で記憶。一覧に切り替えることも可能。
  const [viewMode, setViewMode] = useState<"wizard" | "list">("wizard")
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("spExamViewMode") : null
    if (saved === "list" || saved === "wizard") setViewMode(saved)
  }, [])
  const changeViewMode = (m: "wizard" | "list") => {
    setViewMode(m)
    try {
      localStorage.setItem("spExamViewMode", m)
    } catch {
      /* localStorage 不可でも無視 */
    }
  }
  const [attendanceStatus, setAttendanceStatus] = useState<Record<string, "present" | "absent" | "pending">>({})
  const [completionStatus, setCompletionStatus] = useState<Record<string, boolean>>({})
  const [questions, setQuestions] = useState<QuestionWithMeta[]>([])
  const [alertTriggers, setAlertTriggers] = useState<Record<string, boolean>>({})
  const [patientName, setPatientName] = useState<string>("")

  // Phase 9b-β2b: sessionStorage("loginInfo") parse を useSession() に置換
  const { session, isLoading: isSessionLoading } = useSession()

  // 2026-05-08 ADR-001 §1.2 F4 Phase A.1: 経過時間タイマーを共通フックに
  const elapsedTime = useElapsedTimer()

  useEffect(() => {
    if (isSessionLoading || !session) return
    const fetchData = async () => {
      try {
        const universityCode = session.universityCode || ""
        const testSessionId = getTestSessionId()
        const [testsData, roomsData, attendanceData, resultsData] = await Promise.all([
          loadTests(),
          loadRooms(universityCode, undefined, testSessionId),
          loadAttendanceRecords(universityCode, testSessionId),
          loadEvaluationResults(universityCode, testSessionId),
        ])

        if (!Array.isArray(testsData)) {
          router.push("/patient/exam-info")
          return
        }

        const test = testsData.find((t) => t.id === testId)
        if (!test) {
          router.push("/patient/exam-info")
          return
        }

        if (!test.sheets || !Array.isArray(test.sheets)) {
          router.push("/patient/exam-info")
          return
        }

        setSelectedTest(test)
        setTests(testsData)

        // 2026-05-08 ADR-001 §1.2 F4 Phase A.2: flatten ループを共通 utility に
        const flatQuestions = flattenTestQuestions(test, { addDisplayNumber: true })
        setQuestions(flatQuestions as unknown as QuestionWithMeta[])

        let students: any[] = []
        try {
          // loadStudentsの引数はuniversityCode, subjectCodeなので、部屋番号では渡さない
          // 全学生を取得した後、部屋番号でフィルタする
          const loadedStudents = await loadStudents(universityCode, undefined, testSessionId)

          if (!Array.isArray(loadedStudents)) {
            students = []
          } else {
            // 部屋番号でフィルタ
            students = loadedStudents.filter((s) => s.roomNumber === patientRoomNumber)
          }
        } catch (error) {
          students = []
        }

        setAssignedStudents(students)

        if (students.length === 0) {
          setAttendanceStatus({})
          setStudentAnswers({})
          setCompletionStatus({})
          setAlertTriggers({})
          return
        }

        const validAttendanceData = Array.isArray(attendanceData) ? attendanceData : []
        const validResultsData = Array.isArray(resultsData) ? resultsData : []

        // 出席は別データソースなので個別に組み立て
        const initialAttendance: Record<string, "present" | "absent" | "pending"> = {}
        for (const student of students) {
          if (!student?.id) continue
          const attendanceRecord = validAttendanceData.find((r) => r.studentId === student.id)
          initialAttendance[student.id] = attendanceRecord?.status || "pending"
        }

        // 2026-05-08 ADR-001 §1.2 F4 Phase A.3: 評価マップ組み立てを共通 utility に
        // 2026-07-11 副田さん報告: 保存時と同じ evaluatorEmail (patientEmail = 代理時は
        //   slot 担当者) で絞り、複数患者役 / 管理者代理でも評価が混ざらないようにする。
        const maps = buildEvaluationMaps(validResultsData, {
          evaluatorType: "patient",
          evaluatorEmail: patientEmail,
        })

        setAttendanceStatus(initialAttendance)
        setStudentAnswers(maps.answers)
        setStudentComments(maps.comments)
        setCompletionStatus(maps.completion)
        setAlertTriggers(maps.alerts)
      } catch (error) {
        router.push("/patient/exam-info")
      }
    }

    fetchData()

    // 教員側の出席変更をポーリングで反映（10秒ごと）
    const pollAttendance = setInterval(async () => {
      try {
        const attendanceData = await loadAttendanceRecords((session?.universityCode || ""), getTestSessionId())
        if (Array.isArray(attendanceData)) {
          setAttendanceStatus((prev) => {
            const updated = { ...prev }
            for (const record of attendanceData) {
              if (record.studentId && record.status) {
                updated[record.studentId] = record.status
              }
            }
            return updated
          })
        }
      } catch (e) {
        // ポーリングエラーは無視
      }
    }, 10000)

    return () => clearInterval(pollAttendance)
  }, [testId, patientRoomNumber, patientEmail, router])

  const handleAnswerChange = async (compositeKey: string, value: number | null) => {
    const student = assignedStudents[activeStudentIndex]
    if (!student) return

    const previousAnswers = studentAnswers
    // 2026-07-03 副田さん要望: value=null は選択解除
    const nextForStudent = { ...(studentAnswers[student.id] || {}) }
    if (value === null) {
      delete nextForStudent[compositeKey]
    } else {
      nextForStudent[compositeKey] = value
    }
    const updatedAnswers = nextForStudent

    setStudentAnswers((prev) => ({
      ...prev,
      [student.id]: updatedAnswers,
    }))

    await persistAnswer(student.id, updatedAnswers, studentComments[student.id], previousAnswers)
  }

  // 2026-07-24: コメント変更 (compositeKey または OVERALL_COMMENT_KEY)。
  //   採点とコメントを 1 つの evaluations に統合して保存する。
  const handleCommentChange = async (commentKey: string, value: string) => {
    const student = assignedStudents[activeStudentIndex]
    if (!student) return
    const previousComments = studentComments
    const nextForStudent = { ...(studentComments[student.id] || {}), [commentKey]: value }
    setStudentComments((prev) => ({ ...prev, [student.id]: nextForStudent }))
    await persistAnswer(student.id, studentAnswers[student.id] || {}, nextForStudent, undefined, previousComments)
  }

  // 採点 + コメントをまとめて保存する共通処理
  const persistAnswer = async (
    studentId: string,
    scores: Record<string, number>,
    comments: Record<string, string> | undefined,
    rollbackAnswers?: Record<string, Record<string, number>>,
    rollbackComments?: Record<string, Record<string, string>>,
  ) => {
    const merged = mergeAnswersAndComments(scores, comments)
    const totalScore = calculateScore(scores)
    const hasAlert = computeHasAlert(scores, questions)

    const evaluationResult: EvaluationResult = {
      studentId,
      evaluatorId: patientEmail,
      evaluatorType: "patient",
      roomNumber: patientRoomNumber,
      answers: merged as Record<string, number>,
      totalScore,
      answeredCount: countAnswered(scores),
      isCompleted: completionStatus[studentId] || false,
      hasAlert,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      universityCode: (session?.universityCode || ""),
      testSessionId: getTestSessionId(),
    }

    try {
      await saveEvaluationResults([evaluationResult])
    } catch (error) {
      if (rollbackAnswers) setStudentAnswers(rollbackAnswers)
      if (rollbackComments) setStudentComments(rollbackComments)
      const msg = error instanceof Error ? error.message : String(error)
      console.error("[patient-exam-tabs] saveEvaluationResults (answer) failed:", msg)
      alert(`回答の保存に失敗しました。再度お試しください。\n${msg}`)
    }
  }

  const handleMarkComplete = async (studentId: string) => {
    const student = assignedStudents.find((s) => s.id === studentId)
    if (!student) return

    const studentAnswersData = studentAnswers[studentId] || {}
    const studentCommentsData = studentComments[studentId] || {}
    const answeredCount = countAnswered(studentAnswersData)

    if (answeredCount !== questions.length) {
      alert(`全ての設問に回答してください。(${answeredCount}/${questions.length}問回答済み)`)
      return
    }

    // 2026-07-24: コメント必須(配点が閾値以下)なのに未入力の設問があれば完了させない
    const missing = missingRequiredComments(questions, studentAnswersData, studentCommentsData)
    if (missing.length > 0) {
      alert(`低評価の設問にはコメントの入力が必要です。(未入力: ${missing.length}件)`)
      return
    }

    const previousCompletion = completionStatus[studentId] || false
    setCompletionStatus((prev) => ({
      ...prev,
      [studentId]: true,
    }))

    const totalScore = calculateScoreFor(studentId)
    // 2026-05-13: 完了時にも全 answers から hasAlert を再計算
    const hasAlert = computeHasAlert(studentAnswersData, questions)

    const evaluationResult: EvaluationResult = {
      studentId: student.id,
      evaluatorId: patientEmail,
      evaluatorType: "patient",
      roomNumber: patientRoomNumber,
      answers: mergeAnswersAndComments(studentAnswersData, studentCommentsData) as Record<string, number>,
      totalScore,
      answeredCount,
      isCompleted: true,
      hasAlert,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      universityCode: (session?.universityCode || ""),
      testSessionId: getTestSessionId(),
    }

    try {
      await saveEvaluationResults([evaluationResult])
    } catch (error) {
      // 完了状態が DB に保存されていないなら UI も巻き戻す(silent fail 防止)
      setCompletionStatus((prev) => ({ ...prev, [studentId]: previousCompletion }))
      const msg = error instanceof Error ? error.message : String(error)
      console.error("[patient-exam-tabs] saveEvaluationResults (complete) failed:", msg)
      alert(`完了状態の保存に失敗しました。再度お試しください。\n${msg}`)
    }
  }

  // 2026-05-08 ADR-001 §1.2 F4 Phase A.1: 共通 utility に集約
  const calculateScoreFor = (studentId: string) => calculateScore(studentAnswers[studentId])

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }

  const answeredCount = countAnswered(studentAnswers[assignedStudents[activeStudentIndex]?.id || ""])
  const totalScore = calculateScoreFor(assignedStudents[activeStudentIndex]?.id || "")
  const activeStudent = assignedStudents[activeStudentIndex]

  // 2026-07-25 副田さん要望: 下部アクションバー用の完了状況(欠席は完了扱い)
  const isStudentDone = (id: string): boolean =>
    (completionStatus[id] || false) || attendanceStatus[id] === "absent"
  const doneCount = assignedStudents.filter((s) => isStudentDone(s.id)).length
  const allStudentsCompleted = assignedStudents.length > 0 && assignedStudents.every((s) => isStudentDone(s.id))
  const currentDone = activeStudent ? isStudentDone(activeStudent.id) : false
  const canCompleteCurrent = !!activeStudent &&
    attendanceStatus[activeStudent.id] === "present" &&
    answeredCount === questions.length &&
    missingRequiredComments(questions, studentAnswers[activeStudent.id] || {}, studentComments[activeStudent.id] || {}).length === 0

  // 2026-05-08 ADR-001 §1.2 F4 Phase A.1: グループ化を共通フックに
  const groupedQuestions = useGroupedQuestions(questions)

  // Phase 9b-β2f1: sessionStorage("loginInfo") を session.userName に置換
  useEffect(() => {
    if (session?.userName) {
      setPatientName(session.userName)
    }
  }, [session])

  const handleEnableEdit = (studentId: string) => {
    setCompletionStatus((prev) => ({
      ...prev,
      [studentId]: false,
    }))
  }

  return (
    // 2026-07-25: 下部固定アクションバーぶんの余白 (pb-28) を確保
    <div className="space-y-4 pb-28">
      <ExamSessionBanner
        testSessionId={typeof window !== "undefined" ? sessionStorage.getItem("testSessionId") || "" : ""}
        roomNumber={patientRoomNumber}
        subjectCode={selectedTest?.subjectCode}
        universityCode={session?.universityCode}
        elapsedSeconds={elapsedTime}
      />
      <div className="container mx-auto px-4 space-y-4">
      <header className="py-0 px-2 bg-background border-b">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="text-sm">
              <span className="font-medium">部屋番号:</span> {patientRoomNumber}
            </div>
            <div className="text-sm">
              <span className="font-medium">担当患者:</span> {patientName}
            </div>
            <div className="text-sm">
              <span className="font-medium">時間:</span> {formatTime(elapsedTime)}
            </div>
            {activeStudent && (
              <>
                <div className="text-sm">
                  <span className="font-medium">進捗:</span>{" "}
                  {countAnswered(studentAnswers[activeStudent.id])}/{questions.length}
                </div>
                <div className="text-sm">
                  <span className="font-medium">合計点:</span> {calculateScoreFor(activeStudent.id)}点
                </div>
              </>
            )}
          </div>
          {/* 2026-07-25: 「評価完了」は画面下部の固定アクションバーに移動 */}
        </div>
      </header>

      <div className="border-b pb-1.5 pt-2 px-2">
        <div className="text-xs font-semibold mb-1.5 text-muted-foreground">医学生選択 - 評価する医学生を選択してください</div>
        <div className="flex gap-2 overflow-x-auto pb-1.5">
          {assignedStudents.map((student, index) => {
            const attendance = attendanceStatus[student.id] || null
            const isStudentCompleted = completionStatus[student.id] || false
            // 2026-07-12 副田さん要望: 欠席は採点不要なので「完了」として表示
            const displayCompleted = isStudentCompleted || attendance === "absent"
            const studentScore = calculateScoreFor(student.id)
            const studentAnsweredCount = Object.keys(studentAnswers[student.id] || {}).length

            return (
              <div
                key={student.id}
                onClick={() => setActiveStudentIndex(index)}
                className={`flex-shrink-0 w-44 p-2 rounded-lg border-2 cursor-pointer transition-colors ${
                  activeStudentIndex === index
                    ? "border-primary bg-primary/5"
                    : "border-gray-200 hover:border-primary/50"
                }`}
              >
                <div className="font-medium text-sm mb-2 text-center truncate">{student.name}</div>

                <div className="flex gap-1 mb-2">
                  <div
                    className={`flex-1 h-7 flex items-center justify-center rounded-md text-xs font-medium ${
                      attendance === "present"
                        ? "bg-primary text-primary-foreground"
                        : attendance === "absent"
                          ? "bg-red-500 text-white"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {attendance === "present" ? "出席" : attendance === "absent" ? "欠席" : "未確認"}
                  </div>
                  <div
                    className={`flex-1 h-7 flex items-center justify-center rounded-md text-xs font-medium ${
                      displayCompleted ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    完了
                  </div>
                </div>

                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>得点: {studentScore}点</span>
                  <span>
                    進捗: {studentAnsweredCount}/{questions.length}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 className="text-base font-semibold">{activeStudent?.name}の評価</h2>
          <span className="text-xs text-muted-foreground">
            {activeStudent?.studentId}・{answeredCount}/{questions.length}回答済み
          </span>
          <span className="text-xs text-muted-foreground">テスト: {selectedTest?.title || "評価シート"}</span>
        </div>

        {attendanceStatus[activeStudent?.id || ""] !== "present" && (
          <div className="text-center py-8 text-muted-foreground">教員による出席確認を待っています...</div>
        )}

        {attendanceStatus[activeStudent?.id || ""] === "present" && (
          <>
            {/* 2026-07-24 熊木先生要望 Phase 2: 表示形式の切替 (1問ずつ / 一覧) */}
            <div className="flex justify-end px-4">
              <div className="inline-flex rounded-lg border border-input bg-card p-0.5 text-sm">
                <button
                  type="button"
                  onClick={() => changeViewMode("wizard")}
                  className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                    viewMode === "wizard" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  1問ずつ
                </button>
                <button
                  type="button"
                  onClick={() => changeViewMode("list")}
                  className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                    viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  一覧
                </button>
              </div>
            </div>

            {viewMode === "wizard" ? (
              // 2026-07-24 熊木先生要望 Phase 2: SP 向け「1問ずつ」ガイド入力
              <ExamQuestionsWizard
                key={activeStudent.id}
                questions={questions as unknown as WizardQuestion[]}
                answers={studentAnswers[activeStudent.id] || {}}
                comments={studentComments[activeStudent.id] || {}}
                onAnswer={handleAnswerChange}
                onComment={handleCommentChange}
                overallKey={OVERALL_COMMENT_KEY}
                commentMaxLength={MAX_COMMENT_LENGTH}
                inputDisabled={completionStatus[activeStudent.id] || false}
                attendancePresent={attendanceStatus[activeStudent.id] === "present"}
                isCompleted={completionStatus[activeStudent.id] || false}
                onComplete={() => handleMarkComplete(activeStudent.id)}
                onEdit={() => handleEnableEdit(activeStudent.id)}
                hideCompletion
              />
            ) : (
              <>
                {/* 一覧表示(従来) */}
                <ExamQuestionsRenderer
                  groupedQuestions={groupedQuestions}
                  answers={studentAnswers[activeStudent.id] || {}}
                  inputDisabled={completionStatus[activeStudent.id] || false}
                  attendancePresent={attendanceStatus[activeStudent.id] === "present"}
                  onAnswer={handleAnswerChange}
                  comments={studentComments[activeStudent.id] || {}}
                  onComment={handleCommentChange}
                  commentMaxLength={MAX_COMMENT_LENGTH}
                />

                {/* 2026-07-24 熊木先生要望: 総評コメント(評価全体で 1 つ) */}
                <div className="px-4 pt-2">
                  <label className="text-sm font-semibold text-foreground/80">総評コメント（任意）</label>
                  <textarea
                    value={(studentComments[activeStudent.id] || {})[OVERALL_COMMENT_KEY] || ""}
                    onChange={(e) => handleCommentChange(OVERALL_COMMENT_KEY, e.target.value.slice(0, MAX_COMMENT_LENGTH))}
                    disabled={completionStatus[activeStudent.id] || attendanceStatus[activeStudent.id] !== "present"}
                    rows={2}
                    maxLength={MAX_COMMENT_LENGTH}
                    placeholder="全体を通してのコメントを入力（任意・教員内部の記録）"
                    className="mt-1 w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <div className="mt-0.5 text-right text-[10px] text-muted-foreground tnum">
                    {((studentComments[activeStudent.id] || {})[OVERALL_COMMENT_KEY] || "").length} / {MAX_COMMENT_LENGTH}
                  </div>
                </div>

                {/* 2026-07-25: 入力完了/次の学生へ/評価完了 は画面下部の固定アクションバーへ集約 */}
              </>
            )}
          </>
        )}
      </div>

      {/* 2026-07-25 副田さん要望: タブレット向け 下部固定アクションバー(全モード共通) */}
      {activeStudent && (
        <ExamActionBar
          completedCount={doneCount}
          totalStudents={assignedStudents.length}
          allCompleted={allStudentsCompleted}
          currentDone={currentDone}
          canCompleteCurrent={canCompleteCurrent}
          hasNextStudent={activeStudentIndex < assignedStudents.length - 1}
          onCompleteCurrent={() => handleMarkComplete(activeStudent.id)}
          onEditCurrent={() => handleEnableEdit(activeStudent.id)}
          onNextStudent={() => setActiveStudentIndex((i) => Math.min(i + 1, assignedStudents.length - 1))}
          onFinish={() => router.push("/patient/results")}
        />
      )}
    </div>
    </div>
  )
}
