/**
 * Phase 9c-1: GET /api/students/[id]
 *
 * ADR-004 Phase B-2-c: students.test_session_id / room_number 列を application 層から
 * 読まないようにした(後続 PR で RPC 書き込みも外し、最終的に DROP COLUMN する)。
 * 単一 GET は canonical な学生本体のみ返す。session 紐付け (room_number / testSessionId)
 * が必要な場合は GET /api/students?testSessionId=... を使う。
 *
 * 2026-05-08:
 *   PATCH /api/students/[id] を追加(canonical 行の id ベース UPDATE)
 *   DELETE /api/students/[id] を追加(canonical 行 + CASCADE で assignments 削除)
 *
 *   旧 students-list の handleSaveEdit / handleDelete / handleResetAllData は
 *   saveStudents 経由 (register_student_canonical, ON CONFLICT (univ, student_id))
 *   を使っており:
 *     - 削除: upsert なので消えない silent fail
 *     - studentId 変更: 新規 INSERT で別 id 行が作られ旧行 orphan
 *   PR #98 (teachers/patients) と同型のバグを潰す。
 */
import { NextResponse, type NextRequest } from "next/server"
import { getServiceClient, requireAdmin } from "@/lib/api/_shared"
import { getSubjectScope } from "@/lib/auth/api-guard"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from("students")
    .select("id, student_id, name, email, department, grade, attendance_number, university_code, subject_code, created_at")
    .eq("id", id)
    .maybeSingle()
  if (error) {
    console.error("[api/students/:id] error:", error)
    return NextResponse.json({ error: "Failed to load student" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const row = data as Record<string, unknown>
  const item = {
    id: row.id as string,
    studentId: row.student_id as string,
    name: row.name as string,
    email: row.email as string | undefined,
    department: row.department as string | undefined,
    grade: row.grade as string | undefined,
    attendanceNumber: (row.attendance_number as string | null) ?? undefined,
    // ADR-004 Phase B-2-c: 単一 GET では session 文脈なし → roomNumber / testSessionId は空。
    roomNumber: "",
    createdAt: row.created_at as string,
    universityCode: row.university_code as string | undefined,
    subjectCode: row.subject_code as string | undefined,
    testSessionId: undefined,
  }
  return NextResponse.json({ item }, { status: 200 })
}

interface PatchStudentInput {
  studentId?: string
  name?: string
  email?: string
  department?: string
  grade?: string
  attendanceNumber?: string
  universityCode?: string
  subjectCode?: string
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAdmin(request)
  if (guard) return guard
  const { id } = await params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  let body: PatchStudentInput
  try {
    body = (await request.json()) as PatchStudentInput
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const supabase = getServiceClient()

  // 対象行 + Y-2 scope check 用に subject_code を読む
  const { data: existing, error: existingErr } = await supabase
    .from("students")
    .select("id, subject_code")
    .eq("id", id)
    .maybeSingle()
  if (existingErr) {
    console.error("[api/students/:id] PATCH select error:", existingErr)
    return NextResponse.json({ error: "Failed to load student" }, { status: 500 })
  }
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Y-2: subject_admin は自教科のみ編集可。subject_code 変更時は新値も自教科でなければ拒否。
  const scope = getSubjectScope(request)
  if (scope) {
    const currentCode = (existing as Record<string, unknown>).subject_code as string | undefined
    if (!currentCode || currentCode !== scope) {
      return NextResponse.json(
        { error: `Forbidden — subject_admin は自教科 (${scope}) の学生のみ編集可能です` },
        { status: 403 },
      )
    }
    if (body.subjectCode !== undefined && body.subjectCode !== scope) {
      return NextResponse.json(
        { error: `Forbidden — subject_admin は subject_code を自教科 (${scope}) 以外に変更できません` },
        { status: 403 },
      )
    }
  }

  const update: Record<string, unknown> = {}
  if (body.studentId !== undefined) update.student_id = body.studentId
  if (body.name !== undefined) update.name = body.name
  if (body.email !== undefined) update.email = body.email || null
  if (body.department !== undefined) update.department = body.department || null
  if (body.grade !== undefined) update.grade = body.grade || null
  if (body.attendanceNumber !== undefined) update.attendance_number = body.attendanceNumber || null
  if (body.universityCode !== undefined) update.university_code = body.universityCode || null
  if (body.subjectCode !== undefined) update.subject_code = body.subjectCode || null

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 })
  }

  const { data: updated, error: updateErr } = await supabase
    .from("students")
    .update(update as never)
    .eq("id", id)
    .select("id, student_id, name, email, department, grade, attendance_number, university_code, subject_code, created_at")
    .maybeSingle()

  if (updateErr) {
    console.error("[api/students/:id] PATCH update error:", updateErr)
    const msg = updateErr.message || ""
    if (updateErr.code === "23505" || msg.includes("students_canonical_unique") || msg.includes("duplicate key")) {
      return NextResponse.json(
        { error: "同じ大学に同じ学籍番号 (student_id) の学生が既に存在します" },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: msg || "Failed to update student" }, { status: 500 })
  }
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const row = updated as Record<string, unknown>
  const item = {
    id: row.id as string,
    studentId: row.student_id as string,
    name: row.name as string,
    email: (row.email as string | null) ?? undefined,
    department: (row.department as string | null) ?? undefined,
    grade: (row.grade as string | null) ?? undefined,
    attendanceNumber: (row.attendance_number as string | null) ?? undefined,
    // session 文脈なし
    roomNumber: "",
    createdAt: row.created_at as string,
    universityCode: (row.university_code as string | null) ?? undefined,
    subjectCode: (row.subject_code as string | null) ?? undefined,
    testSessionId: undefined,
  }
  return NextResponse.json({ item }, { status: 200 })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAdmin(request)
  if (guard) return guard
  const { id } = await params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const supabase = getServiceClient()

  // Y-2: subject_admin は自教科の row のみ削除可
  const scope = getSubjectScope(request)
  if (scope) {
    const { data: target } = await supabase
      .from("students")
      .select("subject_code")
      .eq("id", id)
      .maybeSingle()
    const targetCode = (target as Record<string, unknown> | null)?.subject_code as string | undefined
    if (!targetCode || targetCode !== scope) {
      return NextResponse.json(
        { error: `Forbidden — subject_admin は自教科 (${scope}) の学生のみ削除可能です` },
        { status: 403 },
      )
    }
  }

  // student_test_session_assignments は CASCADE で自動削除される。
  // attendance_records / exam_results は student_id (text) 参照 (FK ではない) のため
  // 残存(過去評価履歴の保全)。これは現行仕様。
  const { error } = await supabase.from("students").delete().eq("id", id)
  if (error) {
    console.error("[api/students/:id] DELETE error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return new NextResponse(null, { status: 204 })
}
