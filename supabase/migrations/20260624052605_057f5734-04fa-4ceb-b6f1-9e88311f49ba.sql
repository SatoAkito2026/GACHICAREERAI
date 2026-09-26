-- ============================================================
-- Critical 1 & 2: profiles の company_id・company_role を
-- 勝手に変更できる問題を修正
-- ============================================================

CREATE OR REPLACE FUNCTION public.restrict_profile_company_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    IF NEW.company_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.companies
        WHERE id = NEW.company_id AND owner_id = auth.uid()
      ) THEN
        RAISE EXCEPTION 'company_id の変更は会社オーナーのみ許可されています';
      END IF;
    END IF;
  END IF;

  IF NEW.company_role IS DISTINCT FROM OLD.company_role THEN
    IF NEW.company_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.companies
        WHERE id = NEW.company_id AND owner_id = auth.uid()
      ) THEN
        RAISE EXCEPTION 'company_role の変更は会社オーナーのみ許可されています';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS check_profile_company_change ON public.profiles;
CREATE TRIGGER check_profile_company_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_profile_company_change();

-- ============================================================
-- Warning 1: screening_candidates に UPDATE ポリシーを追加
-- ============================================================
DROP POLICY IF EXISTS "Users can update their own screening candidates" ON public.screening_candidates;
CREATE POLICY "Users can update their own screening candidates"
  ON public.screening_candidates
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Warning 2: screening_history_legacy に UPDATE ポリシーを追加
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'screening_history_legacy'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can update their own screening history legacy" ON public.screening_history_legacy';
    EXECUTE '
      CREATE POLICY "Users can update their own screening history legacy"
        ON public.screening_history_legacy
        FOR UPDATE
        TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    ';
  END IF;
END $$;

-- ============================================================
-- Warning 3 & 4: SECURITY DEFINER 関数の EXECUTE 権限を剥奪
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.handle_new_user()
  FROM public, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()
  FROM public, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.restrict_profile_company_change()
  FROM public, anon, authenticated;