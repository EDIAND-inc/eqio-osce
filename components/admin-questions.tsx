"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Plus } from "lucide-react"
import Link from "next/link"
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

export function AdminQuestions() {
  const [shuffle, setShuffle] = useState(false)
  const [correctAnswer, setCorrectAnswer] = useState("")

  return (
    <div className="min-h-screen bg-secondary/30 p-4 md:p-8">
      <div className="mx-auto space-y-6">
        <div>
          <Link href="/admin/dashboard">
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="w-4 h-4 mr-2" />
              ダッシュボードに戻る
            </Button>
          </Link>
          <h1 className="text-[28px] leading-tight font-bold text-primary">問題管理</h1>
          <p className="text-muted-foreground">試験問題の作成と編集</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>新しい問題を追加</CardTitle>
            <CardDescription>問題文と選択肢を入力してください</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="question">問題文</Label>
              <Textarea id="question" placeholder="問題文を入力してください" rows={4} />
            </div>

            <div className="space-y-4">
              <Label>選択肢</Label>
              {["A", "B", "C", "D", "E"].map((option) => (
                <div key={option} className="flex items-center gap-3">
                  <span className="font-semibold text-primary min-w-[20px]">{option}.</span>
                  <Input placeholder={`選択肢${option}を入力`} />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>正答</Label>
              <RadioGroup value={correctAnswer} onValueChange={setCorrectAnswer}>
                <div className="flex gap-4">
                  {["A", "B", "C", "D", "E"].map((option) => (
                    <div key={option} className="flex items-center space-x-2">
                      <RadioGroupItem value={option} id={`correct-${option}`} />
                      <Label htmlFor={`correct-${option}`}>{option}</Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            </div>

            <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="shuffle">問題シャッフル</Label>
                <p className="text-sm text-muted-foreground">受験者ごとに問題順序をランダムに変更</p>
              </div>
              <Switch id="shuffle" checked={shuffle} onCheckedChange={setShuffle} />
            </div>

            <Button className="w-full" size="lg">
              <Plus className="w-4 h-4 mr-2" />
              問題を追加
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>登録済み問題</CardTitle>
            <CardDescription>現在100問が登録されています</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center text-muted-foreground py-8">問題リストはここに表示されます</div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
