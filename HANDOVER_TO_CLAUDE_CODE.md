# Claude Code 引継ぎ資料 — OSCEシステム

| 項目 | 値 |
|---|---|
| 作成日 | 2026-05-04 |
| 引継ぎ元 | Claude Cowork(〜2026-05-04 セッション)|
| 引継ぎ先 | Claude Code(本リポジトリで継続開発する Claude / ユーザー)|
| プロジェクト | Digital Marksheet Exam System(OSCE)|
| リポジトリ | https://github.com/YoshikiSoeda/v0-digital-marksheet-ui |
| 作業フォルダ | `C:\Users\yoshi\Documents\Project\OSCEシステム` |

---

## 0. Claude Code 開始時の最短手順

1. **作業フォルダ**で Claude Code を起動:
   ```powershell
   cd C:\Users\yoshi\Documents\Project\OSCEシステム
   claude
   ```
2. Claude に以下を読ませる:
   - `CLAUDE.md`(プロジェクト全体のコンテキスト)
   - 本ファイル `HANDOVER_TO_CLAUDE_CODE.md`
   - 必要に応じて `HANDOVER.md`(Cowork 時代の Phase 7〜9d 詳細履歴)
   - `docs/adr/ADR-001`〜`ADR-007`(設計判断の根拠)
3. **最初に必ず `git pull origin main`**(下記 §1 参照、ローカルが origin より遅れている)。
4. `pnpm install` → `pnpm exec tsc --noEmit` → `pnpm dev` で動作確認。
5. 着手するタスクは §6「残課題」を参照。

---

## 1. ⚠️ 最重要: ローカルが origin/main より遅れている

Cowork セッションで CodeMirror / Supabase MCP / GitHub Web UI を併用してコード変更してきたため、**Windows ローカルフォルダの内容は origin/main より古い**。Claude Code 開始時に必ず同期する:

```powershell
cd C:\Users\yoshi\Documents\Project\OSCEシステム
git status                 # ローカル差分を確認(未コミット差分があれば事前 stash)
git fetch origin
git log HEAD..origin/main --oneline    # origin にあってローカルにない commit 一覧
git pull origin main       # 取込み
pnpm install               # lockfile が更新されているので再 install
```

**取り込まれる主な差分**:
- `scripts/220, 222-229`(ADR-004 PR2 + dentshowa seed + ADR-007 Phase C-1〜C-4)
- `docs/adr/ADR-007-canonical-teacher-patient-room.md`
- `app/admin/test-sessions/[id]/assignments/`(ADR-007 C-5 で新設、試験セッション割当管理画面)
- `app/api/teachers`, `app/api/patients` の assignments JOIN 経由化(ADR-007 C-2)
- `lib/passing.ts`(ADR-006 % 運用)
- 各種 UI 修正(R-2-F6-2 で passing_score 入力を %、R3-1 admin ロール限定 middleware など)

---

## 2. プロジェクトの現状(2026-05-04 終端)

### 2.1 完了済みフェーズ

| フェーズ | 概要 |
|---|---|
| Phase 1〜6 | 型エラー一掃 + ignoreBuildErrors=false 化 |
| Phase 7 / 7-fix | middleware 認証ガード(API + 画面) |
| Phase 8 / 8b / 8c | bcrypt パスワード化 + サーバー認証 API + register-* /api 化 |
| Phase 9a〜9d | UI/UX 全面再設計、共通 `/login`、AppShell、AdminTopNav |
| Phase 9 RLS | 13 テーブル ENABLE RLS + service role 経由化(ADR-003) |
| HOTFIX-1, HOTFIX-2 | RLS regression / redirect ループ対応 |
| Y-Phase | subject_admin 自教科スコープ(Y-1 UI 解放、Y-2 API ガード、Y-3 設定アクセス) |
| C3 | 試験セッション制限時間 + 残り時間プログレスバー |
| **ADR-004 B-2-a〜B-2-d** | **学生 canonical 化 + assignments junction**(残: PR3 DROP COLUMN) |
| **ADR-006** | **passing_score を % 運用に統一** |
| **ADR-007 Phase C-1〜C-5** | **教員/患者役/部屋の canonical 化 + assignments + 割当管理画面** |
| dentshowa seed | デモデータ clean 再構築(部屋 5 / 教員 5 / 患者役 5 / 学生 25)|

