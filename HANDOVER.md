# OSCEシステム — Claude セッション引継ぎ資料

| 項目 | 値 |
|---|---|
| 作成日 | 2026-05-02(Phase 9 完了時点で更新) |
| 引継ぎ元 | Phase 7 / 8 / 8b / 9a / 9b / 9c / 9 RLS / 9d 大半完了セッション |
| 引継ぎ先 | 次セッションの Claude / ユーザー |
| プロジェクト | Digital Marksheet Exam System(OSCE) |

---

## 0. 最重要: 次セッション開始時にやること

**これだけ読めば再開できる**:

1. Cowork で接続するフォルダは **`C:\Users\yoshi\Documents\Project\OSCEシステム`** のみ。旧 `C:\Users\yoshi\Documents\Claude\Projects\OSCEシステム` は廃止
2. 開始したら最初に **`CLAUDE.md`** を読む(プロジェクト全体のコンテキスト)
3. 続けて **本 `HANDOVER.md`** を読む
4. memory の **`project_osce_migration.md`** / **`cowork_git_workaround.md`** / **`project_osce_login_model.md`** / **`feedback_pat_push_branch_tracking.md`** / **`feedback_old_folder_disconnect.md`** が自動で読み込まれる
5. ユーザーがトリガーフレーズ「**OSCEシステム作業を再開、git ラッパーをセットアップして**」と言ったら、確認なしで `/tmp/osce/git.sh`(または同等の wrapper)を再生成する(memory 参照)

---

## 1. プロジェクト概要

- **Repo**: https://github.com/EDIAND-inc/eqio-osce
- **Production**: https://osce.eqio.jp （旧 `v0-digital-marksheet-ui.vercel.app` から自動転送）
- **Tech**: Next.js 16 (App Router) + React 19 + TypeScript 5 + Supabase + Tailwind 4 + shadcn/ui + pnpm
- **Supabase project**: `isvqqswuzpxyuciocozt`(`ediand-osce-system`、ap-northeast-1)
- **想定利用機関**: 昭和医科大学 歯学部 (`dentshowa`)、神奈川歯科大学 (`kanagawadent`) ほか
- **3 ロール構成**: 管理者 / 教員 / 患者役(2026-05-02 で patient_admin 廃止、患者役は general 1 種)
- **権限階層**: master_admin / university_admin / subject_admin / general

## 2. テストアカウント(production)

| ロール | ID | Pass | login 後の遷移 |
|---|---|---|---|
| マスター管理者 | `admin` | `admin` | `/admin/dashboard` |
| 大学管理者 | `uni` | `uni` | `/admin/dashboard` |
| 教科管理者 | `kyouka` | `kyouka` | `/admin/dashboard` |
| 一般教員 | `ippan` | `ippan` | `/teacher/exam-info` |
| 患者役 | `kanjya` | `kanjya` | `/patient/exam-info` |

> 全パスワードは bcrypt ハッシュ化済み(Phase 8、2026-04-26)。
> ログイン入口は **`/login` 1 つだけ**(2026-05-02、Phase 9d-1+2)。

## 3. 完了済み Phase 一覧

