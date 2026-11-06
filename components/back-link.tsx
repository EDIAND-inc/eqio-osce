"use client"

/**
 * 2026-11-06 デザイン見直し: ページ内の「〜に戻る」を、見出しの上・左端の小さなリンクに統一する。
 *
 * - hideWhenAdminNav: 上部メニュー(AdminTopNav)が表示されている間は出さない。
 *   「ダッシュボードに戻る」は上部メニューの「ダッシュボード」タブと重複するため、これを付けて使う。
 *   メニューが出ない権限(または読込中)では従来どおり戻り先を確保する(読込中は点滅防止で非表示)。
 */
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useAdminNavItems } from "@/components/admin-top-nav"

interface BackLinkProps {
  href: string
  label: string
  hideWhenAdminNav?: boolean
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void
}

export function BackLink({ href, label, hideWhenAdminNav = false, onClick }: BackLinkProps) {
  const { isLoading, items } = useAdminNavItems()
  if (hideWhenAdminNav && (isLoading || items.length > 0)) return null
  return (
    <Link
      href={href}
      onClick={onClick}
      className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  )
}
