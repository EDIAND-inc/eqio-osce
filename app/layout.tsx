import type React from "react"
import type { Metadata } from "next"
import { BIZ_UDPGothic, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { AppVersion } from "@/components/app-version"
import "./globals.css"

// 2026-11-06 見やすさ改善: 和文・英数字とも「BIZ UDPゴシック」(UD 書体) に統一。
// 1/l/I・0/O が判別しやすく、Windows の細い游ゴシックへのフォールバックを避ける。
// 和文は subset 分割されないため preload は無効 (Google の unicode-range 分割で必要分だけ読む)。
const bizUD = BIZ_UDPGothic({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-biz-ud",
})
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  // 2026-05-13: ブランド名を「医療面接評価システム」に統一
  title: "医療面接評価システム",
  description: "医療面接評価システム — 大学試験のためのデジタル解答システム",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja" className={`${bizUD.variable} ${geistMono.variable}`}>
      <body className={`font-sans antialiased`}>
        {children}
        <AppVersion />
        <Analytics />
      </body>
    </html>
  )
}
