/**
 * Phase 9c-2: GET /api/evaluation-results
 * Phase 9c-4: POST /api/evaluation-results(upsert、試験中の教員/患者役のため認証必須のみ)
 *
 * ADR-006 Phase R-2-F6-0:
 *   - 評価保存時に exam_results.max_score を計算して保存(% 判定の前提)
 *   - 計算式: 当該 test_id の questions 数 × 5(5 段階評価固定)
 *   - test_id は (test_session_id, role_type=evaluator_type) で一意に決まる前提
 */
import { type NextRequest, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getServiceClient, parseListQuery } from "@/lib/api/_shared"
import { checkAndMaybeMarkSessionComplete } from "@/lib/api/session-completion"

export async function GET(request: NextRequest) {
  const filters = parseListQuery(request, ["universityCode", "testSessionId"] as const)
  const supabase = getServiceClient()

  let query = supabase
    .from("exam_results")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000)
  if (filters.testSessionId) query = query.eq("test_session_id", filters.testSessionId)
  if (filters.universityCode) {
    query = query.or(`university_code.eq.${filters.universityCode},university_code.is.null`)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: "Failed" }, { status: 500 })
  const items = (data || []).map((row: Record<string, unknown>) => ({
    studentId: row.student_id as string,
    evaluatorId: row.evaluator_email as string,
    evaluatorType: row.evaluator_type as "teacher" | "patient",
    roomNumber: row.room_number as string,
    answers: (row.evaluations as Record<string, unknown>) || {},
    totalScore: (row.total_score as number) || 0,
    // ADR-006 R-2-F6-0: max_score を返す(レガシー行は NULL のまま fallback)
    maxScore: (row.max_score as number | null) ?? null,
    // 2026-07-24: コメント(文字列)が同居するため、数値の値のみを回答数として数える
    answeredCount: Object.values((row.evaluations as Record<string, unknown>) || {}).filter(
      (v) => typeof v === "number",
    ).length,
    isCompleted: (row.is_completed as boolean) || false,
    hasAlert: (row.has_alert as boolean) || false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string | undefined,
    universityCode: row.university_code as string | undefined,
    testSessionId: row.test_session_id as string | undefined,
  }))
  return NextResponse.json({ items }, { status: 200 })
}

interface UpsertEvaluation {
  studentId: string
  roomNumber: string
  evaluatorId: string
  evaluatorType: "teacher" | "patient"
  answers: Record<string, unknown>
  totalScore: number
  isCompleted: boolean
  hasAlert?: boolean
  universityCode?: string
  testSessionId?: string
}

/**
 * ADR-006 R-2-F6-0: (test_session_id, role_type) から max_score を算出。
 *
 * 2026-07-11 副田さん要望: カテゴリー単位の scoreMap を反映して満点計算。
 *   - 問題ごとに score_map が上書きされていればそれの max
 *   - なければ属するカテゴリーの score_map の max
 *   - どちらも未指定なら 5 (従来の 5 段階前提)
 *
 * 同一バッチ内では cache を共有してクエリ回数を抑える。
 */
async function buildMaxScoreLookup(
  supabase: SupabaseClient,
  pairs: Array<{ testSessionId: string | null; role: "teacher" | "patient" }>,
): Promise<Map<string, number | null>> {
  const cache = new Map<string, number | null>()
  const uniq = Array.from(
    new Set(
      pairs
        .filter((p) => p.testSessionId)
        .map((p) => `${p.testSessionId}::${p.role}`),
    ),
  )
  for (const key of uniq) {
    const [testSessionId, role] = key.split("::") as [string, "teacher" | "patient"]
    const { data: tests, error: testErr } = await supabase
      .from("tests")
      .select("id")
      .eq("test_session_id", testSessionId)
      .eq("role_type", role)
    if (testErr || !tests || tests.length === 0) {
      cache.set(key, null)
      continue
    }
    // 2026-07-11 副田さん要望: 満点は question > category の順で scoreMap を解決した max を合算
    let total = 0
    for (const t of tests) {
      const { data: sheets } = await supabase
        .from("sheets")
        .select("categories(score_map, questions(id, score_map))")
        .eq("test_id", t.id as string)
      if (!sheets) continue
      for (const sheet of sheets as Array<{
        categories?: Array<{
          score_map?: number[] | null
          questions?: Array<{ score_map?: number[] | null }>
        }>
      }>) {
        for (const cat of sheet.categories || []) {
          const catMap =
            Array.isArray(cat.score_map) && cat.score_map.length > 0
              ? cat.score_map
              : [1, 2, 3, 4, 5]
          const catMax = Math.max(...catMap)
          for (const q of cat.questions || []) {
            const qMap =
              Array.isArray(q.score_map) && q.score_map.length > 0 ? q.score_map : null
            total += qMap ? Math.max(...qMap) : catMax
          }
        }
      }
    }
    cache.set(key, total > 0 ? total : null)
  }
  return cache
}

export async function POST(request: NextRequest) {
  let body: { items?: UpsertEvaluation[] }
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) return NextResponse.json({ ok: true, upserted: 0 })

  const supabase = getServiceClient()

  // ADR-006 R-2-F6-0: max_score lookup を一括構築
  const maxScoreCache = await buildMaxScoreLookup(
    supabase,
    items.map((r) => ({ testSessionId: r.testSessionId || null, role: r.evaluatorType })),
  )

  const rows = items.map((r) => {
    const maxKey = `${r.testSessionId || ""}::${r.evaluatorType}`
    const maxScore = maxScoreCache.get(maxKey) ?? null
    return {
      student_id: r.studentId,
      room_number: r.roomNumber,
      evaluator_email: r.evaluatorId,
      evaluator_type: r.evaluatorType,
      evaluations: r.answers,
      total_score: r.totalScore,
      max_score: maxScore, // ADR-006 R-2-F6-0
      is_completed: r.isCompleted,
      has_alert: r.hasAlert || false,
      university_code: r.universityCode || null,
      test_session_id: r.testSessionId || null,
    }
  })
  const { error } = await supabase
    .from("exam_results")
    .upsert(rows as never, {
      onConflict: "student_id,evaluator_email,evaluator_type,room_number,test_session_id",
    })
  if (error) {
    console.error("[api/evaluation-results] POST error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // A-3 (2026-05-20 副田さん仕様): 評価保存後にセッション全完了を判定し、
  // 全テスト × 全出席学生で is_completed=true が揃ったら status='completed' に自動更新。
  // 失敗しても保存自体は成功させる(best-effort)。
  const sessionIds = Array.from(
    new Set(items.map((r) => r.testSessionId).filter((s): s is string => !!s)),
  )
  const sessionResults: Array<{ sessionId: string; completed: boolean; reason?: string }> = []
  for (const sid of sessionIds) {
    try {
      const r = await checkAndMaybeMarkSessionComplete(supabase, sid)
      sessionResults.push({ sessionId: sid, ...r })
    } catch (e) {
      console.error("[api/evaluation-results] session completion check error:", sid, e)
    }
  }
  return NextResponse.json({ ok: true, upserted: rows.length, sessionResults })
}
