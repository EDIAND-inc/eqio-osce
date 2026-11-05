/**
 * Phase 9c-1: GET /api/students
 * Phase 9c-4: POST /api/students(upsert)
 *
 * ADR-004 Phase B-2-b: testSessionId フィルタ時は student_test_session_assignments
 * 経由で読む(canonical 化への移行)。フィルタなしのときは students を直接読む。
 *
 * ADR-004 Phase B-2-c (本 PR): students.test_session_id / students.room_number 列は
 * application 層から **読まない** ようにした。testSessionId / roomNumber は assignment 経由
 * (override 付き mapStudent) でしか populate されない。両列は次 PR 以降で RPC から書き込みも
 * 外し、最終的に scripts/22x で DROP COLUMN する。
 */
import { type NextRequest, NextResponse } from "next/server"
import { getServiceClient, parseListQuery, requireAdmin } from "@/lib/api/_shared"

type StudentRow = {
  id: string
  student_id: string
  name: string
  email?: string | null
  department?: string | null
  grade?: string | null
  attendance_number?: string | null
  university_code?: string | null
  subject_code?: string | null
  created_at: string
  // NOTE: test_session_id / room_number はまだ DB 列としては存在する(B-2-c 完遂後に DROP)。
  // しかし application 層では参照しないため、本 type 定義からも除外している。
}

function mapStudent(
  row: StudentRow,
  override?: { test_session_id?: string | null; room_number?: string | null }
) {
  return {
    id: row.id,
    studentId: row.student_id,
    name: row.name,
    email: row.email ?? undefined,
    department: row.department ?? undefined,
    grade: row.grade ?? undefined,
    attendanceNumber: row.attendance_number ?? undefined,
    // ADR-004 Phase B-2-c: roomNumber / testSessionId は assignments 経由 (override) のみ。
    // students 列の値は無視する(後続 PR で DROP COLUMN するため)。
    roomNumber: (override?.room_number ?? "") as string,
    createdAt: row.created_at,
    universityCode: row.university_code ?? undefined,
    subjectCode: row.subject_code ?? undefined,
    testSessionId: override?.test_session_id ?? undefined,
  }
}

export async function GET(request: NextRequest) {
  // ADR-004 Phase B-2-d: grade フィルタを追加 (canonical な students を学年で絞り込めるようにする)
  const filters = parseListQuery(request, ["universityCode", "subjectCode", "testSessionId", "grade"] as const)
  const supabase = getServiceClient()

  // ADR-004 Phase B-2-b: testSessionId フィルタは assignments 経由で読む
  if (filters.testSessionId) {
    let q = supabase
      .from("student_test_session_assignments")
      .select("test_session_id, room_number, students!inner(*)")
      .eq("test_session_id", filters.testSessionId)
      .order("created_at", { ascending: true })

    if (filters.universityCode) q = q.eq("students.university_code", filters.universityCode)
    if (filters.subjectCode) q = q.eq("students.subject_code", filters.subjectCode)
    if (filters.grade) q = q.eq("students.grade", filters.grade)

    const { data, error } = await q
    if (error) {
      console.error("[api/students] GET (assignments) error:", error)
      return NextResponse.json({ error: "Failed to load students" }, { status: 500 })
    }
    const items = (data || []).map((a: Record<string, unknown>) => {
      const studentRel = a.students as StudentRow
      return mapStudent(studentRel, {
        test_session_id: a.test_session_id as string,
        room_number: a.room_number as string | null,
      })
    })
    return NextResponse.json({ items }, { status: 200 })
  }

  // testSessionId フィルタなしは students を直接(canonical view)
  let query = supabase.from("students").select("*").order("created_at", { ascending: true })
  if (filters.universityCode) query = query.eq("university_code", filters.universityCode)
  if (filters.subjectCode) query = query.eq("subject_code", filters.subjectCode)
  if (filters.grade) query = query.eq("grade", filters.grade)

  const { data, error } = await query
  if (error) {
    console.error("[api/students] GET error:", error)
    return NextResponse.json({ error: "Failed to load students" }, { status: 500 })
  }
  const items = (data || []).map((row: Record<string, unknown>) => mapStudent(row as StudentRow))
  return NextResponse.json({ items }, { status: 200 })
}

interface UpsertStudent {
  studentId: string
  name: string
  email?: string
  department?: string
  grade?: string
  attendanceNumber?: string
  roomNumber?: string
  universityCode?: string
  subjectCode?: string
  testSessionId?: string
}

/**
 * ADR-004 Phase B-2-b: POST /api/students は RPC \`register_student_canonical\` を学生ごとに呼び出す。
 * これにより:
 *   - students は (university_code, student_id) で 1 行のみ (canonical)
 *   - test_session 紐付けは student_test_session_assignments に追加
 *   - 既存 students 行の name/email 等は最新値で更新、test_session_id / room_number 列は触らない
 */
export async function POST(request: NextRequest) {
  const guard = requireAdmin(request)
  if (guard) return guard

  let body: { items?: UpsertStudent[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) return NextResponse.json({ ok: true, upserted: 0 })

  const supabase = getServiceClient()
  // RPC \`register_student_canonical\` は Database 型に未登録 (lib/api/_shared.ts は generic
  // SupabaseClient を返す) なので、型推論を回避するため as any でキャスト。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  let upserted = 0
  for (const s of items) {
    const { error } = await sb.rpc("register_student_canonical", {
      p_student_id: s.studentId,
      p_name: s.name,
      p_email: s.email || null,
      p_department: s.department || null,
      p_grade: s.grade || null,
      p_university_code: s.universityCode || null,
      p_subject_code: s.subjectCode || null,
      p_test_session_id: s.testSessionId || null,
      p_room_number: s.roomNumber || null,
      p_attendance_number: s.attendanceNumber || null,
    })
    if (error) {
      console.error("[api/students] POST rpc error:", error, { studentId: s.studentId })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    upserted += 1
  }
  return NextResponse.json({ ok: true, upserted })
}
