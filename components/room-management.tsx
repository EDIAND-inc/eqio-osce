"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Plus, Edit, Trash2, Home, Upload, Download } from "lucide-react"
import { PageContainer } from "@/components/page-container"
import { BackLink } from "@/components/back-link"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loadRooms, saveRooms, loadSubjects, type Room, type Subject } from "@/lib/data-storage"
import { useSession } from "@/lib/auth/use-session"
import { readCsvFile, csvDownloadBlob } from "@/lib/csv"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function RoomManagement() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [isAddingRoom, setIsAddingRoom] = useState(false)
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null)
  const [newRoomNumber, setNewRoomNumber] = useState("")
  const [newRoomName, setNewRoomName] = useState("")
  const [newUniversityCode, setNewUniversityCode] = useState("")
  const [newSubjectCode, setNewSubjectCode] = useState("")
  const [editRoomNumber, setEditRoomNumber] = useState("")
  const [editRoomName, setEditRoomName] = useState("")
  const [editUniversityCode, setEditUniversityCode] = useState("")
  const [editSubjectCode, setEditSubjectCode] = useState("")
  const [isSpecialMaster, setIsSpecialMaster] = useState(false)
  const [universities, setUniversities] = useState<Record<string, string>>({})
  const [universitiesList, setUniversitiesList] = useState<Array<{ code: string; name: string }>>([])
  const [selectedUniversityFilter, setSelectedUniversityFilter] = useState<string>("all")
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("all")
  const [subjects, setSubjects] = useState<Subject[]>([])
  const router = useRouter()

  // Phase 9b-β2e: sessionStorage 認可キーを useSession() に置換
  const { session, isLoading: isSessionLoading } = useSession()

  useEffect(() => {
    if (isSessionLoading || !session) return
    const accountType = session.accountType || ""
    setIsSpecialMaster(accountType === "special_master")

    if (accountType === "special_master") {
      fetch("/api/universities")
        .then((res) => res.json())
        .then((data) => {
          const universityMap: Record<string, string> = {}
          const universityList: Array<{ code: string; name: string }> = []
          data.forEach((uni: any) => {
            universityMap[uni.university_code] = uni.university_name
            universityList.push({ code: uni.university_code, name: uni.university_name })
          })
          setUniversities(universityMap)
          setUniversitiesList(universityList)
        })
        .catch((err) => {})
    }

    const fetchRooms = async () => {
      // 2026-05-20 副田さん指摘: 部屋マスター画面は「全部屋」を見るための画面なので、
      // testSessionId フィルタは適用しない (ADR-007 C-6 で API が junction 経由になり
      // 「そのセッションに割当のある部屋のみ」が返るため、マスター全件にならない問題)。
      // 大学スコープは維持 (special_master のみ全大学)。
      const universityScope =
        accountType === "special_master" ? undefined : session.universityCode || undefined
      const loadedRooms = await loadRooms(universityScope, undefined, undefined)
      setRooms(Array.isArray(loadedRooms) ? loadedRooms : [])
    }
    fetchRooms()

    const fetchSubjects = async () => {
      const loadedSubjects = await loadSubjects()
      setSubjects(loadedSubjects)
    }
    fetchSubjects()
  }, [session, isSessionLoading])

  const handleAddRoom = async () => {
    if (!newRoomNumber || !newRoomName) {
      alert("部屋番号と部屋名を入力してください")
      return
    }

    if (isSpecialMaster && !newUniversityCode) {
      alert("大学を選択してください")
      return
    }

    const existingRoom = rooms.find((r) => r.roomNumber === newRoomNumber)
    if (existingRoom) {
      alert("この部屋番号は既に登録されています")
      return
    }

    const universityCode = isSpecialMaster ? newUniversityCode : (session?.universityCode || "")

    // 2026-05-20 副田さん指摘: 部屋は canonical (university+部屋番号) 単位で登録。
    // 試験セッションへの紐付けは試験セッション割当画面で別途行うため、testSessionId は付けない。
    const newRoom: Room = {
      id: crypto.randomUUID(),
      roomNumber: newRoomNumber,
      roomName: newRoomName,
      universityCode: universityCode,
      subjectCode: newSubjectCode || undefined,
      testSessionId: "",
      createdAt: new Date().toISOString(),
    }

    const previousRooms = rooms
    const updatedRooms = [...rooms, newRoom]
    setRooms(updatedRooms)
    try {
      await saveRooms(updatedRooms)
    } catch (e) {
      // 保存失敗時は楽観的更新を巻き戻す(silent fail 防止)
      setRooms(previousRooms)
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[room-management] saveRooms (add) failed:", msg)
      alert(`部屋の追加に失敗しました: ${msg}`)
      return
    }

    setNewRoomNumber("")
    setNewRoomName("")
    setNewUniversityCode("")
    setNewSubjectCode("")
    setIsAddingRoom(false)
  }

  const handleStartEdit = (room: Room) => {
    setEditingRoomId(room.id)
    setEditRoomNumber(room.roomNumber)
    setEditRoomName(room.roomName)
    setEditUniversityCode(room.universityCode || "")
  }

  const handleSaveEdit = async (roomId: string) => {
    if (!editRoomNumber || !editRoomName) {
      alert("部屋番号と部屋名を入力してください")
      return
    }

    if (isSpecialMaster && !editUniversityCode) {
      alert("大学を選択してください")
      return
    }

    const previousRooms = rooms
    const updatedRooms = rooms.map((room) =>
      room.id === roomId
        ? { ...room, roomNumber: editRoomNumber, roomName: editRoomName, universityCode: editUniversityCode }
        : room,
    )

    setRooms(updatedRooms)
    try {
      await saveRooms(updatedRooms)
    } catch (e) {
      setRooms(previousRooms)
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[room-management] saveRooms (edit) failed:", msg)
      alert(`部屋の更新に失敗しました: ${msg}`)
      return
    }
    setEditingRoomId(null)
  }

  const handleDelete = async (roomId: string) => {
    if (!confirm("この部屋を削除してもよろしいですか？")) return

    try {
      const { deleteRoomApi } = await import("@/lib/api/rooms")
      await deleteRoomApi(roomId)
      setRooms((prev) => prev.filter((room) => room.id !== roomId))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "削除に失敗しました"
      alert(`部屋の削除に失敗しました: ${msg}`)
    }
  }

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    let csvText: string
    try {
      // 2026-05-20 副田さん報告: Excel 保存の Shift-JIS CSV が化けるため自動判定
      csvText = await readCsvFile(file)
    } catch (err) {
      alert(err instanceof Error ? err.message : "CSV ファイルの読み込みに失敗しました")
      e.target.value = ""
      return
    }
    {
      const lines = csvText.split("\n").filter((line) => line.trim())
      const importedRooms: Room[] = []

      const defaultUniversityCode = isSpecialMaster ? "" : (session?.universityCode || "")
      // 2026-05-20 副田さん指摘: マスター登録なので testSessionId は付けない。
      // 試験セッション割当は別画面で行う。

      for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(",").map((s) => s.trim())
        let roomNumber: string, roomName: string, universityCode: string

        if (isSpecialMaster && columns.length >= 3) {
          ;[roomNumber, roomName, universityCode] = columns
        } else {
          ;[roomNumber, roomName] = columns
          universityCode = defaultUniversityCode
        }

        if (roomNumber && roomName) {
          importedRooms.push({
            id: crypto.randomUUID(),
            roomNumber,
            roomName,
            universityCode,
            testSessionId: "",
            createdAt: new Date().toISOString(),
          })
        }
      }

      if (importedRooms.length > 0) {
        try {
          // 新規行のみ upsert (既存と一致した row は onConflict=university_code,room_number で update)
          await saveRooms(importedRooms)
          // 登録後に API から再取得して画面と DB を完全一致させる
          // (sessionStorage testSessionId が紛れて 0 件表示になるバグ回避)
          const universityScope = isSpecialMaster ? undefined : session?.universityCode || undefined
          const reloaded = await loadRooms(universityScope, undefined, undefined)
          setRooms(Array.isArray(reloaded) ? reloaded : [])
          alert(`${importedRooms.length}件の部屋をインポートしました`)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error("[room-management] saveRooms (csv-import) failed:", msg)
          alert(`部屋の一括登録に失敗しました: ${msg}`)
        }
      } else {
        alert("CSV から有効な部屋データが読み取れませんでした(ヘッダー行のみ等)")
      }
    }
    e.target.value = ""
  }

  const handleCSVExport = () => {
    const headers = isSpecialMaster ? ["部屋番号", "部屋名", "大学名"] : ["部屋番号", "部屋名"]

    const rows = rooms.map((room) => {
      const row = [room.roomNumber, room.roomName]
      if (isSpecialMaster) {
        row.push(universities[room.universityCode || ""] || "")
      }
      return row
    })

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n")

    const blob = csvDownloadBlob(csv)
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `部屋マスター_${new Date().toISOString().split("T")[0]}.csv`
    link.click()
  }

  const handleDownloadTemplate = () => {
    const csv = isSpecialMaster
      ? "部屋番号,部屋名,大学コード\n101,第1実習室,dentshowa\n102,第2実習室,dentshowa"
      : "部屋番号,部屋名\n101,第1実習室\n102,第2実習室"
    const blob = csvDownloadBlob(csv)
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = "部屋マスターテンプレート.csv"
    link.click()
  }

  const filteredRooms =
    selectedUniversityFilter === "all"
      ? rooms
      : rooms.filter(
          (room) =>
            (room as any).universityCode === selectedUniversityFilter ||
            room.universityCode === selectedUniversityFilter,
        )

  const sortedRooms = [...filteredRooms].sort((a, b) => {
    const numA = Number.parseInt(a.roomNumber) || 0
    const numB = Number.parseInt(b.roomNumber) || 0
    return numA - numB
  })

  return (
    // 2026-11-06 デザイン見直し: 列の少ない表なので menu(1,024px)
    <PageContainer width="menu">
      <div className="space-y-6">
        <div className="space-y-1">
          <BackLink href="/admin/master-management" label="マスター管理に戻る" />
          <h1 className="text-[28px] leading-tight font-bold text-foreground">部屋マスター管理</h1>
          <p className="text-muted-foreground">試験会場の部屋を管理します</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>登録済み部屋一覧</CardTitle>
                <CardDescription>登録されている部屋: {filteredRooms.length}件</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleDownloadTemplate} size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  CSVテンプレート
                </Button>
                <Button variant="outline" onClick={handleCSVExport} size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  CSV出力
                </Button>
                <label htmlFor="csv-import">
                  <Button variant="outline" size="sm" asChild>
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      CSV取込
                    </span>
                  </Button>
                </label>
                <input id="csv-import" type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
                <Button onClick={() => setIsAddingRoom(!isAddingRoom)}>
                  <Plus className="w-4 h-4 mr-2" />
                  新規追加
                </Button>
              </div>
            </div>
            {isSpecialMaster && (
              <div className="mt-4 flex items-center gap-4">
                <label className="text-sm font-medium">大学でフィルタ:</label>
                <Select value={selectedUniversityFilter} onValueChange={setSelectedUniversityFilter}>
                  <SelectTrigger className="w-[300px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべての大学</SelectItem>
                    {universitiesList.map((uni) => (
                      <SelectItem key={uni.code} value={uni.code}>
                        {uni.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {isAddingRoom && (
              <div className="mb-6 p-4 border rounded-lg bg-secondary/20">
                <h3 className="font-medium mb-4">新しい部屋を追加</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {isSpecialMaster && (
                    <div>
                      <Label htmlFor="newUniversityCode">大学 *</Label>
                      <Select value={newUniversityCode} onValueChange={setNewUniversityCode}>
                        <SelectTrigger>
                          <SelectValue placeholder="大学を選択してください" />
                        </SelectTrigger>
                        <SelectContent>
                          {universitiesList.map((uni) => (
                            <SelectItem key={uni.code} value={uni.code}>
                              {uni.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label htmlFor="newRoomNumber">部屋番号</Label>
                    <Input
                      id="newRoomNumber"
                      type="text"
                      placeholder="例: 101"
                      value={newRoomNumber}
                      onChange={(e) => setNewRoomNumber(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="newRoomName">部屋名</Label>
                    <Input
                      id="newRoomName"
                      type="text"
                      placeholder="例: 第1実習室"
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button onClick={handleAddRoom}>追加</Button>
                  <Button variant="outline" onClick={() => setIsAddingRoom(false)}>
                    キャンセル
                  </Button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">項番</th>
                    {isSpecialMaster && <th className="p-3 text-left font-medium">大学名</th>}
                    <th className="p-3 text-left font-medium">部屋番号</th>
                    <th className="p-3 text-left font-medium">部屋名</th>
                    <th className="p-3 text-center font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRooms.length === 0 ? (
                    <tr>
                      <td colSpan={isSpecialMaster ? 5 : 4} className="p-0">
                        <EmptyState icon={Home} title="登録されている部屋がありません" description="「部屋を追加」または CSV 一括登録から追加してください。" />
                      </td>
                    </tr>
                  ) : (
                    sortedRooms.map((room, index) => (
                      <tr key={room.id} className="border-b hover:bg-muted/30">
                        <td className="p-3">{index + 1}</td>
                        {isSpecialMaster && (
                          <td className="p-3">
                            {editingRoomId === room.id ? (
                              <Select value={editUniversityCode} onValueChange={setEditUniversityCode}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {universitiesList.map((uni) => (
                                    <SelectItem key={uni.code} value={uni.code}>
                                      {uni.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              universities[room.universityCode || ""] || "-"
                            )}
                          </td>
                        )}
                        <td className="p-3">
                          {editingRoomId === room.id ? (
                            <Input
                              value={editRoomNumber}
                              onChange={(e) => setEditRoomNumber(e.target.value)}
                              className="w-32"
                            />
                          ) : (
                            room.roomNumber
                          )}
                        </td>
                        <td className="p-3">
                          {editingRoomId === room.id ? (
                            <Input value={editRoomName} onChange={(e) => setEditRoomName(e.target.value)} />
                          ) : (
                            room.roomName
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2 justify-center">
                            {editingRoomId === room.id ? (
                              <>
                                <Button size="sm" onClick={() => handleSaveEdit(room.id)}>
                                  保存
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingRoomId(null)}>
                                  キャンセル
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" onClick={() => handleStartEdit(room)}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="outline" className="text-muted-foreground hover:text-critical hover:bg-critical/10 hover:border-critical/40" onClick={() => handleDelete(room.id)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
