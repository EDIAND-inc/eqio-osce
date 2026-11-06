import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-secondary/30">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          トップに戻る
        </Link>

        <h1 className="text-[28px] leading-tight font-bold text-foreground mb-8">利用規約</h1>

        <div className="bg-background border rounded-lg p-6 sm:p-8 space-y-6 text-sm leading-relaxed text-foreground">
          <p className="text-muted-foreground">
            本ページの内容は準備中です。利用規約の内容が確定次第、こちらに掲載いたします。
          </p>
        </div>

        <div className="mt-8 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} EDIAND Inc. All rights reserved.
        </div>
      </div>
    </div>
  )
}
