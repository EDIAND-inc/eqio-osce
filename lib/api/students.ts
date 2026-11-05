/**
 * Phase 9c-1: students リソースの fetch wrapper。
 */
import type { Student } from "@/lib/data-storage"

export interface ListStudentsParams {
  universityCode?: string
  subjectCode?: string
  testSessionId?: string
  grade?: string
  [k: string]: string | undefined
}

function buildQS(params: { [k: string]: string | undefined }): string {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== "") as [string, string][]
  if (entries.length === 0) return ""
  return "?" + new URLSearchParams(entries).toString()
}

export async function listStudents(params: ListStudentsParams = {}): Promise<Student[]> {
  const res = await fetch(`/api/students${buildQS(params)}`, {
    credentials: "same-origin",
  })
  if (!res.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.error("listStudents failed:", res.status)
    }
    return []
  }
  const json = await res.json()
  return Array.isArray(json?.items) ? (json.items as Student[]) : []
}

export async function getStudent(id: string): Promise<Student | null> {
  const res = await fetch(`/api/students/${encodeURIComponent(id)}`, {
    credentials: "same-origin",
  })
  if (!res.ok) return null
  const json = await res.json()
  return (json?.item ?? null) as Student | null
}

export async function upsertStudents(items: Student[]): Promise<{ ok: boolean; upserted: number }> {
  const res = await fetch("/api/students", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.error || `upsertStudents failed: ${res.status}`)
  }
  const json = await res.json()
  return { ok: true, upserted: (json?.upserted as number) || 0 }
}

export interface UpdateStudentInput {
  studentId?: string
  name?: string
  email?: string
  department?: string
  grade?: string
  attendanceNumber?: string
  universityCode?: string
  subjectCode?: string
}

/**
 * 2026-05-08: id ベースの単行 UPDATE。
 * register_student_canonical (ON CONFLICT (univ, student_id)) は student_id 変更時に
 * 旧行を orphan 化するため、編集時は本関数を使う。
 */
export async function updateStudent(id: string, input: UpdateStudentInput): Promise<Student> {
  const res = await fetch(`/api/students/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.error || `updateStudent failed: ${res.status}`)
  }
  const json = await res.json()
  return json.item as Student
}

export async function deleteStudentApi(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/students/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
  })
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.error || `deleteStudent failed: ${res.status}`)
  }
  return { ok: true }
}