### 2.2 本番健全性

- Vercel production: **緑デプロイ継続中**(https://osce.eqio.jp ／ 旧 v0-digital-marksheet-ui.vercel.app は自動転送)
- Supabase advisor: ERROR 0 / WARN 0 / INFO 13(deny-by-default の意図通り)
- 全データアクセスは `app/api/*` 経由(service role)。anon SELECT/UPSERT は DB 側でゼロ
- 認証は HttpOnly Cookie + middleware ガード(統一 `/api/auth/login`)
- `tsc --noEmit` 0 errors / `next build` 緑

### 2.3 ロール体系(変更なし)

| 種別 | テーブル | role / account_type 値 |
|---|---|---|
| 管理者 | `admins` | `special_master`, `university_master`, `admin` |
| 教員 | `teachers` | `master_admin`, `university_admin`, `subject_admin`, `general` |
| 患者役 | `patients` | `general`(`admin` は 2026-05-02 廃止) |

### 2.4 テストアカウント(production)

| ロール | ID | Pass |
|---|---|---|
| マスター管理者 | `admin` | `admin` |
| 大学管理者 | `uni` | `uni` |
| 教科管理者 | `kyouka` | `kyouka` |
| 一般教員 | `ippan` | `ippan` |
| 患者役 | `kanjya` | `kanjya` |
| 昭和歯科 教員 | `showa-t1`〜`showa-t5` | 同 |
| 昭和歯科 患者役 | `showa-p1`〜`showa-p5` | 同 |

---

## 3. Cowork → Claude Code 移行ガイド

### 3.1 削除して良い Cowork 固有の運用ルール

Claude Code は Windows のローカル FS に直接アクセスするため、Cowork の以下の制約・回避策はすべて**不要**:

| Cowork 時代の制約 | Claude Code での扱い |
|---|---|
| マウント上の `.git` が壊れる(`config.lock` rename 不整合)| 通常の git が動く。ローカル `.git` をそのまま使える |
| `GIT_DIR=/tmp/osce-git-<tag>` 分離ラッパー | **不要**。`git status`、`git commit`、`git push` をそのまま実行 |
| `/tmp/git-osce.sh` ラッパー | **不要** |
| `/tmp/osce-clone-<tag>` での fresh clone | **不要**。ローカルワークツリーで pnpm install / tsc / next build できる |
| Edit/Write ツールの NULL バイトパディング | **発生しない**。Claude Code の Edit はローカル FS を直接書く |
| bash mount truncation(`cat` が短く返す)| **発生しない** |
| ファイル削除不可問題 | **解消**。`rm` / `git rm -r` 普通に動く |
| トリガーフレーズ「OSCEシステム作業を再開、git ラッパーをセットアップして」 | **失効**。Cowork のためだけのショートカット |

### 3.2 引き継ぐべきルール(Claude Code でも有効)

- **必ず `claude/<topic>` ブランチを切る**(V0 自動 push との衝突を避けるため)
- **PAT はユーザー発行 → Claude 使用 → 即 revoke** の運用ルール
  - `git push -u <PAT付URL>` は **絶対に避ける**(branch tracking に PAT が永続化)
  - 詳細: §3.3
- **Supabase MCP で本番 DB を直接触れる**(`apply_migration` / `execute_sql` / `get_advisors`)
  - プロジェクト ID: `isvqqswuzpxyuciocozt`
  - Claude Code でも同じ MCP サーバを設定すれば同等に使える(後述)
- **ADR ベースで判断を残す**。新しい構造変更は `docs/adr/ADR-008-*.md` から起票
- **新規 SQL マイグレーションは `scripts/230_*.sql` から**(連番予約済)
- **平文パスワードの seed 残骸**(`scripts/102_import_teachers.sql` 等)を後続のマイグで触らないこと(本番は bcrypt 化済み、SQL ファイルは履歴として残置)

### 3.3 PAT 運用(Claude Code でもそのまま適用)

```powershell
# push のみ:
git push https://x-access-token:${PAT}@github.com/YoshikiSoeda/v0-digital-marksheet-ui.git claude/<branch>

# 終わったら即:
git remote set-url origin https://github.com/YoshikiSoeda/v0-digital-marksheet-ui.git
$env:PAT = $null   # PowerShell の場合
```

- **`-u` を付けない**(branch.<name>.remote に PAT が残る)
- もし `-u` を付けてしまったら:
  ```powershell
  git config --unset branch.<branch>.remote
  git config --unset branch.<branch>.merge
  git fetch origin
  git branch --set-upstream-to=origin/<branch> <branch>
  ```
- Fine-grained PAT の権限分離(2026-05-04 発見):
  - push のみ → `Contents: Read and write`
  - PR 自動作成も → `Pull requests: Read and write` 追加が必要(403 になる)
  - 一発で済ませたいなら classic PAT(`repo` scope)が確実

### 3.4 Supabase MCP の Claude Code 設定

Cowork セッションでは MCP が自動接続されていたが、Claude Code では `~/.claude.json` などで設定が必要。設定方法は Anthropic 公式ドキュメント(https://docs.claude.com/en/docs/claude-code/mcp )を参照。**Claude Code に切替後、最初に `mcp` コマンドで Supabase MCP の有無を確認**してから、本番 DB 操作を伴うタスクを始めること。

---

## 4. リポジトリ構成サマリ(詳細は CLAUDE.md)

```
.
├── app/                  # Next.js App Router(/admin /teacher /patient + API)
├── components/           # ドメインコンポーネント + shadcn/ui
├── lib/                  # 型・API helper・auth・util
├── hooks/                # use-toast
├── middleware.ts         # 認証ガード(/api/* /admin/* /teacher/* /patient/*)
├── scripts/              # Supabase SQL(001-229 + add-test-session-status.sql)
├── docs/adr/             # ADR-001 〜 ADR-007
├── public/, styles/
└── CLAUDE.md / HANDOVER.md / HANDOVER_TO_CLAUDE_CODE.md
```

---

## 5. 設計上の重要ポイント(把握必須)

### 5.1 Canonical + Junction(ADR-004 / ADR-007)

学生 / 教員 / 患者役 / 部屋 の **canonical 行(university 内ユニーク)** と **`*_test_session_assignments` junction テーブル** で n:m 関係を表現:

- canonical 行は人/物そのもの(同じ E001 学生は 1 行のみ、同じ部屋 S101 は 1 行のみ)
- assignments が「どの試験セッションのどの部屋に居るか」を表現
- 同じ人を別セッションに何度でも assign できる
- legacy 列(`students.test_session_id` / `students.room_number` 等)は B-2-c PR2 で書き込みを停止。読み取りも除去済(B-2-c PR1)。物理 DROP は B-2-c PR3(本番 1〜2 週間安定確認後)
- 教員/患者役は ADR-007 C-3 の RPC `register_teachers_bulk` / `register_patients_bulk` で(univ + email)ON CONFLICT に切替済み、C-4 で `test_session_id` を NULLABLE 化

### 5.2 Passing Score は %(ADR-006)

- `tests.passing_score` / `test_sessions.passing_score` の解釈を **% (0-100)** に統一
- `exam_results.max_score` を追加し、% 計算は `lib/passing.ts` の `computePassResult(score, maxScore, passingPercent)`
- UI ラベルは「合格ライン %(0-100)」、placeholder「例: 70」、`max=100`

### 5.3 認証フロー(ADR-001 §7-1)

- 共通 `/login`(ロール選択 UI なし、ID + パスワードのみ)
- サーバーが 3 テーブル順次照合 → claim を HttpOnly Cookie に発行 → `redirectTo` 返却
- subject_admin は `/admin?subject=<code>` 風に絞られた状態へ遷移
- 1 メール = 1 ロール 制約

### 5.4 RLS(ADR-003)

- 13 テーブルすべて `ENABLE ROW LEVEL SECURITY`
- 全 SELECT/UPSERT/DELETE は `app/api/*` の service role 経由のみ通る
- anon key で SELECT が必要になったらまず ADR で deny-by-default 戦略を再検討

---

## 6. 残課題(2026-05-08 更新、優先度順)

### A. DROP COLUMN(段階的に適用)

- **ADR-004 B-2-c PR3**: `students.test_session_id` / `students.room_number` を DROP
  - **scripts/236 が PR #103 で準備済み**(本番安全性検証済 — backfill 完全一致、依存ゼロ、ドライラン OK)
  - 適用条件:scripts/220(2026-04-26 頃 merge、本番 2 週間以上稼働)→ **適用条件 OK**
  - **副田さんの「apply 指示」待ち**

- **ADR-007 C-7 段階 1**: `register_teachers_bulk` / `register_patients_bulk` から legacy 列 INSERT を除去
  - **scripts/237.todo が PR #103 で準備済み**
  - 適用条件:scripts/226-227(2026-05-04 merge)から 1〜2 週後 = **2026-05-18 以降**
  - apply するときは `.todo` 拡張子を取って scripts/237_*.sql に rename + MCP apply

- **ADR-007 C-7 段階 2**: `teachers/patients/rooms` の legacy 列を物理 DROP
  - **scripts/238.todo が PR #103 で準備済み**
  - 適用条件:scripts/237 から 1〜2 週後

### B. ADR-001 §1.2 構造的問題(未対応分)

- **F4 残**: ExamTabs 本体(`teacher-exam-tabs.tsx` 644 行 + `patient-exam-tabs.tsx` 560 行)を `<ExamTabs role>` に統合
  - PR #102 で page wrapper 部分のみ抽出済み(`useExamPageGuard` + `ExamErrorScreen`)
  - 本体は採点 UI で regression リスク高 → ブラウザ smoke test 込みの別 PR で実施
- **F7**: 一覧画面の共通 `<DataTable>` 抽出
  - 対象 4 ファイル合計 2267 行(teachers-list / patients-list / students-list / question-management)
  - 各画面の edit dialog や CSV export が画面固有で、generic な API が複雑になりがち
  - tanstack-table 等のライブラリ導入を含めて改めて scope 設計が必要
- **C4**: アラート集計ロジック UI 強化

### C. クリーンアップ候補

- **A-2**: `lib/data-storage.ts` deprecated shim を 26 caller migrate して削除
  - 機械的だが 26 ファイル touch、別 PR で計画的に進める
- ✅ A-3 `lib/supabase/server.ts` 削除済み(PR #100)
- ✅ A-4 `add-test-session-status.sql` → `scripts/230_*` rename 済み(PR #100)

### D. ADR-001 §7 Open Questions(方針確認のみ)

- §3 `/login` 旧 URL の redirect 永続性(現状 `permanent: true`)
- §4 Server Components シフトの範囲

### D-2. 200 名同時利用に向けた負荷テスト(保留中)

副田さん「夜間に実施するので一旦後回し」(2026-05-13)
- 詳細計画: `docs/operations/load-test-plan.md`
- ツール: k6
- 環境: Supabase Branch + Vercel preview
- 着手タイミング: 本番試験日の 1〜2 週間前

### E. 長期(別 Phase で別 ADR 化推奨)

- **Phase 10 候補**: `password` 列を `admins` / `teachers` / `patients` から別テーブル(`user_credentials`)に分離(ADR-003 §6)
- **Phase 11 候補**: Supabase Auth 移行(独自 Cookie 認証 → JWT/MFA/メール認証)
- **Phase 12 候補**: V0 連携の整理 / 完全 Claude Code 主軸への移行

### F. 最近の修正履歴(参考)

| PR | 内容 | 影響 |
|---|---|---|
| #98 | teachers/patients PATCH/DELETE — email 変更 orphan + patients 削除 silent fail 修正 | 致命バグ |
| #100 | A-3/A-4 cleanup | 軽微 |
| #101 | students PATCH/DELETE — studentId 変更 orphan + 削除 silent fail 修正 | 致命バグ |
| #102 | F4 部分 — exam page wrapper 抽出(295 → 110 行) | refactor |
| #103 | DROP COLUMN 準備(scripts/236 + 237/238 の .todo) | 副田さん確認待ち |

D-audit-2 (2026-05-08): subjects-management / room-management / question-management / university-management の handleDelete はすべて proper な DELETE /api/* 経由 → 同型 silent-fail バグなし。

---

## 7. 動作確認シナリオ(変更後の回帰テスト)

### 7.1 ロール別ログイン + 遷移

1. `admin/admin` → `/admin/dashboard`(5 タブ表示、全大学データ閲覧可)
2. `kyouka/kyouka` → `/admin/dashboard`(4 タブ:マスター管理が非表示、自教科のみ閲覧可)
3. `ippan/ippan` → `/teacher/exam-info`(セッション選択画面)
4. `kanjya/kanjya` → `/patient/exam-info`(セッション選択画面)
5. 不正パスワード → 401 拒否

### 7.2 試験フロー(dentshowa デモデータ)

1. `showa-t1/showa-t1` でログイン → S101 の「2026年度デモOSCE」セッション選択
2. 学生 SH001-SH005 の評価入力(教員側 10 問)
3. ExamSessionBanner に経過時間 + 残り時間プログレスバー表示
4. 保存 → 結果画面で % 表示(passing_score=70%)
5. `showa-p1/showa-p1` で同セッション・同部屋で患者役側 10 問評価
6. `admin/admin` → ダッシュボードで部屋別の合格 %、アラート、平均点を確認

### 7.3 canonical 化の挙動確認

1. `admin` で `/admin/register-students` の第 3 タブ「過去学生から登録」
2. 大学 + 学年 + 教科 で SH001-SH005 を絞り込み → 全員選択 → 別の試験セッションへ assign
3. `students` テーブルの行は増えない(canonical のまま)、`student_test_session_assignments` に 5 行追加されることを Supabase MCP `execute_sql` で確認

### 7.4 削除系の再発防止

1. `admin` で大学管理 → 教科を持つ大学を削除 → 409 エラー(silent failure ではない)
2. 部屋管理で部屋削除 → 実際に消える
3. 問題管理で問題編集 → 保存で alert + 一覧に反映

---

## 8. 直近の主要 PR(2026-05-04 までの参考)

| PR # | branch | 内容 |
|---|---|---|
| #54 | `claude/adr-005-rooms-uniqueness-fix` | 部屋番号大学跨ぎ衝突解消(scripts/212) |
| #55 | `claude/adr-005-r2-batch` | F3〜F8 まとめ(役割ドロップダウン拡張、ADR-004 起票、students-detail 修正、teacher-exam-tabs バグ、room-management subjectCode 補完) |
| #56 | `claude/adr-006-passing-percentage` | F6 passing_score % 化(scripts/214) |
| #58 | `claude/admin-route-admin-only` | middleware で `/admin/*` admin ロール限定 |
| #59 | `claude/adr-006-1b-dashboard-pct` | admin-dashboard 合格判定 % 化 |
| #60 | `claude/adr-004-phase-b2a-canonical-migration` | students canonical 化 DB(scripts/215-218) |
| #61 | `claude/adr-004-phase-b2b-students-read-via-assignments` | /api/students GET assignments JOIN 化 |
| #62 | `claude/adr-004-phase-b2b-students-write-via-rpc` | /api/students POST RPC `register_student_canonical` 化(scripts/219) |
| #63 | `claude/adr-004-phase-b2c-stop-reading-legacy-columns` | application 層から legacy 列読み取り除去 |
| #64 | `claude/adr-004-phase-b2c-rpc-stop-writing-legacy-columns` | RPC 書き込みから legacy 列除去(scripts/220) |
| #65 | `claude/adr-006-passing-percentage`(R-2-F6-2 補修) | 入力 UI を %(0-100)に統一 |
| #66 | `claude/adr-004-phase-b2d-bulk-assign-from-canonical` | 過去学生から bulk assign(register-students 第 3 タブ) |
| #67 | (dentshowa seed) | scripts/222 dentshowa デモデータ clean 再構築 |
| #69 | `claude/elevated-teacher-flexible-room-evaluation` | (ADR-007 起票前の関連修正) |
| #70 | `claude/fix-teacher-patient-registration-require-test-session` | 教員/患者役登録 UI で test session 選択を必須化 |
| #71 | `claude/adr-007-canonical-teacher-patient-room` | ADR-007 起票 |
| #72 | `claude/adr-007-phase-c1-scripts-only` | scripts/223-225(教員/患者役/部屋 canonical UNIQUE + assignments) |
| #73 | `claude/adr-007-phase-c2-teachers-patients-via-assignments` | /api/teachers, /api/patients GET assignments JOIN 化 |
| #74 | `claude/adr-007-phase-c3-canonical-rpcs` | register_teachers_bulk / register_patients_bulk を canonical(univ+email)ON CONFLICT に(scripts/226-227) |
| #75 | `claude/adr-007-phase-c4-nullable-and-ui-cleanup` | teachers/patients.test_session_id NULLABLE 化(scripts/228-229)+ 登録 UI から session 選択を除去 |
| #76 | `claude/adr-007-phase-c5-assignment-management` | 試験セッション割当管理画面新設(`/admin/test-sessions/[id]/assignments`)|

---

## 9. Claude Code 開始時のチェックリスト

```
[ ] cd C:\Users\yoshi\Documents\Project\OSCEシステム
[ ] git status / git fetch origin / git log HEAD..origin/main --oneline
[ ] git pull origin main
[ ] pnpm install
[ ] pnpm exec tsc --noEmit  → 0 errors
[ ] pnpm dev で http://localhost:3000 にアクセス、admin/admin でログイン → /admin/dashboard
[ ] CLAUDE.md と本ファイル(HANDOVER_TO_CLAUDE_CODE.md)を Claude に読ませる
[ ] 必要なら HANDOVER.md と docs/adr/* も
[ ] Supabase MCP の接続を Claude Code 側で設定(本番 DB を触る作業の前)
[ ] 着手するタスクは §6 の優先順から
```

---

## 10. 補足: なぜ Claude Code に移行するか(参考)

Cowork セッションの以下の制約が Claude Code では解消する:

| Cowork での課題 | Claude Code での状態 |
|---|---|
| マウント `.git` 破損で `GIT_DIR=/tmp` 分離が必須 | ローカル `.git` をそのまま使える |
| Edit/Write の NULL バイトパディング(本ファイル CLAUDE.md も Cowork で truncate された)| 発生しない |
| bash mount で `cat` が truncate を返す | 発生しない、`pnpm install` / `next build` がローカルで動く |
| `/tmp` 揮発でセッション毎の再セットアップ | 永続化された `node_modules` / `.next` キャッシュが効く |
| ファイル削除不可で git rm 後に Explorer 削除依頼 | `rm` / `git rm -r` 普通に動く |
| PAT を都度依頼(セッション横断で credentials が持てない)| GitHub CLI の `gh auth login` 等で永続化可能 |
| Supabase MCP は自動接続だが他 MCP は手動 | Claude Code の `~/.claude.json` で永続設定 |

ただし**得られなくなる機能**もある:

- Cowork の作業ログ・引継ぎ memory(本ファイル + CLAUDE.md + ADR で代替)
- ブラウザ/デスクトップ自動化(Claude in Chrome、computer-use)— Claude Code は CLI のみ
- 他 MCP(Slack, Notion, GitHub PR コメント等)— 必要なものだけ Claude Code 側で設定

---

おつかれさまでした。Claude Code への引継ぎはこれで揃っています。
最初のセッションでは **§9 のチェックリスト** を順に消化し、§6 の優先順から着手してください。
