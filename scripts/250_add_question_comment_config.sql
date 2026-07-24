-- 熊木先生要望: 設問にコメント入力欄を追加できるようにする。
-- comment_enabled     : この設問にコメント欄を表示するか
-- comment_required_max: 必須にする閾値。選択した配点値がこの値以下ならコメント必須
--                       (例: 概略評定で 1・2 のとき必須 → 2 を設定)。NULL は任意入力。
-- 総評コメント(評価全体で 1 つ)は exam_results.evaluations(jsonb)に
--   'overall_comment' キーで保存するため、DB スキーマ変更は不要。
-- 設問コメントも evaluations に 'comment:<compositeKey>' キーで保存する。
-- 合計点は「数値の値のみ」を集計するようアプリ側を修正済み(文字列コメントは無視)。
--
-- 本番適用: 2026-07-24 Supabase MCP apply_migration (add_question_comment_config)。
-- ロールバック:
--   ALTER TABLE questions DROP COLUMN IF EXISTS comment_enabled;
--   ALTER TABLE questions DROP COLUMN IF EXISTS comment_required_max;

ALTER TABLE questions ADD COLUMN IF NOT EXISTS comment_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS comment_required_max int;
