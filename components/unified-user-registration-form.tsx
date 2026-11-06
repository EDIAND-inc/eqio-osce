"use client"

/**
 * Phase 9d-4a: 単一ユーザー登録の統合フォーム。
 *
 * ADR-001 §7-2(b) で確定した B-modified 案を実装:
 *   - 役割ドロップダウン: 一般教員 / 教科責任者 / 患者役
 *   - 共通フィールド + 役割によって動的に表示変化
 *   - 送信先は role に応じて /api/admin/register-{teachers,patients}
 *   - bulk CSV 取込は引き続き /admin/register-{teachers,patients} の従来 form で
 *     (本フォームは「1 件追加」用途)
 */

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UserPlus } from "lucide-react"
import { PageContainer } from "@/components/page-container"
import { BackLink } from "@/components/back-link"
import { useSession } from "@/lib/auth/use-session"
import { listSubjects } from "@/lib/api/subjects"
import { listRooms } from "@/lib/api/rooms"
import type { Subject, Room } from "@/lib/types"

type RoleChoice = "teacher_general" | "teacher_subject_admin" | "teacher_university_admin" | "patient"

const ROLE_LABELS: Record<RoleChoice, string> = {
  teacher_general: "一般教員",
  teacher_subject_admin: "教科責任者",
  teacher_university_admin: "大学管理者(大学責任者)",
  patient: "患者役",
}

