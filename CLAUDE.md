# CLAUDE.md — OSCEシステム (Digital Marksheet UI) 開発ガイド

本ファイルは Claude(Claude Code / Cowork どちらでも)が本リポジトリで作業する際の最重要コンテキストです。新セッション開始時に最初に読み込んでください。**Claude Code では `HANDOVER_TO_CLAUDE_CODE.md` も併せて読んでください**。

> **2026-05-04 全面書き直し**: 旧版は Cowork mount の Edit 不具合で末尾が `# 1. セッシ�` で文字化け truncate していた(origin/main も同状態)。bash heredoc で全文を再生成し、Cowork 専用の git 回避策(`GIT_DIR=/tmp/osce-git-<tag>` など)を削除して Claude Code でそのまま使える内容に整備した。

---

## 0. プロジェクト概要

**Digital Marksheet Exam System** — 大学医学部・歯学部の OSCE(客観的臨床能力試験)を運用する Web アプリ。元は v0.app で生成され、Vercel にホスト、GitHub と自動同期されている。Claude (Cowork) で 2026-04-25 から継続開発、2026-05-04 から Claude Code への移行を開始。

| 項目 | 値 |
|---|---|
| GitHub | https://github.com/EDIAND-inc/eqio-osce |（2026-09-10 に `YoshikiSoeda/v0-digital-marksheet-ui` から組織へ移管・改名。旧URLは自動リダイレクト）
| 本番 URL | https://v0-digital-marksheet-ui.vercel.app |
| Vercel project | `yoshikis-projects-25d1c165/v0-digital-marksheet-ui` |
| Supabase project | `isvqqswuzpxyuciocozt`(`ediand-osce-system`、ap-northeast-1) |
| 作業フォルダ | `C:\Users\yoshi\Documents\Project\OSCEシステム`(Windows、canonical) |
| 廃止フォルダ | `C:\Users\yoshi\Documents\Claude\Projects\OSCEシステム`(2026-04-25 以前。参照禁止) |
| 想定利用機関 | 昭和医科大学 歯学部 (`dentshowa`)、神奈川歯科大学 (`kanagawadent`)、株式会社 EDIAND (`ediand`、通しテスト用 seed) |

---

## 1. 技術スタック

| 項目 | 内容 |
|---|---|
| フレームワーク | **Next.js 16.0.10** (App Router) |
| ランタイム | React 19.2.0, TypeScript 5 |
| スタイル | Tailwind CSS 4.1.9 + tailwindcss-animate + `tw-animate-css` |
| UI | shadcn/ui (Radix UI ベース) + lucide-react |
| BaaS | **Supabase** (PostgreSQL) — `@supabase/ssr` 0.8.0, `@supabase/supabase-js` 2.86.0。Supabase Auth は未使用、独自 Cookie 認証 |
| フォーム | react-hook-form + zod |
| グラフ | recharts |
| アナリティクス | `@vercel/analytics` |
| パッケージマネージャ | **pnpm**(`pnpm-lock.yaml` あり) |
| デプロイ | Vercel(GitHub `main` への merge で自動デプロイ) |

> **補足**: 本リポジトリは Node/TypeScript プロジェクトであり依存は pnpm で管理する。Python ベースの補助スクリプトを後から追加する場合は **uv** で管理する(ユーザー方針)。

---

## 2. 開発コマンド

```bash
pnpm install                # 依存インストール
pnpm dev                    # ローカル起動 (http://localhost:3000)
pnpm build                  # 本番ビルド(型エラーで失敗、Vercel と同条件)
pnpm start                  # 本番ビルド起動
pnpm lint                   # ESLint
pnpm exec tsc --noEmit      # 型チェックのみ(build せずに)
```

### Git ブランチ運用

