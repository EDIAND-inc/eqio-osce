/**
 * 2026-11-05 ダッシュボード「対応済」ボタン用 fetch ラッパー。
 * (試験セッション × 部屋) 単位のアラート赤解除状態を取得/保存する。
 */

export interface RoomAlertAck {
  testSessionId: string
  roomNumber: string
  acknowledgedAlertCount: number
  acknowledgedBy?: string
  updatedAt?: string
}

export async function listRoomAlertAcks(testSessionId: string): Promise<RoomAlertAck[]> {
  if (!testSessionId || testSessionId === "all") return []
  const res = await fetch(
    `/api/room-alert-acknowledgements?testSessionId=${encodeURIComponent(testSessionId)}`,
    { credentials: "same-origin" },
  )
  if (!res.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.error("listRoomAlertAcks failed:", res.status)
    }
    return []
  }
  const json = await res.json()
  return Array.isArray(json?.items) ? (json.items as RoomAlertAck[]) : []
}

export async function upsertRoomAlertAck(input: {
  testSessionId: string
  roomNumber: string
  acknowledgedAlertCount: number
  acknowledgedBy?: string
}): Promise<{ ok: boolean }> {
  const res = await fetch("/api/room-alert-acknowledgements", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.error || `upsertRoomAlertAck failed: ${res.status}`)
  }
  return { ok: true }
}
