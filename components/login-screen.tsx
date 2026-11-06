"use client"

/**
 * 2026-11-06 副田さん要望: 最初のログイン画面をリデザイン。
 *
 * - 以前はトップ(/)が「ログイン画面へ」ボタンだけの中継ページで、ログインまでに 1 クリック余計だった。
 *   / と /login の両方でこの画面を表示し、フォームを直接置く。
 * - 左: ブランド面(大学ごとのブランド設定のロゴ + タイトル)。背景はマークシートの塗りつぶし欄をモチーフにした模様。
 *   タイトルが「SCCAS (Showa Clinical …)」のような括弧つきなら、略称と正式名称の 2 段に分けて組む。
 * - 右: ログインフォームとフッター。スマートフォンでは上下に積む。
 */

import { useEffect, type CSSProperties } from "react"
import Image from "next/image"
import Link from "next/link"
import { Mail, ExternalLink } from "lucide-react"
import { useBranding } from "@/lib/branding/use-branding"
import { BrandingIcon } from "@/components/branding-icon"
import { UnifiedLoginForm } from "@/components/unified-login-form"

/** 「略称 (正式名称)」形式なら 2 つに分ける。それ以外は略称なしで返す。 */
function splitTitle(title: string): { main: string; sub: string | null } {
  const m = title.match(/^\s*(.+?)\s*[（(]\s*(.+?)\s*[)）]\s*$/)
  if (m) return { main: m[1], sub: m[2] }
  return { main: title, sub: null }
}

// マークシートの解答欄(円)を並べた模様。中央の数個だけ「塗りつぶし済み」にして、評価の記入を表す。
const BUBBLE_GRID: CSSProperties = {
  backgroundImage:
    "radial-gradient(circle at center, transparent 0 6px, rgb(255 255 255 / 0.13) 6px 7.5px, transparent 8px)",
  backgroundSize: "26px 26px",
  maskImage: "linear-gradient(115deg, transparent 5%, black 45%, black 70%, transparent 100%)",
  WebkitMaskImage: "linear-gradient(115deg, transparent 5%, black 45%, black 70%, transparent 100%)",
}

const FILLED_BUBBLES = [
  { x: 3, y: 4 },
  { x: 4, y: 5 },
  { x: 6, y: 4 },
  { x: 7, y: 6 },
  { x: 9, y: 5 },
]

export function LoginScreen() {
  const branding = useBranding()
  const { main, sub } = splitTitle(branding.title)

  useEffect(() => {
    if (typeof document !== "undefined") document.title = branding.title
  }, [branding.title])

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* ブランド面 */}
      <aside
        className="relative overflow-hidden text-white"
        style={{
          background:
            "linear-gradient(155deg, var(--color-foreground) 0%, #075985 55%, var(--color-primary) 100%)",
        }}
      >
        <div className="pointer-events-none absolute inset-0" style={BUBBLE_GRID} aria-hidden="true" />
        {/* 塗りつぶし済みの解答欄(数個)。グリッド(26px)に合わせて配置 */}
        <div className="pointer-events-none absolute right-0 bottom-0 hidden lg:block" aria-hidden="true">
          <div className="relative h-[234px] w-[312px]">
            {FILLED_BUBBLES.map((b) => (
              <span
                key={`${b.x}-${b.y}`}
                className="absolute h-[15px] w-[15px] rounded-full bg-white/35"
                style={{ left: b.x * 26 + 5.5, top: b.y * 26 + 5.5 }}
              />
            ))}
          </div>
        </div>
        <div
          className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-sky-300/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative flex h-full flex-col gap-6 px-6 py-8 sm:px-10 lg:min-h-screen lg:justify-between lg:px-14 lg:py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2 shadow-lg shadow-black/20 lg:h-20 lg:w-20">
            <BrandingIcon branding={branding} className="h-full w-full text-4xl lg:text-5xl" alt="" />
          </div>

          <div className="space-y-4">
            {sub && <p className="text-xs font-semibold tracking-[0.2em] text-sky-100/80">OSCE 医療面接評価</p>}
            <h1 className="text-balance">
              <span className="block text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">{main}</span>
              {sub && (
                <span className="mt-3 block max-w-md text-base font-medium leading-snug text-sky-50/85 lg:text-lg">
                  {sub}
                </span>
              )}
            </h1>
          </div>

          <p className="hidden max-w-sm text-sm leading-relaxed text-sky-50/70 lg:block">
            管理者・教員・患者役のどなたも、この画面からログインできます。
            ログインすると、役割に応じた画面に自動で移動します。
          </p>
        </div>
      </aside>

      {/* フォーム面 */}
      <main className="flex min-h-[60vh] flex-col lg:min-h-screen">
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <UnifiedLoginForm variant="plain" />
        </div>

        <footer className="border-t border-border/70 px-4 py-5 sm:px-8">
          <div className="mx-auto flex max-w-xl flex-col items-center gap-3 text-xs text-muted-foreground sm:flex-row sm:justify-between">
            <Link href="https://www.ediand.co.jp/" target="_blank" rel="noopener noreferrer" aria-label="EDIAND Inc.">
              <Image src="/images/ediand-logo.png" alt="EDIAND Inc." width={160} height={40} className="h-6 w-auto" />
            </Link>
            <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <Link href="/terms" className="transition-colors hover:text-foreground">
                利用規約
              </Link>
              <Link href="/privacy" className="transition-colors hover:text-foreground">
                プライバシーポリシー
              </Link>
              <a href="mailto:support@ediand.co.jp" className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
                <Mail className="h-3 w-3" />
                お問い合わせ
              </a>
              <a
                href="https://www.ediand.co.jp/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                会社HP
              </a>
            </nav>
          </div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground/80">
            &copy; {new Date().getFullYear()} EDIAND Inc. All rights reserved.
          </p>
        </footer>
      </main>
    </div>
  )
}
