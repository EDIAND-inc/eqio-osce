-- 2026-11-05 ダッシュボード「担当者ログイン状況(簡易版)」:
--   教員・患者役がログインした最終時刻を記録する列を追加する。
--   ログイン成功時に /api/auth/login が更新し、ダッシュボードで「本日ログイン済み」かを表示する。
--
-- 簡易版の方針:
--   在席ハートビートのような本格実装はしない。last_login_at(最終ログイン時刻)だけを持ち、
--   ダッシュボードは「その時刻が本日かどうか」で ●本日 HH:MM / ○未ログイン を出す。
--
-- 影響:
--   新規列(nullable)のみ。既存テーブル・データ・運用への影響なし。
--
-- ロールバック:
--   ALTER TABLE public.teachers DROP COLUMN IF EXISTS last_login_at;
--   ALTER TABLE public.patients DROP COLUMN IF EXISTS last_login_at;

ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'teachers' AND column_name = 'last_login_at'
  ) THEN
    RAISE EXCEPTION 'Migration failed: teachers.last_login_at not added';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'last_login_at'
  ) THEN
    RAISE EXCEPTION 'Migration failed: patients.last_login_at not added';
  END IF;
  RAISE NOTICE 'OK: last_login_at added to teachers and patients';
END $$;