- 直接 `main` には push しない。**`claude/<topic>` ブランチを切って PR 経由で反映**。
- V0(v0.app)の自動 push と衝突する可能性があるため、`main` は常に GitHub 経由で更新する。
- DB 変更(`scripts/*.sql`)を伴う PR は、本番 DB への apply を Supabase MCP `apply_migration` で先に実施 → コード PR を merge する流れ(PR #64 などで実証)。

---

## 3. 環境変数

`.env.local`(未コミット、`.gitignore` 済)に以下を設定。Vercel 側も同じ 4 つを設定済み。

| 変数名 | 用途 | スコープ |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL | client + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon キー | client + server |
| `SUPABASE_SERVICE_ROLE_KEY` | service role キー(API ルートからの管理操作) | **server only** |
| `SUPABASE_URL` | 一部 API ルートで参照(基本は `NEXT_PUBLIC_SUPABASE_URL` と同値) | server |

> Supabase クライアントは `app/api/*/route.ts`(service role)に集約。`lib/supabase/{server,client}.ts` は両方とも 2026-05-08 に削除済(client.ts は PR #96、server.ts は本 cleanup PR)。

---

## 4. ディレクトリ構成(2026-05-04 ADR-007 Phase C-5 完了時点)

```
.
├── app/                                                # Next.js App Router
│   ├── login/page.tsx                                  # 共通ログイン(Phase 9d-1)
│   ├── api/
│   │   ├── auth/{login,logout,me,reset-password}/      # 統合認証(Phase 9b-α)
│   │   ├── admin/register-{teachers,patients}/         # 一括登録 + Y-2 スコープ(Phase 8c)
│   │   ├── teachers/{route.ts,[id]/}                   # canonical + assignments JOIN(ADR-007 C-2)
│   │   ├── patients/                                   # 同上
│   │   ├── students/                                   # canonical + assignments(ADR-004 B-2-b)
│   │   ├── rooms/, tests/, attendance-records/, evaluation-results/
│   │   ├── universities/{[id],bulk}/, subjects/{[id]}/
│   │   └── test-sessions/[id]/{teacher-assignments,patient-assignments}/   # ★ ADR-007 C-5
│   ├── admin/
│   │   ├── layout.tsx                                  # AppShell + AdminTopNav
│   │   ├── dashboard/, master-management/, account-management/
│   │   ├── users/{new,page.tsx}                        # 統合登録 + 教員/患者役タブ一覧(B1)
│   │   ├── test-sessions/[id]/assignments/             # ★ ADR-007 C-5 試験セッション割当管理
│   │   ├── teachers-list/, patients-list/, students-list/, students-detail/
│   │   ├── register-{students,teachers,patients}/      # 過去学生 bulk assign は students の第3タブ(B-2-d)
│   │   ├── question-management/{create,edit/[id]}/
│   │   ├── room-management/, subject-management/, university-management/
│   │   └── settings/
│   ├── teacher/{layout.tsx,exam-info,exam,results}/
│   ├── patient/{layout.tsx,exam-info,exam,results}/
│   ├── reset-password/, privacy/, terms/, page.tsx, layout.tsx
│   └── globals.css
├── components/
│   ├── app-shell.tsx                                   # 共通シェル(右 outline 戻るボタン)
│   ├── admin-top-nav.tsx                               # 5 タブ水平ナビ(subject_admin は 4 タブ)
│   ├── unified-login-form.tsx
│   ├── unified-user-registration-form.tsx
│   ├── exam-session-banner.tsx                         # 経過時間 + 残り時間プログレスバー(C3)
│   ├── admin-dashboard.tsx, admin-settings.tsx
│   ├── exam-results-screen.tsx
│   ├── test-selection-screen.tsx
│   ├── teacher-exam-tabs.tsx, patient-exam-tabs.tsx    # 評価入力 UI(F4 で統合候補)
│   ├── test-session-assignment-manager.tsx             # ★ ADR-007 C-5 割当管理 UI
│   ├── question-{create,edit,management}.tsx
│   ├── room-management.tsx, subject-management.tsx, university-management.tsx
│   ├── {teacher,student,patient-role}-registration.tsx
│   ├── reset-password-form.tsx
│   └── ui/                                             # shadcn/ui プリミティブ
├── lib/
│   ├── types.ts                                        # 全型集約
│   ├── data-storage.ts                                 # deprecated shim(後方互換のみ、9c-5)
│   ├── passing.ts                                      # passing_score % 算出(ADR-006)
│   ├── api/
│   │   ├── _shared.ts                                  # getServiceClient + requireAdmin
│   │   ├── teachers.ts, patients.ts, students.ts
│   │   ├── rooms.ts, tests.ts, attendance-records.ts, evaluation-results.ts
│   │   ├── test-sessions.ts, subjects.ts
│   │   └── README.md
│   ├── auth/
│   │   ├── api-guard.ts                                # requireAdmin + getSubjectScope + rejectIfOutsideSubjectScope (Y-2)
│   │   ├── http-cookie.ts, verify.ts, session.ts, use-session.ts
│   ├── (lib/supabase/ は 2026-05-08 撤去済: server.ts / client.ts ともゼロ参照だった)
│   └── utils.ts
├── hooks/use-toast.ts
├── middleware.ts                                       # Cookie ベース 401 ガード + /admin/* admin ロール限定 (R3-1)
├── scripts/                                            # Supabase SQL マイグレーション(連番管理 001〜229)
├── docs/adr/                                           # ★ ADR-001 〜 ADR-007
├── public/, styles/
├── package.json, pnpm-lock.yaml, tsconfig.json
├── next.config.mjs                                     # ⚠ typescript.ignoreBuildErrors: false 化済(Phase 6)
├── CLAUDE.md                                           # ← 本ファイル
├── HANDOVER.md                                         # 直近 Cowork セッションの引継ぎ(2026-05-03 までの詳細)
└── HANDOVER_TO_CLAUDE_CODE.md                          # Claude Code 移行向け引継ぎ(2026-05-04 作成)
```

---

## 5. 認証 / 認可モデル

**Supabase Auth は使用しない**。共通 `/login` 画面 → `/api/auth/login` がサーバー側で 3 テーブル(`admins` / `teachers` / `patients`)を照合し、HttpOnly Cookie に claim(role / accountType / universityCode / subjectCode)を発行。

### 5.1 ログイン入口は `/login` に統一(ADR-001 §7-1)

- `/admin/login`、`/teacher/login`、`/patient/login` は **301 redirect → `/login`**(`next.config.mjs`)
- `/api/auth/login` の入力は `{ loginId, password, testSessionId? }`(loginId は email でなく user 識別子)
- セッション情報は `loginInfo` Cookie に保持。クライアント側は `lib/auth/use-session.ts` の `useSession()` で claim 取得

### 5.2 ミドルウェアガード(`middleware.ts`)

- `/api/*`、`/admin/*`、`/teacher/*`、`/patient/*` に `loginInfo` Cookie 必須
- **`/admin/*` は admin 権限ロールのみ**(`master_admin` / `university_admin` / `subject_admin` / `admin` / `special_master` / `university_master`)
- 一般教員・患者役が `/admin/*` に到達したら `/teacher/exam-info` または `/patient/exam-info` に redirect

### 5.3 ロール体系

| 種別 | テーブル | role / account_type 値 | 権限の階層 |
|---|---|---|---|
| 管理者 | `admins` | `special_master`, `university_master`, `admin` | 全大学 / 単一大学 / 一般管理 |
| 教員 | `teachers` | `master_admin`, `university_admin`, `subject_admin`, `general` | 全権 / 大学内全権 / 教科管理 / 一般教員 |
| 患者役 | `patients` | `general`(`admin` は scripts/208 で deprecated) | 1 種のみ |

`subject_admin` は自教科スコープで API/UI が制限される(Y-1, Y-2, Y-3)。

### 5.4 RLS(Row Level Security)

ADR-003 で **全 13 テーブル RLS 有効化済**。すべてのデータアクセスは `app/api/*` の service role 経由に集約されているため、anon ポリシーはほぼ閉じた状態。`hash_password_if_plain` / `update_user_password` / `register_*_bulk` / `register_*_canonical` 等の SECURITY DEFINER 関数は `search_path = public` 固定。

---

## 6. データモデル(canonical + junction、ADR-004 / ADR-007)

```
universities (university_code)
  └─ subjects (subject_code)                            教科。ロール権限の単位にもなる

test_sessions (id, description, test_date, status, duration_minutes, passing_score=%)
  status: not_started | in_progress | completed
  passing_score: 0–100 の % で運用(ADR-006)

-- canonical マスター(永続) --------------------------------------------
students (id, student_id, name, email, department, grade, university_code, subject_code)
  UNIQUE (university_code, student_id)                  ← scripts/216
  legacy 列 test_session_id / room_number は NULLABLE 化済(B-2-a)、application から「読まない・書かない」(B-2-c)

teachers (id, email, name, password, role, account_type, subject_code, university_code)
  UNIQUE (university_code, email)                       ← scripts/223 (ADR-007 C-1)
  test_session_id は NULLABLE 化済 (C-4 / scripts/228)
  assigned_room_number は junction に移行済

patients (id, email, name, password, account_type, university_code)
  UNIQUE (university_code, email)                       ← scripts/224 (ADR-007 C-1)
  test_session_id は NULLABLE 化済 (C-4 / scripts/229)
  assigned_room_number は junction に移行済

rooms (id, room_number, university_code, subject_code, ...)
  UNIQUE (university_code, room_number, subject_code, test_session_id)
  scripts/225 で大学+部屋名の dedup を実施。完全な canonical 化(test_session_id / subject_code 削除)は ADR-007 C-7 の予定。

-- junction(試験セッションへの割当) ------------------------------------
student_test_session_assignments    PK (student_id, test_session_id), room_number     ← scripts/213
teacher_test_session_assignments    PK (teacher_id, test_session_id), assigned_room_number ← scripts/223
patient_test_session_assignments    PK (patient_id, test_session_id), assigned_room_number ← scripts/224

-- 試験運用テーブル -------------------------------------------------------
tests (id, test_session_id, role_type='teacher'|'patient', passing_score, ...)
attendance_records (test_session_id, student_id, ...)
exam_results (test_session_id, student_id, evaluator_type, evaluator_email,
              total_score, max_score, has_alert, evaluations jsonb)
```

### 重要な制約

- 評価結果は `evaluator_type='teacher'` と `'patient'` で別 row。学生1人につき最大2行。
- `exam_results.max_score` は scripts/214(ADR-006)で追加。% 判定の分母として保存。
- `rooms_room_number_key UNIQUE(room_number)` は scripts/212(ADR-005 F2)で DROP 済(複数大学運用のため)。
- ADR-004 / ADR-007 の本質は「人とセッション」の n:m 化。同じ学生・教員・患者役を別セッションに何度でも assign できる。

---

## 7. テストアカウント(production)

### 7.1 共通アカウント(汎用)

| ロール | loginId | Pass | login 後の遷移 |
|---|---|---|---|
| マスター管理者 | `admin` | `admin` | `/admin/dashboard` |
| 大学管理者 | `uni` | `uni` | `/admin/dashboard` |
| 教科管理者 | `kyouka` | `kyouka` | `/admin/dashboard` |
| 一般教員 | `ippan` | `ippan` | `/teacher/exam-info` |
| 患者役 | `kanjya` | `kanjya` | `/patient/exam-info` |

> 全パスワードは bcrypt ハッシュ化済み(Phase 8、2026-04-26)。本番 DB の plaintext_remaining = 0。

### 7.2 dentshowa デモデータ(scripts/222、PR #67)

`showa-t1〜t5`(教員)/ `showa-p1〜p5`(患者役)/ SH001〜SH025(学生 25 名)/ 部屋 S101〜S105 / 「2026年度デモOSCE」セッション。

### 7.3 ediand 通しテスト seed(ADR-005)

| ロール | email | password |
|---|---|---|
| 大学責任者 | `ediand-master@example.com` | `ediand-master` |
| 教科責任者 | `ediand-subject-admin@example.com` | `ediand-subject-admin` |
| 一般教員 | `ediand-t1〜ediand-t3@example.com` | `ediand-t1〜ediand-t3` |
| 患者役 | `ediand-p1〜ediand-p3@example.com` | `ediand-p1〜ediand-p3` |
| 学生 | E001 / E002 / E003 |  |

---

## 8. 主要機能の実装状況(2026-05-04 時点)

| # | 機能 | 主要ファイル | 状態 |
|---|---|---|---|
| 1 | 試験課題・シナリオ管理 | `app/admin/{question-management,subject-management,master-management,university-management,room-management}` / `components/question-*.tsx` | ✅ 安定運用中 |
| 2 | 受験者管理・進行制御 | `app/admin/{users,students-list,patients-list,teachers-list}` / `app/{teacher,patient}/{exam-info,exam}` / `components/{exam-session-banner,test-selection-screen,teacher-exam-tabs,patient-exam-tabs}.tsx` | ✅ 試験セッション割当管理(`/admin/test-sessions/[id]/assignments`)を ADR-007 C-5 で追加 |
| 3 | 評価入力・採点 | `components/{teacher,patient}-exam-tabs.tsx` / `lib/passing.ts` | ✅ % 運用化(ADR-006) |
| 4 | 結果集計・レポート | `app/admin/dashboard` / `app/{teacher,patient}/results` / `components/{admin-dashboard,exam-results-screen}.tsx` | ✅ 部屋別ダッシュボード(出席・完了・アラート・教員/患者別平均・合格者数 % 化済) |
| 5 | 過去学生からの bulk assign | `/admin/register-students` 「過去学生から登録」タブ(B-2-d) | ✅ 大学+学年+教科フィルタ |

---

## 9. SQL マイグレーション

`scripts/` 配下に連番(`001` 〜 `229`)で管理。Supabase ダッシュボードの SQL エディタ、または **Supabase MCP の `apply_migration` / `execute_sql`** で適用する。新規追加は `230_*.sql` から。

| 連番 | 内容 |
|---|---|
| 001-005 | 初期スキーマ(大学・アカウント種別・seed・test_sessions) |
| 100-105 | 本番データ import(大学2校・admin/teachers/rooms/students) |
| 110-111 | 教科(subject)管理追加 |
| 200-204 | test_session 主軸化(test_code 廃止、role_type 追加、UNIQUE) |
| 205-207 | bcrypt + register / password RPC(Phase 8) |
| 208 | patient_admin role 廃止 |
| 209 | RLS 全テーブル ENABLE(Phase 9 RLS、ADR-003) |
| 210 | test_sessions に duration_minutes(C3) |
| 211 | students.grade(B-1) |
| 212 | rooms_room_number_key UNIQUE 削除(ADR-005 F2) |
| 213 | student_test_session_assignments junction(ADR-004 B-2-a) |
| 214 | exam_results.max_score(ADR-006) |
| 215-218 | students canonical 化(重複統合・UNIQUE・backfill・NULLABLE 緩和) |
| 219 | register_student_canonical RPC(B-2-b WRITE) |
| 220 | RPC から legacy 列(test_session_id / room_number)書き込みを除去(B-2-c PR2) |
| 222 | dentshowa デモデータ clean 再構築 |
| 223 | teachers canonical UNIQUE + teacher assignments junction(ADR-007 C-1) |
| 224 | patients canonical UNIQUE + patient assignments junction(ADR-007 C-1) |
| 225 | rooms canonical(大学+部屋名 UNIQUE、subject 別 dedup)(ADR-007 C-1) |
| 226 | register_teachers_bulk RPC を canonical(univ+email)ON CONFLICT に(ADR-007 C-3) |
| 227 | register_patients_bulk RPC を canonical(univ+email)ON CONFLICT に(ADR-007 C-3) |
| 228 | teachers.test_session_id NULLABLE(ADR-007 C-4) |
| 229 | patients.test_session_id NULLABLE(ADR-007 C-4) |
| 231 | 共通テストアカウント seed(kyouka / ippan / kanjya) |
| 232 | attendance_records 旧 UNIQUE (student_id, room_number) DROP(2026-05-07 サマリー画面 0 件表示の根本対策) |
| 233 | rooms.test_session_id NULLABLE + redundant rooms_unique_per_session DROP(ADR-007 C-7 phase 1) |
| 234 | verify_teacher_login / verify_patient_login を junction LEFT JOIN 化(ADR-007 C-6、PR #90) |
| 235 | teacher/patient junction の RLS 有効化 + register_student_canonical の anon/auth EXECUTE 剥奪(advisor cleared、PR #95) |
| 230 | test_sessions.status 列追加(旧 `add-test-session-status.sql` を 2026-05-08 に rename、DDL 内容は無変更) |

### 新規追加ルール

- 1 PR = 1 SQL ファイルが原則(ロールバックが容易)
- ファイル冒頭に「ADR-XXX Phase Y-Z」の参照と「ロールバック手順」を必ず記載
- 本番反映は Supabase MCP `apply_migration` で(`scripts/` への commit はあくまで Git 履歴用)

---

## 10. ADR(Architecture Decision Records)

`docs/adr/` 配下:

| ID | タイトル | Status |
|---|---|---|
| ADR-001 | UI/UX 全面再設計の上位 ADR(共通 `/login` / AppShell / Phase 9) | Accepted |
| ADR-002 | Phase 9c の API 集約方針(anon SELECT 撲滅) | Accepted |
| ADR-003 | Phase 9 RLS の deny-by-default + service role 設計 | Accepted |
| ADR-004 | 学生 canonical 化 + 試験セッション junction | Accepted(B-2-a〜B-2-d 完了。PR3 DROP COLUMN のみ残) |
| ADR-005 | 通しテスト発見事項と修正方針(2026-05-03 EDIAND seed) | Accepted |
| ADR-006 | passing_score % 運用に統一 | Accepted |
| ADR-007 | canonical teacher/patient/room + junction(B-2 と同型を教員・患者役・部屋に展開) | Proposed → 実装中(Phase C-1〜C-5 完了) |

### 10.1 ADR-007 進捗(2026-05-07 時点)

- ✅ **C-1**: junction 新設 + canonical UNIQUE + backfill(scripts/223〜225)
- ✅ **C-2**: `/api/teachers`、`/api/patients` GET を assignments JOIN に切替(PR #73)
- ✅ **C-3**: `register_teachers_bulk` / `register_patients_bulk` を canonical (`univ + email`) ON CONFLICT + assignments に(PR #74)
- ✅ **C-4**: `teachers/patients.test_session_id` を NULLABLE 化(scripts/228, 229)+ 登録 UI から試験セッション選択を削除(PR #75)
- ✅ **C-5**: 試験セッション割当管理ページ + APIs(`/admin/test-sessions/[id]/assignments`、PR #76)
- ✅ **C-6 (部分)**: `/api/rooms` GET を junction 経由に切替(PR #85)。`rooms.test_session_id` NULLABLE + redundant UNIQUE DROP(scripts/233、PR #87)。`verify_teacher_login` / `verify_patient_login` を junction LEFT JOIN 化(scripts/234、PR #90)。POST /api/rooms onConflict を canonical UNIQUE に揃える(PR #91)。canonical fallback の `.order("assigned_room_number")` を `name` に切替(PR #93、C-7 prep)
- ⏳ **C-6 (残)**: `/api/teachers`、`/api/patients`、`/api/teachers/[id]`、`/api/patients/[id]` の canonical fallback で legacy 列を返している箇所(C-7 で行が消えれば自然解消するが、`mapTeacher` / `mapPatient` で空文字 / undefined に揃える整理は別 PR で実施可)
- ⏳ **C-7 段階 1**: `register_teachers_bulk` / `register_patients_bulk` から legacy 列 INSERT を除去(scripts/237.todo 準備済 — PR #103、適用は 2026-05-18 以降)
- ⏳ **C-7 段階 2**: `teachers/patients.test_session_id`、`teachers/patients.assigned_room_number`、`rooms.test_session_id`、`rooms.subject_code` の物理 DROP COLUMN(scripts/238.todo 準備済 — PR #103、scripts/237 適用 1〜2 週後)

### 10.2 ADR-004 進捗(完了)

- ✅ B-2-a: junction 新設 + UNIQUE + backfill + NULLABLE(scripts/213, 215〜218)
- ✅ B-2-b: `/api/students` GET/POST を canonical RPC + assignments に
- ✅ B-2-c: legacy 列(`students.test_session_id` / `room_number`)を読まない・書かない(scripts/220)
- ✅ B-2-d: `/admin/register-students` に「過去学生から登録」タブ(canonical bulk assign)
- ⏳ **B-2-c PR3**: legacy 列の DROP COLUMN(scripts/236 として準備済 — PR #103、副田さんの apply 指示待ち。安全性は本番 DB で検証済)

---

## 11. V0 との関係

- v0.app チャット (`gdrBDtOcIEk`) からの自動 push が GitHub に流れる構成
- Claude 側で `main` へ直接コミットすると V0 自動生成と衝突するリスク → **必ず `claude/<topic>` ブランチを切る**
- 完全に Claude 主軸へ移行する場合は V0 連携を切るか別リポジトリへフォークする判断を要検討

---

## 12. git / ブランチ / PR 運用

- 機能ブランチは `claude/<topic>` 形式(例: `claude/adr-007-phase-c5-assignment-management`)
- main への merge は GitHub の PR 経由。Vercel 自動デプロイ(2-5 分)
- 過去の merge 済ブランチは origin にそのまま残っている(ローカルで掃除しても OK)
- DB 変更を伴う PR は、コードと同 PR にマイグレーションファイルも含める。本番 DB への apply は Supabase MCP `apply_migration` で先に実施 → コード PR を merge する流れ(PR #64 などで実証)

---

## 12-2. バージョン管理 / リリース手順(2026-07-21 v1.0.0 より運用開始)

**v1.0.0 を初回リリースとして、以後セマンティックバージョニングで管理する**(副田さん方針)。

### バージョン番号の上げ方

| 種別 | 例 | 対象 |
|---|---|---|
| **MAJOR** | 1.0.0 → **2**.0.0 | 運用の作法が変わる大きな仕様変更、データ構造の刷新 |
| **MINOR** | 1.0.0 → 1.**1**.0 | 新機能・新しい画面の追加(既存の使い方は変わらない) |
| **PATCH** | 1.0.0 → 1.0.**1** | バグ修正・表示の微調整 |

### バージョンの単一情報源

**`package.json` の `version` だけが正**。`next.config.mjs` がこれを読んで
`NEXT_PUBLIC_APP_VERSION` として配布し、`components/app-version.tsx` が全画面右下に表示する。
**バージョン定数を別ファイルに書き足さないこと**(更新漏れで食い違うため)。

### リリース手順

1. 機能・修正の PR を通常どおり merge する(この時点ではバージョンは上げない)
2. リリースするタイミングで、バージョン上げ用の PR を作る:
   - `package.json` の `version` を更新
   - `CHANGELOG.md` に新しい見出し(`## [x.y.z] - YYYY-MM-DD`)と変更内容を**日本語で**追記
3. その PR を merge
4. merge 後の main にタグを打ち、GitHub Release を作成:
   ```bash
   git fetch origin main
   git tag -a vX.Y.Z <main の最新 SHA> -m "vX.Y.Z"
   git push origin vX.Y.Z
   gh release create vX.Y.Z --title "vX.Y.Z" --notes "(CHANGELOG の該当節)"
   ```
5. Vercel のデプロイ完了後、画面右下の表示が新バージョンになっていることを確認

> 問題が起きた場合は、Vercel のダッシュボードから該当タグ時点のデプロイに
> Instant Rollback できる。タグはその目印として機能する。

---

## 13. 既知の問題・要注意点

1. **`components/exam-screen.tsx` は V0 由来のデッドコード**(2026-04-25 に削除済)。`/student/results` というルートは存在しない
2. **`teacher-exam-tabs.tsx` と `patient-exam-tabs.tsx` の本体ロジック重複** → ADR-001 §1.2 F4。2026-05-08 Phase A.1〜A.3 + Phase B.1 で `lib/exam/utils.ts` + `lib/exam/hooks.ts` + `components/exam-questions-renderer.tsx` に共通要素を抽出、teacher 644→545 / patient 560→450 行に削減。残りは Phase B.2 (StudentTabList) と Phase C (データロード/handler 統合 → 完全 `<ExamTabs role>`)
3. **`next.config.mjs` の `typescript.ignoreBuildErrors`** → Phase 6 で **`false` 化済み**。型エラーは build を落とす(従って `pnpm exec tsc --noEmit` を CI/ローカル両方で回すこと)
4. **README.md は 2026-04-25 にプロジェクト固有版へ差し替え済み**(V0 テンプレではない)
5. **平文パスワードの seed 残骸**(`scripts/102_import_teachers.sql` など)は Phase 8 で全 bcrypt 化、本番 DB の plaintext_remaining=0。SQL ファイル自体の seed は読み物として残置
6. **不要 stub パッケージ(`crypto`/`fs`/`path`)は削除済み**(2026-04-25)

---

## 14. 関連ファイル(セッション開始時に読むべきもの)

| ファイル | 役割 |
|---|---|
| `CLAUDE.md`(本ファイル) | プロジェクト全体のコンテキスト・規約・現状 |
| `HANDOVER_TO_CLAUDE_CODE.md` | Claude Code への移行向け詳細引継ぎ(2026-05-04) |
| `HANDOVER.md` | 直近 Cowork セッション(〜2026-05-03)の状態スナップショット |
| `docs/adr/ADR-*.md` | 技術判断の根拠 |
| `lib/api/README.md` | API 集約方針(ADR-002 補足) |
| `lib/passing.ts` | % 合否判定ロジック(ADR-006) |
| `lib/auth/api-guard.ts` | ロール判定とサブジェクトスコープ(Y-1〜Y-3) |

---

## 15. ライセンス / 機密性

- リポジトリは public(2026-04-25 確認)
- 本番 DB のテストアカウント(`admin` / `uni` / `kyouka` / `ippan` / `kanjya`、`showa-t1〜t5` など)は弱パスワードを使ったデモ用。実顧客運用前に強パスワード化 + Supabase Auth 移行(Phase 11 候補)が必要