export function UnifiedUserRegistrationForm() {
  const router = useRouter()
  const { session, isLoading: isSessionLoading } = useSession()

  const [roleChoice, setRoleChoice] = useState<RoleChoice>("teacher_general")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [universityCode, setUniversityCode] = useState("")
  const [subjectCode, setSubjectCode] = useState("")
  const [roomNumber, setRoomNumber] = useState("")

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [universities, setUniversities] = useState<Array<{ code: string; name: string }>>([])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const isSpecialMaster = session?.accountType === "special_master"
  // ADR-005 F3: 大学管理者(university_admin)を作成できるのは special_master と university_master のみ。
  // teachers.role の昇格は teachers-list の編集ダイアログでも可能だが、新規作成時に直接 UI で
  // 選べるほうが運用上自然なので本フォームに追加する。
  const canCreateUniversityAdmin =
    session?.accountType === "special_master" || session?.accountType === "university_master"
  const isPatient = roleChoice === "patient"
  const isSubjectAdmin = roleChoice === "teacher_subject_admin"
  const isUniversityAdmin = roleChoice === "teacher_university_admin"
  const isTeacher = !isPatient

  // Load reference data (subjects/rooms/universities) once session arrives
  useEffect(() => {
    if (isSessionLoading || !session) return
    const fixedUniversityCode = session.universityCode

    const loadRefData = async () => {
      try {
        const [subjectsData, roomsData] = await Promise.all([
          listSubjects(isSpecialMaster ? {} : { universityCode: fixedUniversityCode }),
          listRooms(isSpecialMaster ? {} : { universityCode: fixedUniversityCode }),
        ])
        setSubjects(subjectsData)
        setRooms(roomsData)

        if (isSpecialMaster) {
          const res = await fetch("/api/universities", { credentials: "same-origin" })
          if (res.ok) {
            const data = await res.json()
            const list: Array<{ code: string; name: string }> = (data || []).map((u: { university_code: string; university_name: string }) => ({
              code: u.university_code,
              name: u.university_name,
            }))
            setUniversities(list)
            if (list.length > 0) setUniversityCode(list[0].code)
          }
        } else {
          setUniversityCode(fixedUniversityCode)
        }
      } catch (err) {
        console.error("[unified-user-form] loadRefData error:", err)
      }
    }
    loadRefData()
  }, [session, isSessionLoading, isSpecialMaster])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (!name || !email || !password) {
      setError("氏名・メール・パスワードは必須です")
      return
    }
    if (!universityCode) {
      setError("大学を選択してください")
      return
    }
    if (isSubjectAdmin && !subjectCode) {
      setError("教科責任者の場合は担当教科を選択してください")
      return
    }
    // ADR-005 F3: 大学管理者は大学全体を担当するため担当部屋は任意。それ以外の役割では必須。
    if (isTeacher && !isUniversityAdmin && !roomNumber) {
      setError("担当部屋を選択してください")
      return
    }
    if (isPatient && !roomNumber) {
      setError("担当部屋を選択してください")
      return
    }

    setIsSubmitting(true)
    try {
      if (isPatient) {
        const res = await fetch("/api/admin/register-patients", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patients: [
              {
                name,
                email,
                password,
                role: "general",
                assignedRoomNumber: roomNumber,
                universityCode,
                subjectCode: subjectCode || undefined,
              },
            ],
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => null)
          throw new Error(j?.error || `register-patients failed: ${res.status}`)
        }
      } else {
        // ADR-005 F3: 役割選択 → teachers.role マッピング
        const role = isUniversityAdmin
          ? "university_admin"
          : isSubjectAdmin
            ? "subject_admin"
            : "general"
        const res = await fetch("/api/admin/register-teachers", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teachers: [
              {
                name,
                email,
                password,
                role,
                assignedRoomNumber: roomNumber || undefined,
                universityCode,
                subjectCode: subjectCode || undefined,
              },
            ],
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => null)
          throw new Error(j?.error || `register-teachers failed: ${res.status}`)
        }
      }
      setSuccess(`${ROLE_LABELS[roleChoice]} を登録しました: ${name}`)
      setName("")
      setEmail("")
      setPassword("")
      setSubjectCode("")
      setRoomNumber("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSessionLoading) {
    return (
      <PageContainer width="form">
        <p className="text-muted-foreground">読み込み中…</p>
      </PageContainer>
    )
  }
  if (!session) {
    if (typeof window !== "undefined") router.push("/login")
    return null
  }

  return (
    <PageContainer width="form" className="space-y-4">
      {/* 2026-11-06 デザイン見直し: 入力フォーム(768px)。戻るは見出しの上の小さなリンクに統一 */}
      <BackLink href="/admin/account-management" label="アカウント管理に戻る" />

      <Card>
        <CardHeader className="space-y-2">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <UserPlus className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">ユーザー追加</CardTitle>
          <CardDescription>
            役割を選んで、教員(一般 / 教科責任者)または患者役を 1 件登録します。複数件をまとめて
            登録するときは、各専用画面の CSV インポートをご利用ください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="role-select">役割</Label>
              <Select
                value={roleChoice}
                onValueChange={(v) => setRoleChoice(v as RoleChoice)}
              >
                <SelectTrigger id="role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher_general">一般教員</SelectItem>
                  <SelectItem value="teacher_subject_admin">教科責任者</SelectItem>
                  {canCreateUniversityAdmin && (
                    <SelectItem value="teacher_university_admin">大学管理者(大学責任者)</SelectItem>
                  )}
                  <SelectItem value="patient">患者役</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">氏名</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">メールアドレス(ログインID)</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                平文を送信しても、サーバ側で bcrypt ハッシュ化されてから DB に保存されます。
              </p>
            </div>

            {isSpecialMaster && (
              <div className="space-y-2">
                <Label htmlFor="university">大学</Label>
                <Select value={universityCode} onValueChange={setUniversityCode}>
                  <SelectTrigger id="university">
                    <SelectValue placeholder="大学を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {universities.map((u) => (
                      <SelectItem key={u.code} value={u.code}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="room">
                担当部屋{isUniversityAdmin ? "(任意 — 大学管理者は大学全体を担当)" : ""}
              </Label>
              <Select value={roomNumber} onValueChange={setRoomNumber}>
                <SelectTrigger id="room">
                  <SelectValue placeholder="担当する部屋を選択" />
                </SelectTrigger>
                <SelectContent>
                  {rooms
                    .filter((r) => !universityCode || r.universityCode === universityCode || !r.universityCode)
                    .map((r) => (
                      <SelectItem key={r.id} value={r.roomNumber}>
                        {r.roomNumber} — {r.roomName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">
                担当教科{isSubjectAdmin ? "(必須)" : "(任意)"}
              </Label>
              <Select value={subjectCode} onValueChange={setSubjectCode}>
                <SelectTrigger id="subject">
                  <SelectValue placeholder="教科を選択" />
                </SelectTrigger>
                <SelectContent>
                  {subjects
                    .filter((s) => !universityCode || s.universityCode === universityCode)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.subjectCode}>
                        {s.subjectName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "登録中…" : `${ROLE_LABELS[roleChoice]} を登録`}
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageContainer>
  )
}
