"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Save } from "lucide-react"
import { PageContainer } from "@/components/page-container"
import { BackLink } from "@/components/back-link"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSession } from "@/lib/auth/use-session"
import { useBrandingFor, invalidateBrandingCache } from "@/lib/branding/use-branding"

export function AdminSettings() {
  const [autoSave, setAutoSave] = useState(true)
  const [backupFormat, setBackupFormat] = useState("csv")
  const [isSpecialMaster, setIsSpecialMaster] = useState(false)
  const [universities, setUniversities] = useState<Array<{ code: string; name: string }>>([])
  const [selectedUniversity, setSelectedUniversity] = useState<string>("")
  const [testDuration, setTestDuration] = useState<Record<string, string>>({})
  const [maxUsers, setMaxUsers] = useState<Record<string, string>>({})
  const [testSessions, setTestSessions] = useState<any[]>([])
  const [passingScores, setPassingScores] = useState<Record<string, string>>({})
  const [savingPassingScore, setSavingPassingScore] = useState<string | null>(null)
  const [durations, setDurations] = useState<Record<string, string>>({})
  const [savingDuration, setSavingDuration] = useState<string | null>(null)

  // Phase 9b-β2c: sessionStorage("accountType"|"universityCode") を useSession() に置換
  const { session, isLoading: isSessionLoading } = useSession()

  // 2026-05-13 (改訂): 大学ごとのブランド設定
  //   special_master: 大学切替可
  //   university_master / university_admin: 自大学のみ
  //   その他: セクション非表示
  const isUniversityMaster =
    session?.accountType === "university_master" ||
    session?.role === "university_master" ||
    session?.role === "university_admin"
  const canEditBranding = (session?.accountType === "special_master") || isUniversityMaster
  // 対象大学は既存の selectedUniversity と同期する
  // (special_master は「大学選択」ドロップダウンで切替、univ_master は session.universityCode)
  const [brandingTitle, setBrandingTitle] = useState<string>("")
  const [brandingIcon, setBrandingIcon] = useState<string>("")
  const [brandingIconUrl, setBrandingIconUrl] = useState<string | null>(null)
  const [savingBranding, setSavingBranding] = useState(false)
  const [uploadingIcon, setUploadingIcon] = useState(false)
  // 対象大学が変わったら fetch (空指定時は default)
  const brandingForTarget = useBrandingFor(selectedUniversity)
  useEffect(() => {
    setBrandingTitle(brandingForTarget.title)
    setBrandingIcon(brandingForTarget.icon)
    setBrandingIconUrl(brandingForTarget.iconUrl ?? null)
  }, [brandingForTarget.title, brandingForTarget.icon, brandingForTarget.iconUrl])

  const handleUploadIcon = async (file: File) => {
    if (!selectedUniversity) {
      alert("対象大学が選択されていません")
      return
    }
    setUploadingIcon(true)
    try {
      const fd = new FormData()
      fd.append("universityCode", selectedUniversity)
      fd.append("file", file)
      const res = await fetch("/api/admin/branding/icon", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        alert(`アイコン画像のアップロードに失敗しました: ${err?.error || res.status}`)
        return
      }
      const json = await res.json()
      setBrandingIconUrl(json.iconUrl as string)
      invalidateBrandingCache(selectedUniversity)
      invalidateBrandingCache("")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown"
      alert(`アップロード中にエラーが発生しました: ${msg}`)
    } finally {
      setUploadingIcon(false)
    }
  }

  const handleClearIcon = async () => {
    if (!selectedUniversity) return
    if (!confirm("アップロード済みアイコン画像をクリアし、絵文字表示に戻しますか?")) return
    setUploadingIcon(true)
    try {
      const res = await fetch(
        `/api/admin/branding/icon?universityCode=${encodeURIComponent(selectedUniversity)}`,
        { method: "DELETE", credentials: "same-origin" },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        alert(`アイコン画像のクリアに失敗しました: ${err?.error || res.status}`)
        return
      }
      setBrandingIconUrl(null)
      invalidateBrandingCache(selectedUniversity)
      invalidateBrandingCache("")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown"
      alert(`クリア中にエラーが発生しました: ${msg}`)
    } finally {
      setUploadingIcon(false)
    }
  }

  const handleSaveBranding = async () => {
    if (!selectedUniversity) {
      alert("対象大学が選択されていません")
      return
    }
    setSavingBranding(true)
    try {
      const res = await fetch("/api/admin/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          universityCode: selectedUniversity,
          title: brandingTitle,
          icon: brandingIcon,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        alert(`ブランド設定の保存に失敗しました: ${err?.error || res.status}`)
        return
      }
      invalidateBrandingCache(selectedUniversity)
      invalidateBrandingCache("") // 未ログイン default も念のため
      alert("ブランド設定を保存しました。画面の表示は次のリロードで反映されます。")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown"
      alert(`ブランド設定の保存中にエラーが発生しました: ${msg}`)
    } finally {
      setSavingBranding(false)
    }
  }

  useEffect(() => {
    if (isSessionLoading || !session) return
    const accountType = session.accountType
    setIsSpecialMaster(accountType === "special_master")

    if (accountType === "special_master") {
      fetch("/api/universities")
        .then((res) => res.json())
        .then((data) => {
          const universityList: Array<{ code: string; name: string }> = []
          data.forEach((uni: any) => {
            universityList.push({ code: uni.university_code, name: uni.university_name })
          })
          setUniversities(universityList)
          if (universityList.length > 0) {
            setSelectedUniversity(universityList[0].code)
          }
        })
        .catch((err) => {})
    } else {
      setSelectedUniversity(session.universityCode || "")
    }

    // 試験セッション取得
    fetch("/api/test-sessions")
      .then((res) => res.json())
      .then((data) => {
        setTestSessions(data || [])
        const scores: Record<string, string> = {}
        const durs: Record<string, string> = {}
        ;(data || []).forEach((s: any) => {
          if (s.passing_score != null) {
            scores[s.id] = String(s.passing_score)
          }
          if (s.duration_minutes != null) {
            durs[s.id] = String(s.duration_minutes)
          }
        })
        setPassingScores(scores)
        setDurations(durs)
      })
      .catch((err) => {})
  }, [session, isSessionLoading])

  const handleSaveDuration = async (sessionId: string) => {
    setSavingDuration(sessionId)
    try {
      const minutes = durations[sessionId]
      const res = await fetch(`/api/test-sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duration_minutes: minutes ? parseInt(minutes, 10) : null,
        }),
      })
      if (res.ok) {
        alert("制限時間を保存しました")
      } else {
        alert("保存に失敗しました")
      }
    } catch {
      alert("エラーが発生しました")
    } finally {
      setSavingDuration(null)
    }
  }

  const handleSavePassingScore = async (sessionId: string) => {
    setSavingPassingScore(sessionId)
    try {
      const score = passingScores[sessionId]
      const res = await fetch(`/api/test-sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passing_score: score ? parseInt(score, 10) : null,
        }),
      })
      if (res.ok) {
        alert("合格ラインを保存しました")
      } else {
        alert("保存に失敗しました")
      }
    } catch (err) {
      alert("エラーが発生しました")
    } finally {
      setSavingPassingScore(null)
    }
  }

  const currentTestDuration = testDuration[selectedUniversity] || "90"
  const currentMaxUsers = maxUsers[selectedUniversity] || "1000"

  const handleTestDurationChange = (value: string) => {
    setTestDuration({ ...testDuration, [selectedUniversity]: value })
  }

  const handleMaxUsersChange = (value: string) => {
    setMaxUsers({ ...maxUsers, [selectedUniversity]: value })
  }

  return (
    // 2026-11-06 デザイン見直し: 入力フォーム(768px)。数値欄は数字に合った幅にする。
    <PageContainer width="form">
      <div className="space-y-6">
        <div className="space-y-1">
          <BackLink href="/admin/dashboard" label="ダッシュボードに戻る" hideWhenAdminNav />
          <h1 className="text-3xl font-bold text-primary">システム設定</h1>
          <p className="text-muted-foreground">試験システムの設定を管理</p>
        </div>

        {canEditBranding && (
          <Card>
            <CardHeader>
              <CardTitle>ブランド設定(大学ごと)</CardTitle>
              <CardDescription>
                ヘッダー / トップページ / ブラウザタブに表示されるアプリ名とアイコンを大学ごとに設定します。
                未設定の大学は「医療面接評価システム」「🏥」で表示されます。
                {isSpecialMaster
                  ? "(スーパーマスター: 全大学を上の「大学選択」で切替可)"
                  : "(大学管理者: 自大学のみ編集可)"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm">
                対象大学:{" "}
                <span className="font-semibold text-primary">
                  {universities.find((u) => u.code === selectedUniversity)?.name || selectedUniversity || "(未選択)"}
                </span>
              </div>
              {/* アイコン画像アップロード */}
              <div className="space-y-2">
                <Label>アイコン画像</Label>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-16 h-16 rounded-md border bg-background flex items-center justify-center overflow-hidden">
                    {brandingIconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={brandingIconUrl}
                        alt=""
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-3xl" aria-hidden="true">{brandingIcon || "🏥"}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleUploadIcon(file)
                        e.target.value = ""
                      }}
                      disabled={uploadingIcon || !selectedUniversity}
                      className="text-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                      PNG / JPEG / SVG / WEBP、最大 1MB
                    </p>
                  </div>
                  {brandingIconUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearIcon}
                      disabled={uploadingIcon}
                    >
                      画像をクリア(絵文字に戻す)
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-3 items-end">
                <div>
                  <Label htmlFor="branding-icon">絵文字(画像未設定時のフォールバック)</Label>
                  <Input
                    id="branding-icon"
                    value={brandingIcon}
                    onChange={(e) => setBrandingIcon(e.target.value)}
                    placeholder="🏥"
                    maxLength={8}
                    className="text-2xl text-center"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    絵文字 1〜2 字
                  </p>
                </div>
                <div>
                  <Label htmlFor="branding-title">タイトル</Label>
                  <Input
                    id="branding-title"
                    value={brandingTitle}
                    onChange={(e) => setBrandingTitle(e.target.value)}
                    placeholder="医療面接評価システム"
                    maxLength={60}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    最大 60 文字
                  </p>
                </div>
              </div>
              <div className="rounded-md border bg-secondary/30 p-3 flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">プレビュー:</span>
                {brandingIconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brandingIconUrl} alt="" className="w-8 h-8 object-contain" />
                ) : (
                  <span className="text-2xl" aria-hidden="true">{brandingIcon || "🏥"}</span>
                )}
                <span className="text-primary font-semibold">{brandingTitle || "医療面接評価システム"}</span>
              </div>
              <Button
                onClick={handleSaveBranding}
                disabled={savingBranding || !brandingTitle.trim() || !selectedUniversity}
              >
                <Save className="w-4 h-4 mr-2" />
                {savingBranding ? "保存中..." : "タイトル/絵文字を保存"}
              </Button>
            </CardContent>
          </Card>
        )}

        {isSpecialMaster && (
          <Card>
            <CardHeader>
              <CardTitle>大学選択</CardTitle>
              <CardDescription>設定を変更する大学を選択してください</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedUniversity} onValueChange={setSelectedUniversity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {universities.map((uni) => (
                    <SelectItem key={uni.code} value={uni.code}>
                      {uni.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>試験設定</CardTitle>
            <CardDescription>
              {isSpecialMaster && selectedUniversity
                ? `${universities.find((u) => u.code === selectedUniversity)?.name || ""} の試験時間と制限の設定`
                : "試験時間と制限の設定"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="duration">試験時間（分）</Label>
              <Input
                id="duration"
                type="number"
                placeholder="90"
                className="w-32"
                value={currentTestDuration}
                onChange={(e) => handleTestDurationChange(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">試験の制限時間を設定してください</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxUsers">同時アクセス上限</Label>
              <Input
                id="maxUsers"
                type="number"
                placeholder="1000"
                className="w-32"
                value={currentMaxUsers}
                onChange={(e) => handleMaxUsersChange(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">同時に受験可能な人数の上限</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>合格ライン設定</CardTitle>
            <CardDescription>試験セッションごとに合格ライン %(0-100) を設定します(教員側＋患者役側の合計に対する達成率)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {testSessions
              .filter((s) => !selectedUniversity || s.university_code === selectedUniversity)
              .filter((s) => session?.accountType !== "subject_admin" || s.subject_code === session.subjectCode)
              .map((session) => (
                <div key={session.id} className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{session.description || "(名称未設定)"}</p>
                    <p className="text-xs text-muted-foreground">{new Date(session.test_date).toLocaleDateString("ja-JP")}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      className="w-24 h-8 text-sm"
                      placeholder="例: 70"
                      value={passingScores[session.id] || ""}
                      onChange={(e) => setPassingScores({ ...passingScores, [session.id]: e.target.value })}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                    <Button
                      size="sm"
                      className="h-8 bg-[#00417A] hover:bg-[#00417A]/90"
                      onClick={() => handleSavePassingScore(session.id)}
                      disabled={savingPassingScore === session.id}
                    >
                      {savingPassingScore === session.id ? "..." : "保存"}
                    </Button>
                  </div>
                </div>
              ))}
            {testSessions.filter((s) => !selectedUniversity || s.university_code === selectedUniversity).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">試験セッションが登録されていません</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>制限時間設定</CardTitle>
            <CardDescription>試験セッションごとに制限時間(分)を設定します。未設定の場合は経過時間のみ表示されます。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {testSessions
              .filter((s) => !selectedUniversity || s.university_code === selectedUniversity)
              .filter((s) => session?.accountType !== "subject_admin" || s.subject_code === session.subjectCode)
              .map((session) => (
                <div key={session.id} className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{session.description || "(名称未設定)"}</p>
                    <p className="text-xs text-muted-foreground">{new Date(session.test_date).toLocaleDateString("ja-JP")}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      className="w-24 h-8 text-sm"
                      placeholder="未設定"
                      value={durations[session.id] || ""}
                      onChange={(e) => setDurations({ ...durations, [session.id]: e.target.value })}
                    />
                    <span className="text-xs text-muted-foreground">分</span>
                    <Button
                      size="sm"
                      className="h-8 bg-[#00417A] hover:bg-[#00417A]/90"
                      onClick={() => handleSaveDuration(session.id)}
                      disabled={savingDuration === session.id}
                    >
                      {savingDuration === session.id ? "..." : "保存"}
                    </Button>
                  </div>
                </div>
              ))}
            {testSessions.filter((s) => !selectedUniversity || s.university_code === selectedUniversity).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">試験セッションが登録されていません</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>データ管理</CardTitle>
            <CardDescription>バックアップと保存の設定</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="autoSave">通信切断時の自動保存</Label>
                <p className="text-sm text-muted-foreground">接続が切れた場合に回答を自動保存</p>
              </div>
              <Switch id="autoSave" checked={autoSave} onCheckedChange={setAutoSave} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="backup">データバックアップ形式</Label>
              <Select value={backupFormat} onValueChange={setBackupFormat}>
                <SelectTrigger id="backup">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="both">両方</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">データをエクスポートする際のファイル形式</p>
            </div>
          </CardContent>
        </Card>

        <Button className="w-full" size="lg">
          <Save className="w-4 h-4 mr-2" />
          設定を保存
        </Button>
      </div>
    </PageContainer>
  )
}
