/**
 * 2026-11-05 ダッシュボード「対応済」ボタン用 API。
 *
 * 部屋カードのアラート赤表示を (試験セッション × 部屋) 単位で「対応済」にして解除する状態を保存/取得する。
 *   赤表示 = room.alertCount > acknowledged_alert_count
 * 「対応済」押下で acknowledged_alert_count = 現在の alertCount を保存 → 赤が消える。
 * 新たなアラートで alertCount がさらに増えたら再び赤くなる(見落とし防止)。
 *
 * - GET  ?testSessionId=... : そのセッションの対応済レコード一覧
 * - POST { testSessionId, roomNumber, acknowledgedAlertCount } : upsert(requireAdmin)
 */
import { type NextRequest, NextResponse } from "next/server"
import { getServiceClient, parseListQuery, requireAdmin } from "@/lib/api/_shared"

type AckRow = {
  test_session_id: string
  room_number: string
  acknowledged_alert_count: number
  acknowledged_by?: string | null
  updated_at?: string
}

export async function GET(request: NextRequest) {
  const filters = parseListQuery(request, ["testSessionId"] as const)
  if (!filters.testSessionId) {
    return NextResponse.json({ items: [] }, { status: 200 })
  }
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from("room_alert_acknowledgements")
    .select("*")
    .eq("test_session_id", filters.testSessionId)
  if (error) {
    console.error("[api/room-alert-acknowledgements] GET error:", error)
    return NextResponse.json({ error: "Failed to load acknowledgements" }, { status: 500 })
  }
  const items = (data || []).map((r: Record<string, unknown>) => {
    const row = r as AckRow
    return {
      testSessionId: row.test_session_id,
      roomNumber: row.room_number,
      acknowledgedAlertCount: row.acknowledged_alert_count ?? 0,
      acknowledgedBy: row.acknowledged_by ?? undefined,
      updatedAt: row.updated_at,
    }
  })
  return NextResponse.json({ items }, { status: 200 })
}

interface UpsertAck {
  testSessionId: string
  roomNumber: string
  acknowledgedAlertCount: number
  acknowledgedBy?: string
}

export async function POST(request: NextRequest) {
  const guard = requireAdmin(request)
  if (guard) return guard

  let body: UpsertAck
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (!body.testSessionId || !body.roomNumber) {
    return NextResponse.json({ error: "testSessionId and roomNumber are required" }, { status: 400 })
  }

  const supabase = getServiceClient()
  // room_alert_acknowledgements は生成済み Database 型に未登録のため型推論を回避 (as any)。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { error } = await sb
    .from("room_alert_acknowledgements")
    .upsert(
      {
        test_session_id: body.testSessionId,
        room_number: body.roomNumber,
        acknowledged_alert_count: Math.max(0, Math.floor(Number(body.acknowledgedAlertCount) || 0)),
        acknowledged_by: body.acknowledgedBy ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "test_session_id,room_number" },
    )
  if (error) {
    console.error("[api/room-alert-acknowledgements] POST error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true }, { status: 200 })
}
