-- 熊木先生報告: 段階数を6以上にすると、6個目以降の選択肢テキストが入力できない。
-- 原因: 選択肢テキストが option1〜option5 の5列しかなく、6個目以降を持てない。
-- 対応: 可変長の選択肢テキストを jsonb 配列 options で持てるようにする。
--   既存の option1〜5 は互換のため残す(アプリは options を優先、無ければ option1..5)。
--
-- 本番適用: 2026-07-25 Supabase MCP apply_migration (add_question_options_array)。
-- ロールバック: ALTER TABLE questions DROP COLUMN IF EXISTS options;

ALTER TABLE questions ADD COLUMN IF NOT EXISTS options jsonb;