| Phase | 内容 | 完了日 |
|---|---|---|
| 1〜4 | 型エラー 66 → 0 | 2026-04-25 |
| 6 | `next.config.mjs` の `ignoreBuildErrors: false` 化 | 2026-04-25 |
| 7 / 7-fix | middleware 認証ガード(API + 画面) | 2026-04-25/26 |
| 8 / 8b / 8c | bcrypt パスワード化 + サーバー認証 API + reset-password 移行 + register-* /api 化 | 2026-04-26 |
| **9a** | クリーンアップ(V0 デッドコード、`[v0]` console.log、stub ルート、ADR-001) | 2026-05-02 |
| **9b-α** | 統合 `/api/auth/login` + `/api/auth/me` + lib/auth/{session,use-session,verify}.ts | 2026-05-02 |
| **9b-β1** | 3 login form を `/api/auth/login` に切替 | 2026-05-02 |
| **9b-β2a-e** | sessionStorage 認可キーを useSession() に置換(全 consumer 移行) | 2026-05-02 |
| **9b-β2f1-3** | 移行漏れ回収 + login form sessionStorage write 削除 + 旧 /api/auth/{admin,teacher,patient}/login 削除 + patient_admin 廃止 | 2026-05-02 |
| **9b-γ** | AppShell 骨格(role-aware ヘッダー) | 2026-05-02 |
| **9c-1** | read API 第1弾(/api/teachers /patients /students) | 2026-05-02 |
| **9c-2** | read API 第2弾(rooms / tests / attendance-records / evaluation-results / test-sessions / subjects)+ ADR-002 | 2026-05-02 |
| **9c-4** | write API 全リソース + lib/data-storage.ts の anon UPSERT/DELETE 撲滅 | 2026-05-02 |
| **9c-5** | 型を lib/types.ts に切り出し + lib/data-storage.ts を deprecated shim 化 | 2026-05-02 |
| **9 RLS** | 13 テーブル ENABLE ROW LEVEL SECURITY + SECURITY DEFINER 関数 EXECUTE REVOKE + search_path 固定 + ADR-003 | 2026-05-02 |
| **9d-1+2** | 共通 `/login` 画面新設 + 旧 URL を 308 redirect | 2026-05-02 |
| **9d-3** | 全画面 AppShell 適用(admin/teacher/patient layout.tsx) | 2026-05-02 |
| **9d-4a** | `/admin/users/new` 統合単一ユーザー登録(役割ドロップダウン) | 2026-05-02 |
| **9d cleanup-1** | 旧ロール別 login 画面/フォーム削除 | 2026-05-02 |
| **9d-exam-banner** | 試験中ヘッダー強化(ExamSessionBanner)+ admin → /teacher/exam-info リンク | 2026-05-02 |
| **HOTFIX-1** | /api/test-sessions を service role に切替(RLS regression) | 2026-05-02 |
| **HOTFIX-2** | /teacher/exam, /patient/exam の useSession キャッシュ race による redirect ループ修正 | 2026-05-02 |
| **AppShell back** | 全画面に履歴戻りボタン追加 | 2026-05-02 |

主要 ADR:
- `docs/adr/ADR-001-ui-ux-redesign.md`(Accepted)— UI/UX 全面再設計の上位 ADR
- `docs/adr/ADR-002-data-access-api-consolidation.md`(Accepted)— Phase 9c の API 集約方針
- `docs/adr/ADR-003-rls-enablement.md`(Accepted)— Phase 9 RLS の deny-by-default + service role 設計

## 4. 現在のプロダクション健全性

- Supabase advisor: **ERROR 0 件 / WARN 0 件**(INFO 13 件は RLS deny-by-default の意図通り、無視可)
- 全データアクセスは `app/api/*` 経由(service role)。anon key の SELECT/UPSERT は DB 側でゼロ
- 認証は HttpOnly Cookie + middleware ガード(統一 `/api/auth/login`)
- UI:
  - `/login` 1 画面で 5 ロールすべてログイン可能
  - 全認証画面に AppShell(ロゴ + ロールバッジ + ログアウト + 履歴戻る)
  - 試験中画面に ExamSessionBanner(セッション名 + 部屋 + 教科 + 経過時間 + 合格ライン)
  - `/admin/users/new` 統合単一ユーザー登録(役割ドロップダウン: 一般教員 / 教科責任者 / 患者役)
  - `/admin/dashboard` から「試験選択画面を開く」で `/teacher/exam-info` 確認可

## 5. 残課題(優先度順)

### A. 即着手可能な小物

- [ ] **マウント側のオーファン削除**(Cowork mount 制約で git rm のみ実施、物理削除は Explorer 操作必要):
  - `app/admin/login/`、`app/teacher/login/`、`app/patient/login/`(Phase 9d cleanup-1 で消した旧 login 画面)
  - `components/admin-login-form.tsx`、`components/teacher-login-form.tsx`、`components/patient-login-form.tsx`(同)
  - `components/exam-info-screen.tsx`、`app/admin/students/`、`app/admin/questions/`(Phase 9a で消したスタブ)

### B. ADR-001 で計画済み・未着手

- [ ] **9d-4b**: `/admin/users` 一覧画面(教員 + 患者役のタブ統合) — 現状 `/admin/teachers-list` と `/admin/patients-list` が分離
- [ ] **9d-5**: URL 再編(`/sessions/[id]/evaluate` 等)— 内部整理メイン

### C. ADR-001 §1.2 構造的問題で未対応

