export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      candidate_profiles: {
        Row: {
          average_score: number | null;
          career_stage: string | null;
          consented_at: string | null;
          created_at: string;
          desired_jobs: string | null;
          desired_locations: string | null;
          display_name: string | null;
          headline: string | null;
          interview_count: number;
          is_public: boolean;
          public_code: string;
          record_practice: boolean;
          self_pr: string | null;
          show_recording: boolean;
          summary: Json | null;
          summary_stale: boolean;
          summary_updated_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          average_score?: number | null;
          career_stage?: string | null;
          consented_at?: string | null;
          created_at?: string;
          desired_jobs?: string | null;
          desired_locations?: string | null;
          display_name?: string | null;
          headline?: string | null;
          interview_count?: number;
          is_public?: boolean;
          public_code?: string;
          record_practice?: boolean;
          self_pr?: string | null;
          show_recording?: boolean;
          summary?: Json | null;
          summary_stale?: boolean;
          summary_updated_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          average_score?: number | null;
          career_stage?: string | null;
          consented_at?: string | null;
          created_at?: string;
          desired_jobs?: string | null;
          desired_locations?: string | null;
          display_name?: string | null;
          headline?: string | null;
          interview_count?: number;
          is_public?: boolean;
          public_code?: string;
          record_practice?: boolean;
          self_pr?: string | null;
          show_recording?: boolean;
          summary?: Json | null;
          summary_stale?: boolean;
          summary_updated_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      contact_messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          read_at: string | null;
          request_id: string;
          sender_user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          request_id: string;
          sender_user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          request_id?: string;
          sender_user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_messages_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "contact_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_requests: {
        Row: {
          candidate_user_id: string;
          company_user_id: string;
          created_at: string;
          id: string;
          message: string;
          responded_at: string | null;
          status: string;
        };
        Insert: {
          candidate_user_id: string;
          company_user_id: string;
          created_at?: string;
          id?: string;
          message?: string;
          responded_at?: string | null;
          status?: string;
        };
        Update: {
          candidate_user_id?: string;
          company_user_id?: string;
          created_at?: string;
          id?: string;
          message?: string;
          responded_at?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      profile_unlocks: {
        Row: {
          amount: number;
          candidate_user_id: string;
          company_user_id: string;
          created_at: string;
          id: string;
          stripe_payment_intent_id: string | null;
        };
        Insert: {
          amount?: number;
          candidate_user_id: string;
          company_user_id: string;
          created_at?: string;
          id?: string;
          stripe_payment_intent_id?: string | null;
        };
        Update: {
          amount?: number;
          candidate_user_id?: string;
          company_user_id?: string;
          created_at?: string;
          id?: string;
          stripe_payment_intent_id?: string | null;
        };
        Relationships: [];
      };
      actor_audition_notes: {
        Row: {
          actor_id: string;
          actual_tickets: number | null;
          audition_date: string | null;
          company_user_id: string;
          created_at: string;
          id: string;
          note: string | null;
          predicted_tickets: number | null;
          updated_at: string;
        };
        Insert: {
          actor_id: string;
          actual_tickets?: number | null;
          audition_date?: string | null;
          company_user_id: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          predicted_tickets?: number | null;
          updated_at?: string;
        };
        Update: {
          actor_id?: string;
          actual_tickets?: number | null;
          audition_date?: string | null;
          company_user_id?: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          predicted_tickets?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "actor_audition_notes_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "actors";
            referencedColumns: ["id"];
          },
        ];
      };
      actor_screening_presets: {
        Row: {
          company_user_id: string;
          created_at: string;
          id: string;
          name: string;
          preferred_conditions: string | null;
          production_title: string | null;
          production_type: string | null;
          required_conditions: string | null;
          role_description: string | null;
          synopsis: string | null;
          updated_at: string;
        };
        Insert: {
          company_user_id: string;
          created_at?: string;
          id?: string;
          name: string;
          preferred_conditions?: string | null;
          production_title?: string | null;
          production_type?: string | null;
          required_conditions?: string | null;
          role_description?: string | null;
          synopsis?: string | null;
          updated_at?: string;
        };
        Update: {
          company_user_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          preferred_conditions?: string | null;
          production_title?: string | null;
          production_type?: string | null;
          required_conditions?: string | null;
          role_description?: string | null;
          synopsis?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      actor_ticket_predictions: {
        Row: {
          actor_id: string;
          company_user_id: string;
          created_at: string;
          fit_percentage: number | null;
          fit_reasoning: string | null;
          genre: string | null;
          id: string;
          predicted_tickets_high: number | null;
          predicted_tickets_low: number | null;
          prediction_basis: string | null;
          production_title: string | null;
          production_type: string | null;
          role_description: string | null;
          updated_at: string;
          venue_capacity: number | null;
        };
        Insert: {
          actor_id: string;
          company_user_id: string;
          created_at?: string;
          fit_percentage?: number | null;
          fit_reasoning?: string | null;
          genre?: string | null;
          id?: string;
          predicted_tickets_high?: number | null;
          predicted_tickets_low?: number | null;
          prediction_basis?: string | null;
          production_title?: string | null;
          production_type?: string | null;
          role_description?: string | null;
          updated_at?: string;
          venue_capacity?: number | null;
        };
        Update: {
          actor_id?: string;
          company_user_id?: string;
          created_at?: string;
          fit_percentage?: number | null;
          fit_reasoning?: string | null;
          genre?: string | null;
          id?: string;
          predicted_tickets_high?: number | null;
          predicted_tickets_low?: number | null;
          prediction_basis?: string | null;
          production_title?: string | null;
          production_type?: string | null;
          role_description?: string | null;
          updated_at?: string;
          venue_capacity?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "actor_ticket_predictions_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "actors";
            referencedColumns: ["id"];
          },
        ];
      };
      actors: {
        Row: {
          agency_name: string | null;
          created_at: string;
          created_by: string | null;
          follower_counts: Json;
          id: string;
          influence_summary: string | null;
          last_researched_at: string | null;
          name: string;
          past_works: Json;
          school: string | null;
          search_count: number;
          sns_handles: Json;
          suggested_roles: Json;
          updated_at: string;
        };
        Insert: {
          agency_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          follower_counts?: Json;
          id?: string;
          influence_summary?: string | null;
          last_researched_at?: string | null;
          name: string;
          past_works?: Json;
          school?: string | null;
          search_count?: number;
          sns_handles?: Json;
          suggested_roles?: Json;
          updated_at?: string;
        };
        Update: {
          agency_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          follower_counts?: Json;
          id?: string;
          influence_summary?: string | null;
          last_researched_at?: string | null;
          name?: string;
          past_works?: Json;
          school?: string | null;
          search_count?: number;
          sns_handles?: Json;
          suggested_roles?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      career_chat_messages: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          role: string;
          session_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          role: string;
          session_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          role?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "career_chat_messages_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "career_chat_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      career_chat_sessions: {
        Row: {
          created_at: string;
          id: string;
          mode: string;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mode: string;
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mode?: string;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      companies: {
        Row: {
          avatar_config: Json | null;
          created_at: string | null;
          id: string;
          name: string;
          owner_id: string | null;
          plan: string;
          plan_expires_at: string | null;
          seats: number;
          settings: Json | null;
        };
        Insert: {
          avatar_config?: Json | null;
          created_at?: string | null;
          id?: string;
          name: string;
          owner_id?: string | null;
          plan?: string;
          plan_expires_at?: string | null;
          seats?: number;
          settings?: Json | null;
        };
        Update: {
          avatar_config?: Json | null;
          created_at?: string | null;
          id?: string;
          name?: string;
          owner_id?: string | null;
          plan?: string;
          plan_expires_at?: string | null;
          seats?: number;
          settings?: Json | null;
        };
        Relationships: [];
      };
      daily_question_assignments: {
        Row: {
          assignment_date: string;
          created_at: string;
          id: string;
          question_ids: string[];
          user_id: string;
        };
        Insert: {
          assignment_date: string;
          created_at?: string;
          id?: string;
          question_ids: string[];
          user_id: string;
        };
        Update: {
          assignment_date?: string;
          created_at?: string;
          id?: string;
          question_ids?: string[];
          user_id?: string;
        };
        Relationships: [];
      };
      daily_question_bank: {
        Row: {
          category: string;
          created_at: string;
          id: string;
          is_active: boolean;
          mode: string;
          question_text: string;
          sort_order: number;
        };
        Insert: {
          category: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          mode: string;
          question_text: string;
          sort_order?: number;
        };
        Update: {
          category?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          mode?: string;
          question_text?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      daily_question_responses: {
        Row: {
          answer_text: string;
          answered_on: string;
          created_at: string;
          id: string;
          question_id: string;
          user_id: string;
        };
        Insert: {
          answer_text: string;
          answered_on: string;
          created_at?: string;
          id?: string;
          question_id: string;
          user_id: string;
        };
        Update: {
          answer_text?: string;
          answered_on?: string;
          created_at?: string;
          id?: string;
          question_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_question_responses_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "daily_question_bank";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_reminder_preferences: {
        Row: {
          created_at: string;
          enabled: boolean;
          last_sent_at: string | null;
          send_hour: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          last_sent_at?: string | null;
          send_hour?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          last_sent_at?: string | null;
          send_hour?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      feature_usage_counters: {
        Row: {
          count: number;
          created_at: string;
          feature_key: string;
          id: string;
          updated_at: string;
          user_id: string;
          window_key: string;
          window_type: string;
        };
        Insert: {
          count?: number;
          created_at?: string;
          feature_key: string;
          id?: string;
          updated_at?: string;
          user_id: string;
          window_key: string;
          window_type: string;
        };
        Update: {
          count?: number;
          created_at?: string;
          feature_key?: string;
          id?: string;
          updated_at?: string;
          user_id?: string;
          window_key?: string;
          window_type?: string;
        };
        Relationships: [];
      };
      generated_documents: {
        Row: {
          created_at: string;
          doc_type: string;
          generated_content: string;
          id: string;
          input_data: Json | null;
          mode: string;
          template: string | null;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          doc_type: string;
          generated_content: string;
          id?: string;
          input_data?: Json | null;
          mode: string;
          template?: string | null;
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          doc_type?: string;
          generated_content?: string;
          id?: string;
          input_data?: Json | null;
          mode?: string;
          template?: string | null;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      interview_invitations: {
        Row: {
          actor_id: string | null;
          candidate_email: string | null;
          candidate_name: string | null;
          created_at: string | null;
          expires_at: string | null;
          id: string;
          interview_purpose: string | null;
          job_type: string | null;
          practice_depth: string | null;
          practice_max_minutes: number | null;
          production_title: string | null;
          screening_candidate_id: string | null;
          screening_data: Json | null;
          status: string;
          synopsis: string | null;
          token: string;
          uploaded_resume_text: string | null;
          user_id: string;
        };
        Insert: {
          actor_id?: string | null;
          candidate_email?: string | null;
          candidate_name?: string | null;
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          interview_purpose?: string | null;
          job_type?: string | null;
          practice_depth?: string | null;
          practice_max_minutes?: number | null;
          production_title?: string | null;
          screening_candidate_id?: string | null;
          screening_data?: Json | null;
          status?: string;
          synopsis?: string | null;
          token?: string;
          uploaded_resume_text?: string | null;
          user_id: string;
        };
        Update: {
          actor_id?: string | null;
          candidate_email?: string | null;
          candidate_name?: string | null;
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          interview_purpose?: string | null;
          job_type?: string | null;
          practice_depth?: string | null;
          practice_max_minutes?: number | null;
          production_title?: string | null;
          screening_candidate_id?: string | null;
          screening_data?: Json | null;
          status?: string;
          synopsis?: string | null;
          token?: string;
          uploaded_resume_text?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interview_invitations_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "actors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interview_invitations_screening_candidate_id_fkey";
            columns: ["screening_candidate_id"];
            isOneToOne: false;
            referencedRelation: "screening_candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      interview_summaries: {
        Row: {
          actor_verification: Json | null;
          adoption_reasons: string[] | null;
          ai_comment: string | null;
          candidate_traits: string | null;
          check_next: string[] | null;
          company_fit_comment: string | null;
          company_fit_score: number | null;
          concerns: string[] | null;
          consistency_level: string | null;
          consistency_score: number | null;
          created_at: string;
          handover: string | null;
          id: string;
          inconsistencies: string[] | null;
          interview_id: string;
          next_steps: Json | null;
          onboarding: string | null;
          overall_score: number | null;
          overview: string | null;
          past_activities: string | null;
          personality_model: Json | null;
          positives: string | null;
          practice_feedback: Json | null;
          radar_scores: Json | null;
          red_flags: string | null;
          resignation_risk_factors: Json | null;
          resignation_risk_level: string | null;
          resignation_risk_percent: number | null;
          risk_factors: string[] | null;
          risk_level: string | null;
          risk_score: number | null;
        };
        Insert: {
          actor_verification?: Json | null;
          adoption_reasons?: string[] | null;
          ai_comment?: string | null;
          candidate_traits?: string | null;
          check_next?: string[] | null;
          company_fit_comment?: string | null;
          company_fit_score?: number | null;
          concerns?: string[] | null;
          consistency_level?: string | null;
          consistency_score?: number | null;
          created_at?: string;
          handover?: string | null;
          id?: string;
          inconsistencies?: string[] | null;
          interview_id: string;
          next_steps?: Json | null;
          onboarding?: string | null;
          overall_score?: number | null;
          overview?: string | null;
          past_activities?: string | null;
          personality_model?: Json | null;
          positives?: string | null;
          practice_feedback?: Json | null;
          radar_scores?: Json | null;
          red_flags?: string | null;
          resignation_risk_factors?: Json | null;
          resignation_risk_level?: string | null;
          resignation_risk_percent?: number | null;
          risk_factors?: string[] | null;
          risk_level?: string | null;
          risk_score?: number | null;
        };
        Update: {
          actor_verification?: Json | null;
          adoption_reasons?: string[] | null;
          ai_comment?: string | null;
          candidate_traits?: string | null;
          check_next?: string[] | null;
          company_fit_comment?: string | null;
          company_fit_score?: number | null;
          concerns?: string[] | null;
          consistency_level?: string | null;
          consistency_score?: number | null;
          created_at?: string;
          handover?: string | null;
          id?: string;
          inconsistencies?: string[] | null;
          interview_id?: string;
          next_steps?: Json | null;
          onboarding?: string | null;
          overall_score?: number | null;
          overview?: string | null;
          past_activities?: string | null;
          personality_model?: Json | null;
          positives?: string | null;
          practice_feedback?: Json | null;
          radar_scores?: Json | null;
          red_flags?: string | null;
          resignation_risk_factors?: Json | null;
          resignation_risk_level?: string | null;
          resignation_risk_percent?: number | null;
          risk_factors?: string[] | null;
          risk_level?: string | null;
          risk_score?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "interview_summaries_interview_id_fkey";
            columns: ["interview_id"];
            isOneToOne: true;
            referencedRelation: "interviews";
            referencedColumns: ["id"];
          },
        ];
      };
      interview_turns: {
        Row: {
          analysis: string | null;
          created_at: string;
          id: string;
          interview_id: string;
          is_pre_check: boolean;
          memo: string | null;
          question: string | null;
          risk_tags: string[] | null;
          turn_number: number;
        };
        Insert: {
          analysis?: string | null;
          created_at?: string;
          id?: string;
          interview_id: string;
          is_pre_check?: boolean;
          memo?: string | null;
          question?: string | null;
          risk_tags?: string[] | null;
          turn_number: number;
        };
        Update: {
          analysis?: string | null;
          created_at?: string;
          id?: string;
          interview_id?: string;
          is_pre_check?: boolean;
          memo?: string | null;
          question?: string | null;
          risk_tags?: string[] | null;
          turn_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "interview_turns_interview_id_fkey";
            columns: ["interview_id"];
            isOneToOne: false;
            referencedRelation: "interviews";
            referencedColumns: ["id"];
          },
        ];
      };
      interviews: {
        Row: {
          actor_id: string | null;
          candidate_name: string | null;
          coach_personality: string | null;
          created_at: string;
          id: string;
          impression: string | null;
          interviewer_name: string | null;
          job_type: string | null;
          mode: string | null;
          priorities: string[] | null;
          recording_path: string | null;
          screening_candidate_id: string | null;
          transfer_count: string | null;
          user_id: string;
        };
        Insert: {
          actor_id?: string | null;
          candidate_name?: string | null;
          coach_personality?: string | null;
          created_at?: string;
          id?: string;
          impression?: string | null;
          interviewer_name?: string | null;
          job_type?: string | null;
          mode?: string | null;
          priorities?: string[] | null;
          recording_path?: string | null;
          screening_candidate_id?: string | null;
          transfer_count?: string | null;
          user_id: string;
        };
        Update: {
          actor_id?: string | null;
          candidate_name?: string | null;
          coach_personality?: string | null;
          created_at?: string;
          id?: string;
          impression?: string | null;
          interviewer_name?: string | null;
          job_type?: string | null;
          mode?: string | null;
          priorities?: string[] | null;
          recording_path?: string | null;
          screening_candidate_id?: string | null;
          transfer_count?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interviews_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "actors";
            referencedColumns: ["id"];
          },
        ];
      };
      job_applications: {
        Row: {
          applicant_user_id: string;
          concerns: Json;
          created_at: string;
          id: string;
          job_posting_id: string;
          rank: string | null;
          score: number | null;
          status: string;
          strengths: Json;
          summary: string | null;
          updated_at: string;
        };
        Insert: {
          applicant_user_id: string;
          concerns?: Json;
          created_at?: string;
          id?: string;
          job_posting_id: string;
          rank?: string | null;
          score?: number | null;
          status?: string;
          strengths?: Json;
          summary?: string | null;
          updated_at?: string;
        };
        Update: {
          applicant_user_id?: string;
          concerns?: Json;
          created_at?: string;
          id?: string;
          job_posting_id?: string;
          rank?: string | null;
          score?: number | null;
          status?: string;
          strengths?: Json;
          summary?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_applications_job_posting_id_fkey";
            columns: ["job_posting_id"];
            isOneToOne: false;
            referencedRelation: "job_postings";
            referencedColumns: ["id"];
          },
        ];
      };
      job_postings: {
        Row: {
          application_requirements: string | null;
          benefits: string | null;
          company_appeal: string | null;
          company_user_id: string;
          created_at: string;
          description: string | null;
          employment_type: string | null;
          holidays: string | null;
          id: string;
          ideal_candidate: string | null;
          job_type: string | null;
          location: string | null;
          salary_range: string | null;
          screening_preset_id: string | null;
          selection_process: string | null;
          status: string;
          successful_hire_traits: string | null;
          thumbnail_path: string | null;
          title: string;
          updated_at: string;
          work_style: string | null;
          working_hours: string | null;
        };
        Insert: {
          application_requirements?: string | null;
          benefits?: string | null;
          company_appeal?: string | null;
          company_user_id: string;
          created_at?: string;
          description?: string | null;
          employment_type?: string | null;
          holidays?: string | null;
          id?: string;
          ideal_candidate?: string | null;
          job_type?: string | null;
          location?: string | null;
          salary_range?: string | null;
          screening_preset_id?: string | null;
          selection_process?: string | null;
          status?: string;
          successful_hire_traits?: string | null;
          thumbnail_path?: string | null;
          title: string;
          updated_at?: string;
          work_style?: string | null;
          working_hours?: string | null;
        };
        Update: {
          application_requirements?: string | null;
          benefits?: string | null;
          company_appeal?: string | null;
          company_user_id?: string;
          created_at?: string;
          description?: string | null;
          employment_type?: string | null;
          holidays?: string | null;
          id?: string;
          ideal_candidate?: string | null;
          job_type?: string | null;
          location?: string | null;
          salary_range?: string | null;
          screening_preset_id?: string | null;
          selection_process?: string | null;
          status?: string;
          successful_hire_traits?: string | null;
          thumbnail_path?: string | null;
          title?: string;
          updated_at?: string;
          work_style?: string | null;
          working_hours?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "job_postings_screening_preset_id_fkey";
            columns: ["screening_preset_id"];
            isOneToOne: false;
            referencedRelation: "screening_criteria_presets";
            referencedColumns: ["id"];
          },
        ];
      };
      onboarding_answers: {
        Row: {
          answers: Json;
          completed_at: string | null;
          created_at: string;
          mode: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          answers?: Json;
          completed_at?: string | null;
          created_at?: string;
          mode: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          answers?: Json;
          completed_at?: string | null;
          created_at?: string;
          mode?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          business_description: string | null;
          company_address: string | null;
          company_culture: string | null;
          company_id: string | null;
          company_name: string | null;
          company_number: string | null;
          company_role: string | null;
          company_strengths: string | null;
          competitive_advantage: string | null;
          competitors: string | null;
          created_at: string;
          deletion_requested_at: string | null;
          employee_count: string | null;
          failed_hire_traits: string | null;
          first_job_description: string | null;
          founded_year: string | null;
          hiring_positions: string | null;
          id: string;
          ideal_candidate: string | null;
          industry: string | null;
          interview_count_this_month: number;
          interview_focus: string | null;
          period_interview_count: number;
          period_start_at: string | null;
          plan: string;
          plan_expires_at: string | null;
          remote_policy: string | null;
          salary_range: string | null;
          screening_count_this_month: number;
          stripe_customer_id: string | null;
          stripe_meter_subscription_id: string | null;
          stripe_subscription_id: string | null;
          successful_hire_traits: string | null;
          updated_at: string;
          user_mode: string;
        };
        Insert: {
          business_description?: string | null;
          company_address?: string | null;
          company_culture?: string | null;
          company_id?: string | null;
          company_name?: string | null;
          company_number?: string | null;
          company_role?: string | null;
          company_strengths?: string | null;
          competitive_advantage?: string | null;
          competitors?: string | null;
          created_at?: string;
          deletion_requested_at?: string | null;
          employee_count?: string | null;
          failed_hire_traits?: string | null;
          first_job_description?: string | null;
          founded_year?: string | null;
          hiring_positions?: string | null;
          id: string;
          ideal_candidate?: string | null;
          industry?: string | null;
          interview_count_this_month?: number;
          interview_focus?: string | null;
          period_interview_count?: number;
          period_start_at?: string | null;
          plan?: string;
          plan_expires_at?: string | null;
          remote_policy?: string | null;
          salary_range?: string | null;
          screening_count_this_month?: number;
          stripe_customer_id?: string | null;
          stripe_meter_subscription_id?: string | null;
          stripe_subscription_id?: string | null;
          successful_hire_traits?: string | null;
          updated_at?: string;
          user_mode?: string;
        };
        Update: {
          business_description?: string | null;
          company_address?: string | null;
          company_culture?: string | null;
          company_id?: string | null;
          company_name?: string | null;
          company_number?: string | null;
          company_role?: string | null;
          company_strengths?: string | null;
          competitive_advantage?: string | null;
          competitors?: string | null;
          created_at?: string;
          deletion_requested_at?: string | null;
          employee_count?: string | null;
          failed_hire_traits?: string | null;
          first_job_description?: string | null;
          founded_year?: string | null;
          hiring_positions?: string | null;
          id?: string;
          ideal_candidate?: string | null;
          industry?: string | null;
          interview_count_this_month?: number;
          interview_focus?: string | null;
          period_interview_count?: number;
          period_start_at?: string | null;
          plan?: string;
          plan_expires_at?: string | null;
          remote_policy?: string | null;
          salary_range?: string | null;
          screening_count_this_month?: number;
          stripe_customer_id?: string | null;
          stripe_meter_subscription_id?: string | null;
          stripe_subscription_id?: string | null;
          successful_hire_traits?: string | null;
          updated_at?: string;
          user_mode?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      screening_candidates: {
        Row: {
          actor_id: string | null;
          avoid_personality: string | null;
          batch_id: string;
          candidate_name: string | null;
          check_points: Json;
          company_info_used: Json;
          concerns: Json;
          created_at: string;
          expected_outcome: string | null;
          file_name: string | null;
          highly_valued_experience: string | null;
          id: string;
          ideal_person: Json | null;
          job_type: string | null;
          must_have_conditions: string | null;
          negative_evidence: Json;
          positive_evidence: Json;
          preferred_conditions: Json | null;
          rank: string | null;
          required_conditions: Json | null;
          resume_excerpt: string | null;
          score: number | null;
          score_breakdown: Json;
          strengths: Json;
          summary: string | null;
          user_id: string;
        };
        Insert: {
          actor_id?: string | null;
          avoid_personality?: string | null;
          batch_id: string;
          candidate_name?: string | null;
          check_points?: Json;
          company_info_used?: Json;
          concerns?: Json;
          created_at?: string;
          expected_outcome?: string | null;
          file_name?: string | null;
          highly_valued_experience?: string | null;
          id?: string;
          ideal_person?: Json | null;
          job_type?: string | null;
          must_have_conditions?: string | null;
          negative_evidence?: Json;
          positive_evidence?: Json;
          preferred_conditions?: Json | null;
          rank?: string | null;
          required_conditions?: Json | null;
          resume_excerpt?: string | null;
          score?: number | null;
          score_breakdown?: Json;
          strengths?: Json;
          summary?: string | null;
          user_id: string;
        };
        Update: {
          actor_id?: string | null;
          avoid_personality?: string | null;
          batch_id?: string;
          candidate_name?: string | null;
          check_points?: Json;
          company_info_used?: Json;
          concerns?: Json;
          created_at?: string;
          expected_outcome?: string | null;
          file_name?: string | null;
          highly_valued_experience?: string | null;
          id?: string;
          ideal_person?: Json | null;
          job_type?: string | null;
          must_have_conditions?: string | null;
          negative_evidence?: Json;
          positive_evidence?: Json;
          preferred_conditions?: Json | null;
          rank?: string | null;
          required_conditions?: Json | null;
          resume_excerpt?: string | null;
          score?: number | null;
          score_breakdown?: Json;
          strengths?: Json;
          summary?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "screening_candidates_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "actors";
            referencedColumns: ["id"];
          },
        ];
      };
      screening_criteria_presets: {
        Row: {
          company_user_id: string;
          created_at: string;
          criteria_data: Json;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          company_user_id: string;
          created_at?: string;
          criteria_data?: Json;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          company_user_id?: string;
          created_at?: string;
          criteria_data?: Json;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      screening_history_legacy: {
        Row: {
          avoid_personality: string | null;
          candidate_count: number | null;
          created_at: string;
          expected_outcome: string | null;
          highly_valued_experience: string | null;
          id: string;
          ideal_person: Json | null;
          job_type: string | null;
          must_have_conditions: string | null;
          preferred_conditions: Json | null;
          required_conditions: Json | null;
          results: Json;
          top_score: number | null;
          user_id: string;
        };
        Insert: {
          avoid_personality?: string | null;
          candidate_count?: number | null;
          created_at?: string;
          expected_outcome?: string | null;
          highly_valued_experience?: string | null;
          id?: string;
          ideal_person?: Json | null;
          job_type?: string | null;
          must_have_conditions?: string | null;
          preferred_conditions?: Json | null;
          required_conditions?: Json | null;
          results?: Json;
          top_score?: number | null;
          user_id: string;
        };
        Update: {
          avoid_personality?: string | null;
          candidate_count?: number | null;
          created_at?: string;
          expected_outcome?: string | null;
          highly_valued_experience?: string | null;
          id?: string;
          ideal_person?: Json | null;
          job_type?: string | null;
          must_have_conditions?: string | null;
          preferred_conditions?: Json | null;
          required_conditions?: Json | null;
          results?: Json;
          top_score?: number | null;
          user_id?: string;
        };
        Relationships: [];
      };
      self_analysis_reports: {
        Row: {
          appeal_points: string[] | null;
          based_on_interview_id: string | null;
          concerns: string | null;
          created_at: string;
          id: string;
          mode: string;
          raw_content: Json | null;
          report_type: string;
          strengths: string[] | null;
          suited_jobs: Json | null;
          user_id: string;
          weaknesses: string[] | null;
        };
        Insert: {
          appeal_points?: string[] | null;
          based_on_interview_id?: string | null;
          concerns?: string | null;
          created_at?: string;
          id?: string;
          mode: string;
          raw_content?: Json | null;
          report_type: string;
          strengths?: string[] | null;
          suited_jobs?: Json | null;
          user_id: string;
          weaknesses?: string[] | null;
        };
        Update: {
          appeal_points?: string[] | null;
          based_on_interview_id?: string | null;
          concerns?: string | null;
          created_at?: string;
          id?: string;
          mode?: string;
          raw_content?: Json | null;
          report_type?: string;
          strengths?: string[] | null;
          suited_jobs?: Json | null;
          user_id?: string;
          weaknesses?: string[] | null;
        };
        Relationships: [
          {
            foreignKeyName: "self_analysis_reports_based_on_interview_id_fkey";
            columns: ["based_on_interview_id"];
            isOneToOne: false;
            referencedRelation: "interviews";
            referencedColumns: ["id"];
          },
        ];
      };
      user_career_profiles: {
        Row: {
          basic_info: Json;
          certifications: Json;
          created_at: string;
          desired_conditions: Json;
          desired_schools: Json;
          education_history: Json;
          extracurricular_activities: Json;
          mode: string;
          practice_preferences: Json | null;
          profile_completion_percent: number;
          self_pr: string | null;
          skills: string[] | null;
          updated_at: string;
          user_id: string;
          work_history: Json;
        };
        Insert: {
          basic_info?: Json;
          certifications?: Json;
          created_at?: string;
          desired_conditions?: Json;
          desired_schools?: Json;
          education_history?: Json;
          extracurricular_activities?: Json;
          mode: string;
          practice_preferences?: Json | null;
          profile_completion_percent?: number;
          self_pr?: string | null;
          skills?: string[] | null;
          updated_at?: string;
          user_id: string;
          work_history?: Json;
        };
        Update: {
          basic_info?: Json;
          certifications?: Json;
          created_at?: string;
          desired_conditions?: Json;
          desired_schools?: Json;
          education_history?: Json;
          extracurricular_activities?: Json;
          mode?: string;
          practice_preferences?: Json | null;
          profile_completion_percent?: number;
          self_pr?: string | null;
          skills?: string[] | null;
          updated_at?: string;
          user_id?: string;
          work_history?: Json;
        };
        Relationships: [];
      };
      user_devices: {
        Row: {
          device_id: string;
          device_label: string | null;
          first_seen_at: string;
          id: string;
          is_active: boolean;
          last_seen_at: string;
          user_id: string;
        };
        Insert: {
          device_id: string;
          device_label?: string | null;
          first_seen_at?: string;
          id?: string;
          is_active?: boolean;
          last_seen_at?: string;
          user_id: string;
        };
        Update: {
          device_id?: string;
          device_label?: string | null;
          first_seen_at?: string;
          id?: string;
          is_active?: boolean;
          last_seen_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_document_templates: {
        Row: {
          created_at: string;
          doc_type: string;
          fields: Json;
          id: string;
          template_path: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          doc_type: string;
          fields?: Json;
          id?: string;
          template_path: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          doc_type?: string;
          fields?: Json;
          id?: string;
          template_path?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_interview_invitation: {
        Args: { _token: string };
        Returns: {
          candidate_name: string;
          expires_at: string;
          job_type: string;
          status: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
