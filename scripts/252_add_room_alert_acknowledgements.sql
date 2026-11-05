-- 2026-11-05 ダッシュボード「対応済」ボタン: 部屋カードのアラート赤表示を
--   (試験セッション × 部屋) 単位で「対応済」にして解除できるようにする。
--
-- 背景:
--   ダッシュボードの部屋カードは room.alertCount > 0 で赤くなる。運用者が内容を確認して
--   「対応済」にしたら赤を消したい。自動更新が頻繁(15秒)なため、クライアントだけで消すと
--   次の更新で戻ってしまう。そこで解除状態を DB に保存する。
--
-- 設計:
--   赤表示 = alertCount > acknowledged_alert_count。
--   「対応済」押下時に acknowledged_alert_count = 現在の alertCount を保存 → 赤が消える。
--   その後、新たなアラートで alertCount がさらに増えたら再び赤くなる(見落とし防止)。
--   「対応済」を取り消すと acknowledged_alert_count = 0 に戻す。
--
-- 影響:
--   新規テーブルのみ。既存テーブル・既存データ・既存運用への影響なし。
--
-- ロールバック:
--   DROP TABLE public.room_alert_acknowledgements CASCADE;

CREATE TABLE IF NOT EXISTS public.room_alert_acknowledgements (
  test_session_id          uuid NOT NULL REFERENCES public.test_sessions(id) ON DELETE CASCADE,
  room_number              text NOT NULL,
  acknowledged_alert_count int  NOT NULL DEFAULT 0,
  acknowledged_by          text,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (test_session_id, room_number)
);

CREATE INDEX IF NOT EXISTS idx_room_alert_ack_session
  ON public.room_alert_acknowledgements(test_session_id);

-- ADR-003 deny-by-default: RLS 有効化(policy は定義しない = service role 経由のみアクセス)
ALTER TABLE public.room_alert_acknowledgements ENABLE ROW LEVEL SECURITY;

-- 検証
DO $$
DECLARE cnt int;
BEGIN
  SELECT count(*) INTO cnt FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'room_alert_acknowledgements';
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'Migration failed: room_alert_acknowledgements not created';
  END IF;

  SELECT count(*) INTO cnt FROM pg_tables
   WHERE schemaname = 'public' AND tablename = 'room_alert_acknowledgements' AND rowsecurity = true;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'Migration failed: RLS not enabled on room_alert_acknowledgements';
  END IF;

  RAISE NOTICE 'OK: room_alert_acknowledgements created with RLS enabled';
END $$;
