"use client"

/**
 * Phase 9d (post-cleanup): 試験中画面の上部バナー。
 * ADR-001 §1.2.F9 で挙げた「試験中の情報不足」への対応。
 *
 * 表示内容:
 *  - 現在のテストセッション名(description)+ 実施日
 *  - 担当部屋(番号 + 名前)
 *  - 教科
 *  - 合格ライン(passing_score、設定されている場合のみ)
 *  - 経過時間(秒数で渡されたものを mm:ss に整形)
 *
 * AppShell の下に重ねる形で表示するため、AppShell とは独立した
 * 試験運用専用バナー。teacher-exam-tabs / patient-exam-tabs から
 * 呼ばれる想定。
 */

import { PAGE_WIDTH } from "@/components/page-container"
import { useEffect, useState } from "react"
import { Calendar, DoorOpen, BookOpen, Clock, Target } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { listTestSessions } from "@/lib/api/test-sessions"
import { listRooms } from "@/lib/api/rooms"
import { listSubjects } from "@/lib/api/subjects"
import type { TestSession, Room, Subject } from "@/lib/types"

interface ExamSessionBannerProps {
  /** 試験セッション ID(sessionStorage("testSessionId") の値) */
  testSessionId: string
  /** 担当部屋番号(評価担当者の assignedRoomNumber) */
  roomNumber: string
  /** 現在選択中のテスト(subjectCode 抽出用) */
  subjectCode?: string
  /** 経過秒(親で setInterval 管理した値を渡す) */
  elapsedSeconds: number
  /** 親コンポーネントから渡される現大学コード(検索範囲絞り込み) */
  universityCode?: string
  /** アラート発生件数(任意) */
  alertCount?: number
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function formatDate(iso?: string): string {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })
  } catch {
    return iso
  }
}

export function ExamSessionBanner({
  testSessionId,
  roomNumber,
  subjectCode,
  elapsedSeconds,
  universityCode,
  alertCount,
}: ExamSessionBannerProps) {
  const [session, setSession] = useState<TestSession | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [subject, setSubject] = useState<Subject | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [sessions, rooms, subjects] = await Promise.all([
          listTestSessions({ universityCode }),
          listRooms({ universityCode, testSessionId }),
          listSubjects({ universityCode }),
        ])
        if (cancelled) return
        setSession(sessions.find((s) => s.id === testSessionId) || null)
        setRoom(rooms.find((r) => r.roomNumber === roomNumber) || null)
        if (subjectCode) setSubject(subjects.find((s) => s.subjectCode === subjectCode) || null)
      } catch (e) {
        console.error("[exam-session-banner] load error:", e)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [testSessionId, roomNumber, subjectCode, universityCode])

  return (
    <div className="border-b bg-primary/5">
      <div className={`mx-auto w-full px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap ${PAGE_WIDTH.list}`}>
        <div className="flex items-center gap-x-5 gap-y-1 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-primary" />
            <div>
              <div className="text-sm font-semibold leading-tight">
                {session?.description || "(セッション情報を取得中…)"}
              </div>
              {session?.testDate && (
                <div className="text-xs text-muted-foreground leading-tight">
                  {formatDate(session.testDate)}
                </div>
              )}
            </div>
          </div>

          {(room || roomNumber) && (
            <div className="flex items-center gap-1.5">
              <DoorOpen className="w-4 h-4 text-blue-600" />
              <span className="text-sm">
                <span className="font-medium">{roomNumber || "-"}</span>
                {room?.roomName && (
                  <span className="text-muted-foreground"> / {room.roomName}</span>
                )}
              </span>
            </div>
          )}

          {subject && (
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-green-600" />
              <span className="text-sm">{subject.subjectName}</span>
            </div>
          )}

          {session?.passingScore != null && session.passingScore > 0 && (
            <div className="flex items-center gap-1.5">
              <Target className="w-4 h-4 text-amber-600" />
              <span className="text-sm">
                合格ライン <span className="font-semibold">{session.passingScore}</span>%
              </span>
            </div>
          )}

          {alertCount != null && alertCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              アラート {alertCount} 件
            </Badge>
          )}
        </div>

        {(() => {
          const totalSec = (session?.durationMinutes ?? 0) * 60
          const hasLimit = totalSec > 0
          const remaining = hasLimit ? Math.max(0, totalSec - elapsedSeconds) : 0
          const progress = hasLimit ? Math.min(100, (elapsedSeconds / totalSec) * 100) : 0
          const isOverHalf = hasLimit && progress >= 50
          const isOverThreeFourth = hasLimit && progress >= 75
          const isOver = hasLimit && remaining <= 0
          const barColor = isOver
            ? "bg-destructive"
            : isOverThreeFourth
              ? "bg-amber-500"
              : isOverHalf
                ? "bg-blue-500"
                : "bg-primary"

          return (
            <div className="flex items-center gap-2 min-w-[180px]">
              <Clock className={`w-4 h-4 ${isOver ? "text-destructive" : "text-primary"}`} />
              {hasLimit ? (
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-muted-foreground">
                      {formatElapsed(elapsedSeconds)} / {session?.durationMinutes}:00
                    </span>
                    <span className={`font-mono font-semibold ${isOver ? "text-destructive" : ""}`}>
                      残り {formatRemaining(remaining)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full transition-all ${barColor}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <span className="text-sm font-mono font-semibold tabular-nums">
                  {formatElapsed(elapsedSeconds)}
                </span>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
