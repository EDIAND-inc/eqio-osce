/**
 * Phase 9c-1: GET /api/patients
 * ADR-007 Phase C-2: testSessionId フィルタ時は patient_test_session_assignments
 * 経由で読む(canonical 化への移行)。
 */
import { type NextRequest, NextResponse } from "next/server"
import { getServiceClient, parseListQuery } from "@/lib/api/_shared"

type PatientRow = {
  id: string
  name: string
  email: string
  password: string
  role: string
  assigned_room_number?: string | null
  university_code?: string | null
  subject_code?: string | null
  account_type?: string | null
  test_session_id?: string | null
  last_login_at?: string | null
  created_at: string
}

function mapPatient(
  row: PatientRow,
  override?: { test_session_id?: string | null; assigned_room_number?: string | null; slot_index?: number | null }
) {
  return {
    id: row.id,
    patientId: row.id,
    name: row.name,
    email: row.email,
    password: row.password,
    role: row.role as "general",
    assignedRoomNumber: (override?.assigned_room_number ?? row.assigned_room_number ?? "") as string,
    createdAt: row.created_at,
    universityCode: row.university_code ?? undefined,
    accountType: row.account_type as "special_master" | "university_master" | "admin" | undefined,
    subjectCode: row.subject_code ?? undefined,
    testSessionId: (override?.test_session_id ?? row.test_session_id) ?? undefined,
    // 部屋内の①②…順 (assignments JOIN 時のみ)。
    slotIndex: override?.slot_index ?? undefined,
    // 2026-11-05 簡易ログイン状況
    lastLoginAt: row.last_login_at ?? undefined,
  }
}

export async function GET(request: NextRequest) {
  const filters = parseListQuery(request, ["universityCode", "subjectCode", "testSessionId"] as const)
  const supabase = getServiceClient()

  // ADR-007 Phase C-2: testSessionId フィルタは patient_test_session_assignments JOIN 経由
  if (filters.testSessionId) {
    let q = supabase
      .from("patient_test_session_assignments")
      .select("test_session_id, assigned_room_number, slot_index, patients!inner(*)")
      .eq("test_session_id", filters.testSessionId)
      .order("assigned_room_number", { ascending: true, nullsFirst: false })

    if (filters.universityCode) {
      q = q.or(`university_code.eq.${filters.universityCode},university_code.is.null`, {
        foreignTable: "patients",
      })
    }
    if (filters.subjectCode) q = q.eq("patients.subject_code", filters.subjectCode)

    const { data, error } = await q
    if (error) {
      console.error("[api/patients] GET (assignments) error:", error)
      return NextResponse.json({ error: "Failed to load patients" }, { status: 500 })
    }
    const items = (data || []).map((a: Record<string, unknown>) => {
      const patientRel = a.patients as PatientRow
      return mapPatient(patientRel, {
        test_session_id: a.test_session_id as string,
        assigned_room_number: a.assigned_room_number as string | null,
        slot_index: a.slot_index as number | null,
      })
    })
    return NextResponse.json({ items }, { status: 200 })
  }

  // testSessionId フィルタなしは patients を直接 (canonical view)
  // ADR-007 C-7 prep: assigned_room_number は junction に移行済 / 物理 DROP 予定の legacy 列。
  // canonical 一覧では別 session の room が入る/入らないため並び順としても意味を失っている。
  // 安定して存在する name で並べる。
  let query = supabase
    .from("patients")
    .select("*")
    .order("name", { ascending: true })

  if (filters.universityCode) {
    query = query.or(`university_code.eq.${filters.universityCode},university_code.is.null`)
  }
  if (filters.subjectCode) {
    query = query.eq("subject_code", filters.subjectCode)
  }

  const { data, error } = await query
  if (error) {
    console.error("[api/patients] GET error:", error)
    return NextResponse.json({ error: "Failed to load patients" }, { status: 500 })
  }
  const items = (data || []).map((row: Record<string, unknown>) => mapPatient(row as PatientRow))
  return NextResponse.json({ items }, { status: 200 })
}
