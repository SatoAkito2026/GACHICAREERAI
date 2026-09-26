-- 1. feature_usage_counters
CREATE TABLE IF NOT EXISTS public.feature_usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  window_type TEXT NOT NULL CHECK (window_type IN ('day', 'month')),
  window_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, feature_key, window_key)
);
CREATE INDEX IF NOT EXISTS idx_feature_usage_counters_user
  ON public.feature_usage_counters (user_id, feature_key);
GRANT SELECT ON public.feature_usage_counters TO authenticated;
GRANT ALL ON public.feature_usage_counters TO service_role;
ALTER TABLE public.feature_usage_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feature_usage_counters_select_own"
  ON public.feature_usage_counters FOR SELECT
  USING (auth.uid() = user_id);

-- 2. career_chat_sessions / career_chat_messages
CREATE TABLE IF NOT EXISTS public.career_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('individual', 'student')),
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.career_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.career_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_career_chat_sessions_user
  ON public.career_chat_sessions (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_career_chat_messages_session
  ON public.career_chat_messages (session_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.career_chat_sessions TO authenticated;
GRANT ALL ON public.career_chat_sessions TO service_role;
GRANT SELECT, INSERT ON public.career_chat_messages TO authenticated;
GRANT ALL ON public.career_chat_messages TO service_role;
ALTER TABLE public.career_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "career_chat_sessions_all_own"
  ON public.career_chat_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "career_chat_messages_select_own"
  ON public.career_chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.career_chat_sessions s
      WHERE s.id = career_chat_messages.session_id AND s.user_id = auth.uid()
    )
  );
CREATE POLICY "career_chat_messages_insert_own"
  ON public.career_chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.career_chat_sessions s
      WHERE s.id = career_chat_messages.session_id AND s.user_id = auth.uid()
    )
  );

-- 3. self_analysis_reports
CREATE TABLE IF NOT EXISTS public.self_analysis_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('individual', 'student')),
  report_type TEXT NOT NULL CHECK (report_type IN ('basic', 'detailed')),
  based_on_interview_id UUID REFERENCES public.interviews(id) ON DELETE SET NULL,
  strengths TEXT[],
  weaknesses TEXT[],
  concerns TEXT,
  appeal_points TEXT[],
  suited_jobs JSONB,
  raw_content JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_self_analysis_reports_user
  ON public.self_analysis_reports (user_id, created_at DESC);
GRANT SELECT, DELETE ON public.self_analysis_reports TO authenticated;
GRANT ALL ON public.self_analysis_reports TO service_role;
ALTER TABLE public.self_analysis_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "self_analysis_reports_select_own"
  ON public.self_analysis_reports FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "self_analysis_reports_delete_own"
  ON public.self_analysis_reports FOR DELETE
  USING (auth.uid() = user_id);

-- 4. generated_documents
CREATE TABLE IF NOT EXISTS public.generated_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('individual', 'student')),
  doc_type TEXT NOT NULL,
  template TEXT,
  title TEXT,
  input_data JSONB,
  generated_content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_generated_documents_user
  ON public.generated_documents (user_id, doc_type, created_at DESC);
GRANT SELECT, DELETE ON public.generated_documents TO authenticated;
GRANT ALL ON public.generated_documents TO service_role;
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "generated_documents_select_own"
  ON public.generated_documents FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "generated_documents_delete_own"
  ON public.generated_documents FOR DELETE
  USING (auth.uid() = user_id);

-- 5. onboarding_answers
CREATE TABLE IF NOT EXISTS public.onboarding_answers (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('individual', 'student')),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_answers TO authenticated;
GRANT ALL ON public.onboarding_answers TO service_role;
ALTER TABLE public.onboarding_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "onboarding_answers_all_own"
  ON public.onboarding_answers FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. daily_question_bank
CREATE TABLE IF NOT EXISTS public.daily_question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL CHECK (mode IN ('individual', 'student', 'both')),
  category TEXT NOT NULL,
  question_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.daily_question_bank TO authenticated;
GRANT ALL ON public.daily_question_bank TO service_role;
ALTER TABLE public.daily_question_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_question_bank_select_all"
  ON public.daily_question_bank FOR SELECT
  USING (true);

-- 7. daily_question_assignments
CREATE TABLE IF NOT EXISTS public.daily_question_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_date DATE NOT NULL,
  question_ids UUID[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, assignment_date)
);
GRANT SELECT ON public.daily_question_assignments TO authenticated;
GRANT ALL ON public.daily_question_assignments TO service_role;
ALTER TABLE public.daily_question_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_question_assignments_select_own"
  ON public.daily_question_assignments FOR SELECT
  USING (auth.uid() = user_id);

-- 8. daily_question_responses
CREATE TABLE IF NOT EXISTS public.daily_question_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.daily_question_bank(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  answered_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_question_responses_user
  ON public.daily_question_responses (user_id, answered_on DESC);
GRANT SELECT, INSERT ON public.daily_question_responses TO authenticated;
GRANT ALL ON public.daily_question_responses TO service_role;
ALTER TABLE public.daily_question_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_question_responses_select_own"
  ON public.daily_question_responses FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "daily_question_responses_insert_own"
  ON public.daily_question_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 9. daily_reminder_preferences
CREATE TABLE IF NOT EXISTS public.daily_reminder_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  send_hour INTEGER NOT NULL DEFAULT 20 CHECK (send_hour BETWEEN 0 AND 23),
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_reminder_preferences TO authenticated;
GRANT ALL ON public.daily_reminder_preferences TO service_role;
ALTER TABLE public.daily_reminder_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_reminder_preferences_all_own"
  ON public.daily_reminder_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 10. user_career_profiles
CREATE TABLE IF NOT EXISTS public.user_career_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('individual', 'student')),
  basic_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  education_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  work_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  skills TEXT[],
  extracurricular_activities JSONB NOT NULL DEFAULT '[]'::jsonb,
  desired_schools JSONB NOT NULL DEFAULT '[]'::jsonb,
  desired_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  self_pr TEXT,
  profile_completion_percent INTEGER NOT NULL DEFAULT 0 CHECK (profile_completion_percent BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_career_profiles TO authenticated;
GRANT ALL ON public.user_career_profiles TO service_role;
ALTER TABLE public.user_career_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_career_profiles_all_own"
  ON public.user_career_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 11. user_devices
CREATE TABLE IF NOT EXISTS public.user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_user_devices_user_active
  ON public.user_devices (user_id) WHERE is_active = true;
GRANT SELECT, UPDATE, DELETE ON public.user_devices TO authenticated;
GRANT ALL ON public.user_devices TO service_role;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_devices_select_own"
  ON public.user_devices FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "user_devices_update_own"
  ON public.user_devices FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_devices_delete_own"
  ON public.user_devices FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at トリガー
CREATE TRIGGER update_feature_usage_counters_updated_at BEFORE UPDATE ON public.feature_usage_counters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_career_chat_sessions_updated_at BEFORE UPDATE ON public.career_chat_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_generated_documents_updated_at BEFORE UPDATE ON public.generated_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_onboarding_answers_updated_at BEFORE UPDATE ON public.onboarding_answers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_daily_reminder_preferences_updated_at BEFORE UPDATE ON public.daily_reminder_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_career_profiles_updated_at BEFORE UPDATE ON public.user_career_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();