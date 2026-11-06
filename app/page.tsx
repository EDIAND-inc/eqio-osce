import Image from "next/image"
import { PAGE_WIDTH } from "@/components/page-container"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LogIn, Mail, ExternalLink } from "lucide-react"
import { BrandingTitle } from "@/components/branding-title"

/**
 * Phase 9d-1: ロール選択を廃止して単一の「ログイン」CTA に簡素化。
 * ログイン後はサーバ(/api/auth/login の redirectTo)が役割に応じた画面へ振り分ける。
 */
export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-secondary/30">
      <main className="flex-1 flex items-center justify-center p-4">
        <div className={`w-full space-y-10 ${PAGE_WIDTH.form}`}>
          <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold text-primary tracking-tight">
              {/*
                2026-05-19: 画像アイコンが原寸表示で巨大になる問題を修正。
                w-24 h-24 (md: w-28 h-28) の固定枠 + object-contain で
                画像でも絵文字でも同じ占有サイズになる。
              */}
              <BrandingTitle
                className="justify-center"
                iconClassName="w-24 h-24 md:w-28 md:h-28 text-5xl md:text-6xl shrink-0"
                syncDocumentTitle
              />
            </h1>
          </div>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="space-y-4">
              <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                <LogIn className="w-7 h-7 text-primary" />
              </div>
              <CardTitle className="text-2xl text-center">ログイン</CardTitle>
              <CardDescription className="text-base text-center">
                管理者・教員・患者担当者のいずれもこちらからログインしてください
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/login">
                <Button className="w-full" size="lg">
                  ログイン画面へ
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t bg-background">
        <div className={`mx-auto px-4 md:px-8 py-6 ${PAGE_WIDTH.wide}`}>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link href="https://www.ediand.co.jp/" target="_blank" rel="noopener noreferrer">
              <Image
                src="/images/ediand-logo.png"
                alt="EDIAND Inc."
                width={160}
                height={40}
                className="h-8 w-auto"
              />
            </Link>

            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <Link href="/terms" className="hover:text-foreground transition-colors">
                利用規約
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                プライバシーポリシー
              </Link>
              <a
                href="mailto:support@ediand.co.jp"
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                お問い合わせ
              </a>
              <a
                href="https://www.ediand.co.jp/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                会社HP
              </a>
            </nav>
          </div>

          <div className="mt-4 pt-4 border-t text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} EDIAND Inc. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
