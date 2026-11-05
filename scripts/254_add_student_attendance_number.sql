-- 2026-11-05 学生管理: 学籍番号(不変)に加えて「出席番号」を管理する。
--
-- 仕様(副田さんと確定):
--   - 出席番号は学年が変わるため変数。students マスターに単一列 attendance_number として持ち、
--     毎年上書きする(入力があれば上書き・空なら既存維持)。
--   - 入力は任意。同一試験(一覧)内の重複は UI 側で警告のみ(登録は通す)。
--   - 学籍番号(student_id)は不変のキーのまま。
--
-- 影響:
--   - students に nullable 列を追加(既存データ・運用への影響なし)。
--   - register_student_canonical に p_attendance_number(DEFAULT NULL)を追加(9→10引数)。
--     旧9引数版を DROP し、新版を作成。ON CONFLICT 時は COALESCE で「入力時のみ上書き」。
--
-- ロールバック:
--   DROP FUNCTION IF EXISTS public.register_student_canonical(text,text,text,text,text,text,text,uuid,text,text);
--   -- (必要なら scripts/219 + 220 の9引数版を再作成)
--   ALTER TABLE public.students DROP COLUMN IF EXISTS attendance_number;

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS attendance_number text;

DROP FUNCTION IF EXISTS public.register_student_canonical(text,text,text,text,text,text,text,uuid,text);

CREATE OR REPLACE FUNCTION public.register_student_canonical(
  p_student_id        text,
  p_name              text,
  p_email             text,
  p_department        text,
  p_grade             text,
  p_university_code   text,
  p_subject_code      text,
  p_test_session_id   uuid,
  p_room_number       text,
  p_attendance_number text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_student_uuid uuid;
BEGIN
  -- 1. canonical upsert (univ + student_id で一意)
  INSERT INTO public.students (
    student_id, name, email, department, grade,
    university_code, subject_code, attendance_number
  ) VALUES (
    p_student_id, p_name, p_email, p_department, p_grade,
    p_university_code, p_subject_code, p_attendance_number
  )
  ON CONFLICT (university_code, student_id) DO UPDATE SET
    name              = EXCLUDED.name,
    email             = COALESCE(EXCLUDED.email, students.email),
    department        = COALESCE(EXCLUDED.department, students.department),
    grade             = COALESCE(EXCLUDED.grade, students.grade),
    subject_code      = COALESCE(EXCLUDED.subject_code, students.subject_code),
    -- 出席番号: 入力があれば上書き、空(NULL)なら既存値を維持(毎年上書き運用)。
    attendance_number = COALESCE(EXCLUDED.attendance_number, students.attendance_number),
    updated_at        = now()
  RETURNING id INTO v_student_uuid;

  -- 2. assignment upsert (test_session_id があるとき)
  IF p_test_session_id IS NOT NULL THEN
    INSERT INTO public.student_test_session_assignments (
      student_id, test_session_id, room_number
    ) VALUES (
      v_student_uuid, p_test_session_id, p_room_number
    )
    ON CONFLICT (student_id, test_session_id) DO UPDATE SET
      room_number = EXCLUDED.room_number,
      updated_at  = now();
  END IF;

  RETURN v_student_uuid;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.register_student_canonical(text,text,text,text,text,text,text,uuid,text,text) TO service_role;
