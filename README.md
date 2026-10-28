# OSCEシステム — Digital Marksheet Exam System

大学医学部・歯学部の OSCE(客観的臨床能力試験)を運用するための Web アプリケーションです。試験官・患者役・受験者の3ロールを持ち、試験部屋ごとの進行管理と評価入力、結果集計までをカバーします。

## 主要機能

1. 試験課題・シナリオ管理(大学・教科・部屋・問題)
2. 受験者管理・進行制御(教員/患者役のセッション選択 → 試験情報 → 採点)
3. 評価入力・採点(教員と患者役それぞれの評価項目を別管理、合否判定対応)
4. 結果集計・レポート(部屋別ダッシュボード、出席・完了・平均点・合格者数)

## 技術スタック

| 項目 | 内容 |
| --- | --- |
| フレームワーク | Next.js 16 (App Router) |
| ランタイム | React 19, TypeScript 5 |
| スタイル | Tailwind CSS 4 + shadcn/ui (Radix UI) |
| BaaS | Supabase (PostgreSQL) ※ Auth は未使用 |
| フォーム | react-hook-form + zod |
| グラフ | recharts |
| パッケージマネージャ | pnpm |
| ホスティング | Vercel |

## 開発環境のセットアップ

```bash
pnpm install      # 依存インストール
pnpm dev          # ローカル起動 (http://localhost:3000)
pnpm build        # 本番ビルド
pnpm start        # 本番ビルド起動
pnpm lint         # ESLint
```

## 環境変数

`.env.local` に以下を設定してください(`.env*` は `.gitignore` 済み)。

| 変数名 | 用途 | スコープ |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL | client + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon キー | client + server |
| `SUPABASE_SERVICE_ROLE_KEY` | service role キー(API ルートからの管理操作用) | server only |
| `SUPABASE_URL` | 一部 API ルートで参照(`NEXT_PUBLIC_SUPABASE_URL` と同値で可) | server |

## ディレクトリ構成(概略)

```
.
├── app/            Next.js App Router
│   ├── admin/      管理者画面(special_master / university_master / admin)
│   ├── teacher/    教員画面(master_admin / university_admin / subject_admin / general)
│   ├── patient/    患者役画面(general / admin)
│   └── api/        サーバーサイド API(service role 利用)
├── components/     ドメインコンポーネント
│   └── ui/         shadcn/ui プリミティブ
├── lib/
│   ├── data-storage.ts   全 Supabase 読み書きを集約
│   └── supabase/          client / server クライアント
├── scripts/        Supabase SQL マイグレーション(連番管理: 001, 100, 200 系)
└── public/         静的アセット
```

## 認証 / 認可

Supabase Auth は使用していません。各ロールが個別ログインフォームから email + password を送り、`admins` / `teachers` / `patients` テーブルと突合する独自方式です。ログイン情報は `sessionStorage` 経由で各画面に伝搬し、ロール(`role` / `account_type`)に基づいて画面遷移と権限分岐を行います。

詳細なロール体系・データ階層・運用上の注意点は [`CLAUDE.md`](./CLAUDE.md) を参照してください。

## SQL マイグレーション

`scripts/` 配下に連番(`001_*`, `100_*`, `200_*`, ...)で管理しています。Supabase ダッシュボードの SQL エディタから手動適用する運用です。新規追加時は最後の連番に続けてください(現状 205 番台が次)。

## デプロイ

main ブランチへの push で Vercel が自動デプロイします。プレビューは feature ブランチの push でも生成されます。

- 本番: https://osce.eqio.jp （Vercel ダッシュボード: https://vercel.com/ediand/v0-digital-marksheet-ui）

## ライセンス / 著作権

社内利用前提の非公開プロダクトです。© ediand Inc.