- [ ] **F4**: `teacher-exam-tabs.tsx` と `patient-exam-tabs.tsx` の本体ロジック重複(~500 行 × 2 ファイル)を `<ExamTabs role>` に統合
- [ ] **F7**: 一覧画面の共通 `<DataTable>` 抽出(teachers-list / patients-list / students-list / question-management)
- [ ] **C3**: 試験中の制限時間プログレスバー(現在は経過時間のみ表示)
- [ ] **C4**: アラート集計ロジック UI 強化

### D. ADR-001 §7 Open Questions 残り(方針確認のみで実装不要なもの)

- [ ] §3 `/login` 旧 URL の redirect 永続性(現状 permanent: true、永続)
- [ ] §4 Server Components シフトの範囲

### E. 長期(別 Phase で別 ADR 化推奨)

- [ ] **Phase 10 候補**: `password` 列を `admins` / `teachers` / `patients` から別テーブル(`user_credentials`)に分離(ADR-003 §6)
- [ ] **Phase 11 候補**: Supabase Auth 移行(独自 Cookie 認証 → JWT/MFA/メール認証)

## 6. 重要な運用ノート

### 6.1 Cowork マウント FS の制約

memory `cowork_git_workaround.md` 詳述。要点:
- マウント上に `.git` を置けない → `.git` は `/tmp/osce-git-<session-tag>` に分離
- マウント上のファイルは bash から truncated に見えることがある → ビルド/型チェックは `/tmp/osce-work-<tag>` で fresh clone
- マウント上の既存ファイル変更は `Edit` ツール NULL バイト padding リスク → bash heredoc で全文上書き推奨
- ファイル削除はサンドボックスから不可 → `git rm --cached` で index 更新後、ユーザーに Explorer 削除依頼

### 6.2 git ラッパー(セッション再開時に毎回必要)

memory に保存された雛形。`/tmp` 揮発で毎セッション再生成。トリガーフレーズで自動セットアップ。

### 6.3 PAT 運用ルール

push のたびに **ユーザーが PAT を発行 → Claude が使用 → ユーザーが revoke** の流れ。
- トークン名: `claude-cowork-osce-<phase>-YYYY-MM-DD`
- Permissions: `Contents: Read and write` のみ
- Expiration: 7 days
- 対象リポジトリ: `YoshikiSoeda/v0-digital-marksheet-ui` のみ
- Claude 側は **使用直後に必ず remote URL クリーンアップ + env unset**(PAT を git config やログに残さない)
- `-u` を付けると branch.<name>.remote に PAT が永続化されるので付けない(memory `feedback_pat_push_branch_tracking.md`)

### 6.4 Supabase MCP 接続済み

- ツールプレフィックス: `mcp__0cce0195-825b-4699-9d38-3838e0d9c31d__*`
- 主要ツール: `execute_sql`、`apply_migration`、`list_tables`、`get_advisors`
- プロジェクト ID: `isvqqswuzpxyuciocozt`
- DB 変更は Claude が直接実行可能

### 6.5 Vercel デプロイ

- GitHub main ブランチへの merge で自動デプロイ(2-5分)
- 環境変数(`NEXT_PUBLIC_SUPABASE_URL` 等)は Vercel ダッシュボードで管理

### 6.6 V0 との関係

- v0.app チャット (`gdrBDtOcIEk`) からの自動 push が GitHub に流れる構成
- Claude で main 直接コミット → V0 自動生成と衝突リスク → **必ず `claude/<topic>` ブランチを切る**
- Phase 9 までは衝突なく進行

## 7. ディレクトリ構成(主要のみ、Phase 9 後)

```
app/
├── login/page.tsx              ← 共通ログイン(9d-1)
├── api/
│   ├── auth/{login,logout,me,reset-password}/  ← 統合認証(9b-α)
│   ├── admin/register-{teachers,patients}/     ← bulk 登録(8c)
│   ├── teachers/{route.ts,[id]/}               ← read+write API(9c-1, 9c-4)
│   ├── patients/                               ← 同
│   ├── students/                               ← 同
│   ├── rooms/                                  ← read+write API(9c-2, 9c-4)
│   ├── tests/                                  ← 同
│   ├── attendance-records/                     ← 同
│   ├── evaluation-results/                     ← 同
│   ├── universities/{[id],bulk}/
│   ├── subjects/{[id]}                         ← 9c-4 で bulk upsert 拡張
│   └── test-sessions/{[id]}                    ← HOTFIX-1 で service role 化
├── admin/
│   ├── layout.tsx              ← AppShell wrapper(9d-3)
│   ├── login/