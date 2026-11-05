/**
 * Phase 9b-α: 統合ログイン API。
 *
 * すべてのロール(admin / teacher / patient)を 1 つのエンドポイントで認証する。
 * UI 側は /login(または既存の /admin/login, /teacher/login, /patient/login のいずれ)
 * から本 API を叩く。
 *
 * リクエスト:
 *   POST /api/auth/login
 *   Body: { loginId: string, password: string, testSessionId?: string }
 *
 * レスポンス(成功):
 *   200 {
 *     user: VerifiedUser,
 *     redirectTo: string,
 *   }
 *   + HttpOnly Cookie (loginInfo)
 *
 * レスポンス(複数セッション選択待ち):
 *   200 { needsSessionSelection: true, source, candidates: [...] }
 *
 * レスポンス(失敗):
 *   401 { error: "..." }
 *
 * 旧 /api/auth/{admin,teacher,patient}/login は本 API にマージされた後も
 * 互換性維持のため残置(Phase 9b-β で UI 側を新 API へ切替後、9d で削除予定)。
 */
import { type NextRequest, NextResponse } from "next/server"
import { attachLoginCookie } from "@/lib/auth/http-cookie"
import { verifyCredentials, getRedirectTo } from "@/lib/auth/verify"
import { getServiceClient } from "@/lib/api/_shared"

interface LoginRequestBody {
  loginId?: string
  password?: string
  testSessionId?: string
}

export async function POST(request: NextRequest) {
  let body: LoginRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const loginId = (body.loginId || "").trim()
  const password = body.password || ""
  if (!loginId || !password) {
    return NextResponse.json(
      { error: "IDとパスワードを入力してください" },
      { status: 400 },
    )
  }

  const outcome = await verifyCredentials(loginId, password, body.testSessionId)

  if (outcome.kind === "error") {
    console.error("[auth/login]", outcome.message)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }

  if (outcome.kind === "not_found") {
    return NextResponse.json(
      { error: "IDまたはパスワードが正しくありません" },
      { status: 401 },
    )
  }

  if (outcome.kind === "session_select") {
    return NextResponse.json(
      {
        needsSessionSelection: true,
        source: outcome.source,
        candidates: outcome.candidates,
      },
      { status: 200 },
    )
  }

  // outcome.kind === "match"
  const { user } = outcome
  const redirectTo = getRedirectTo(user)

  // 2026-11-05 簡易ログイン状況: teacher/patient のログイン成功時に last_login_at を記録(best-effort)。
  //   失敗してもログイン自体は成功させる。
  if (user.source === "teachers" || user.source === "patients") {
    try {
      // last_login_at は生成済み Database 型に未登録のため as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = getServiceClient() as any
      await sb.from(user.source).update({ last_login_at: new Date().toISOString() }).eq("id", user.id)
    } catch (e) {
      console.error("[auth/login] last_login_at update failed:", e)
    }
  }

  const responseBody = {
    user: {
      source: user.source,
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      accountType: user.accountType,
      universityCode: user.universityCode,
      universityCodes: user.universityCodes,
      subjectCode: user.subjectCode,
      testSessionId: user.testSessionId,
      assignedRoomNumber: user.assignedRoomNumber,
    },
    redirectTo,
  }
  const response = NextResponse.json(responseBody, { status: 200 })

  // Cookie の loginType は middleware/api-guard 互換のために 1:1 で対応させる
  const loginType: "admin" | "teacher" | "patient" =
    user.source === "admins" ? "admin" : user.source === "teachers" ? "teacher" : "patient"

  attachLoginCookie(response, {
    loginType,
    role: user.role,
    userId: user.id,
    userName: user.name,
    email: user.email,
    assignedRoomNumber: user.assignedRoomNumber,
    universityCode: user.universityCode,
    universityCodes: user.universityCodes,
    subjectCode: user.subjectCode,
    testSessionId: user.testSessionId,
    accountType: user.accountType,
  })

  return response
}
