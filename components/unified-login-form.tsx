"use client"

/**
 * Phase 9d-1: 共通 /login 画面のフォーム。
 * ADR-001 §7-1 で確定したログインモデルを実装する:
 *   - ロール選択 UI なし
 *   - 入力は ID(またはメール) + パスワードのみ
 *   - サーバが verifyCredentials で 3 テーブル(admins/teachers/patients)を順次照合し、
 *     ロールと redirectTo を決定する
 *   - 教員/患者役で複数セッションに紐づく場合は session 選択ステップを挟む
 */

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { LogIn, ArrowLeft, Calendar } from "lucide-react"
import { listTestSessions } from "@/lib/api/test-sessions"
import type { TestSession } from "@/lib/types"

interface UnifiedLoginUser {
  source: "admins" | "teachers" | "patients"
  id: string
  name: string
  email: string
  role: string
  accountType: string
  universityCode: string
  universityCodes: string[]
  subjectCode: string
  testSessionId: string
  assignedRoomNumber: string
}

interface UnifiedLoginResponse {
  user?: UnifiedLoginUser
  redirectTo?: string
  needsSessionSelection?: boolean
  source?: "teachers" | "patients"
  candidates?: Array<{
    source: "teachers" | "patients"
    id: string
    name: string
    assignedRoomNumber: string
    universityCode: string
    subjectCode: string
  }>
  error?: string
}

interface UnifiedLoginFormProps {
  /**
   * 2026-11-06: "plain" はログイン画面(LoginScreen)の右半分に置くための枠なし表示。
   * 見出しを左寄せにし、カードの枠・影・アイコンを省く。
   */
  variant?: "card" | "plain"
}

export function UnifiedLoginForm({ variant = "card" }: UnifiedLoginFormProps = {}) {
  const plain = variant === "plain"
  const plainCard = "w-full max-w-sm border-0 bg-transparent shadow-none"
  const router = useRouter()
  const [loginId, setLoginId] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<"credentials" | "session">("credentials")
  const [sessions, setSessions] = useState<TestSession[]>([])

  const callLogin = async (testSessionId?: string): Promise<UnifiedLoginResponse | null> => {
    // 2026-07-10 副田さん報告: 「ログイン中...」でボタンが固まりリロードが必要に
    //   なる問題。fetch にタイムアウト (20 秒) を入れて、応答が来ない場合は
    //   エラー表示に戻して再入力可能にする。
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 20000)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, password, testSessionId }),
        credentials: "same-origin",
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const result = (await res.json()) as UnifiedLoginResponse
      if (!res.ok) {
        setError(result?.error || "認証エラーが発生しました")
        return null
      }
      return result
    } catch (e) {
      clearTimeout(timeoutId)
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("サーバーの応答がありません。ネットワークをご確認のうえ再度お試しください。")
      } else {
        setError("ログイン処理中にエラーが発生しました")
      }
      return null
    }
  }

  const completeLogin = (user: UnifiedLoginUser, redirectTo?: string) => {
    // Phase 9b-β2f2 で sessionStorage 認可キーは廃止済み。
    // 試験中の testSessionId のみ UI 状態として書き込む(test-selection-screen が上書きする)。
    sessionStorage.setItem("testSessionId", user.testSessionId)
    window.location.href = redirectTo || "/"
  }

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    if (!loginId || !password) {
      setError("IDとパスワードを入力してください")
      setIsLoading(false)
      return
    }

    const result = await callLogin()
    if (!result) {
      setIsLoading(false)
      return
    }

    // 複数セッション選択待ち(教員 or 患者役)
    if (result.needsSessionSelection && result.candidates && result.source) {
      const universityCode = result.candidates[0]?.universityCode || "dentshowa"
      const allSessions = await listTestSessions({ universityCode })
      const candidateIds = new Set(result.candidates.map((c) => c.id).filter(Boolean))
      const availableSessions = allSessions.filter((s) => candidateIds.has(s.id))
      setSessions(availableSessions)
      setStep("session")
      setIsLoading(false)
      return
    }

    if (!result.user) {
      setError("認証エラーが発生しました")
      setIsLoading(false)
      return
    }

    completeLogin(result.user, result.redirectTo)
  }

  const handleSessionSelect = async (sessionId: string) => {
    setError("")
    setIsLoading(true)
    const result = await callLogin(sessionId)
    if (!result || !result.user) {
      setIsLoading(false)
      return
    }
    completeLogin(result.user, result.redirectTo)
  }

  if (step === "session") {
    return (
      <Card className={plain ? plainCard : "w-full max-w-md"}>
        <CardHeader className={plain ? "space-y-2 px-0" : "space-y-4"}>
          {!plain && (
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
              <Calendar className="w-6 h-6 text-primary" />
            </div>
          )}
          <CardTitle className={plain ? "text-2xl font-bold" : "text-2xl text-center"}>試験の選択</CardTitle>
          <CardDescription className={plain ? "" : "text-center"}>参加する試験を選択してください</CardDescription>
        </CardHeader>
        <CardContent className={plain ? "space-y-3 px-0" : "space-y-3"}>
          {sessions.map((session) => (
            <Button
              key={session.id}
              variant="outline"
              className="w-full justify-start h-auto py-3 px-4"
              onClick={() => handleSessionSelect(session.id)}
              disabled={isLoading}
            >
              <div className="text-left">
                <div className="font-medium">{session.description || "(名称未設定)"}</div>
                <div className="text-sm text-muted-foreground">{session.testDate}</div>
              </div>
            </Button>
          ))}
          <Button
            variant="ghost"
            className="w-full mt-2"
            onClick={() => {
              setStep("credentials")
              setError("")
            }}
            disabled={isLoading}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            戻る
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    // 2026-07-12 デザイン Phase 3-1: ログインカードの質感を強化 (影・角丸・余白・アイコン)
    <Card className={plain ? plainCard : "w-full max-w-md rounded-2xl border-primary/10 shadow-xl shadow-primary/5"}>
      <CardHeader className={plain ? "space-y-2 px-0 pt-0" : "space-y-3 pt-8"}>
        {!plain && (
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center mx-auto shadow-lg shadow-primary/25">
            <LogIn className="w-7 h-7 text-white" />
          </div>
        )}
        <CardTitle className={plain ? "text-3xl font-bold tracking-tight" : "text-2xl text-center font-bold"}>ログイン</CardTitle>
        <CardDescription className={plain ? "" : "text-center"}>
          IDまたはメールアドレスとパスワードを入力してください
        </CardDescription>
      </CardHeader>
      <CardContent className={plain ? "px-0 pb-0" : "pb-8"}>
        <form onSubmit={handleCredentialsSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="loginId" className="text-sm font-semibold">ID / メールアドレス</Label>
            <Input
              id="loginId"
              type="text"
              autoComplete="username"
              placeholder="管理者ID、教員/患者担当者のメールアドレス"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-semibold">パスワード</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="パスワード"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11"
            />
          </div>

          <Button type="submit" className="w-full h-11 text-base font-semibold shadow-md shadow-primary/20" disabled={isLoading}>
            {isLoading ? "ログイン中..." : "ログイン"}
          </Button>

          <div className="text-center pt-1">
            <Link href="/reset-password" className="text-sm text-primary hover:underline">
              パスワードを忘れた方はこちら
            </Link>
          </div>

        </form>
      </CardContent>
    </Card>
  )
}
