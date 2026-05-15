export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ad_competitor_creatives: {
        Row: {
          active_days: number | null
          ad_archive_id: string | null
          advertiser: string
          angle: string | null
          created_at: string
          creative_format: string | null
          cta: string | null
          first_seen_at: string | null
          headline: string | null
          id: string
          image_url: string | null
          ingested_at: string
          last_seen_at: string | null
          page_id: string | null
          primary_text: string | null
          raw: Json | null
          region: string | null
          thumbnail_url: string | null
          video_url: string | null
        }
        Insert: {
          active_days?: number | null
          ad_archive_id?: string | null
          advertiser: string
          angle?: string | null
          created_at?: string
          creative_format?: string | null
          cta?: string | null
          first_seen_at?: string | null
          headline?: string | null
          id?: string
          image_url?: string | null
          ingested_at?: string
          last_seen_at?: string | null
          page_id?: string | null
          primary_text?: string | null
          raw?: Json | null
          region?: string | null
          thumbnail_url?: string | null
          video_url?: string | null
        }
        Update: {
          active_days?: number | null
          ad_archive_id?: string | null
          advertiser?: string
          angle?: string | null
          created_at?: string
          creative_format?: string | null
          cta?: string | null
          first_seen_at?: string | null
          headline?: string | null
          id?: string
          image_url?: string | null
          ingested_at?: string
          last_seen_at?: string | null
          page_id?: string | null
          primary_text?: string | null
          raw?: Json | null
          region?: string | null
          thumbnail_url?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      ad_creative_insights: {
        Row: {
          best_cpa_cents: number | null
          best_ctr_bps: number
          best_formats: Json
          best_image_briefs: Json
          best_image_traits: Json
          competitor_summary: string | null
          consultant_id: string
          created_at: string
          distribuidora: string | null
          id: string
          losing_patterns: Json
          sample_size: number
          summary: string | null
          updated_at: string
          winning_patterns: Json
        }
        Insert: {
          best_cpa_cents?: number | null
          best_ctr_bps?: number
          best_formats?: Json
          best_image_briefs?: Json
          best_image_traits?: Json
          competitor_summary?: string | null
          consultant_id: string
          created_at?: string
          distribuidora?: string | null
          id?: string
          losing_patterns?: Json
          sample_size?: number
          summary?: string | null
          updated_at?: string
          winning_patterns?: Json
        }
        Update: {
          best_cpa_cents?: number | null
          best_ctr_bps?: number
          best_formats?: Json
          best_image_briefs?: Json
          best_image_traits?: Json
          competitor_summary?: string | null
          consultant_id?: string
          created_at?: string
          distribuidora?: string | null
          id?: string
          losing_patterns?: Json
          sample_size?: number
          summary?: string | null
          updated_at?: string
          winning_patterns?: Json
        }
        Relationships: []
      }
      ad_creative_performance: {
        Row: {
          angle: string | null
          campaign_id: string
          clicks: number
          consultant_id: string
          creative_format: string | null
          evaluated_at: string
          fb_ad_id: string
          framework: string | null
          headline: string | null
          id: string
          image_brief: string | null
          impressions: number
          is_loser: boolean
          is_winner: boolean
          leads: number
          paused_by_ai_at: string | null
          primary_text: string | null
          registrations: number
          score: number
          spend_cents: number
        }
        Insert: {
          angle?: string | null
          campaign_id: string
          clicks?: number
          consultant_id: string
          creative_format?: string | null
          evaluated_at?: string
          fb_ad_id: string
          framework?: string | null
          headline?: string | null
          id?: string
          image_brief?: string | null
          impressions?: number
          is_loser?: boolean
          is_winner?: boolean
          leads?: number
          paused_by_ai_at?: string | null
          primary_text?: string | null
          registrations?: number
          score?: number
          spend_cents?: number
        }
        Update: {
          angle?: string | null
          campaign_id?: string
          clicks?: number
          consultant_id?: string
          creative_format?: string | null
          evaluated_at?: string
          fb_ad_id?: string
          framework?: string | null
          headline?: string | null
          id?: string
          image_brief?: string | null
          impressions?: number
          is_loser?: boolean
          is_winner?: boolean
          leads?: number
          paused_by_ai_at?: string | null
          primary_text?: string | null
          registrations?: number
          score?: number
          spend_cents?: number
        }
        Relationships: []
      }
      ad_generated_creatives: {
        Row: {
          angle: string | null
          badge_text: string | null
          brief_used: string | null
          composite_url: string | null
          consultant_id: string
          created_at: string
          format: string
          headline_used: string | null
          id: string
          image_url: string
          inspired_by_advertisers: string[] | null
          is_public: boolean
          overlay_layout: Json | null
          prompt_used: string | null
          qa_attempts: number | null
          qa_report: Json | null
          storage_path: string | null
          used_in_campaign_id: string | null
        }
        Insert: {
          angle?: string | null
          badge_text?: string | null
          brief_used?: string | null
          composite_url?: string | null
          consultant_id: string
          created_at?: string
          format: string
          headline_used?: string | null
          id?: string
          image_url: string
          inspired_by_advertisers?: string[] | null
          is_public?: boolean
          overlay_layout?: Json | null
          prompt_used?: string | null
          qa_attempts?: number | null
          qa_report?: Json | null
          storage_path?: string | null
          used_in_campaign_id?: string | null
        }
        Update: {
          angle?: string | null
          badge_text?: string | null
          brief_used?: string | null
          composite_url?: string | null
          consultant_id?: string
          created_at?: string
          format?: string
          headline_used?: string | null
          id?: string
          image_url?: string
          inspired_by_advertisers?: string[] | null
          is_public?: boolean
          overlay_layout?: Json | null
          prompt_used?: string | null
          qa_attempts?: number | null
          qa_report?: Json | null
          storage_path?: string | null
          used_in_campaign_id?: string | null
        }
        Relationships: []
      }
      ad_image_validations: {
        Row: {
          created_at: string
          format: string
          id: string
          image_url: string
          validation: Json
        }
        Insert: {
          created_at?: string
          format: string
          id?: string
          image_url: string
          validation: Json
        }
        Update: {
          created_at?: string
          format?: string
          id?: string
          image_url?: string
          validation?: Json
        }
        Relationships: []
      }
      ad_playbooks: {
        Row: {
          consultant_id: string | null
          created_at: string
          generated_at: string
          id: string
          payload: Json
          scope: string
          source_metric: string | null
        }
        Insert: {
          consultant_id?: string | null
          created_at?: string
          generated_at?: string
          id?: string
          payload: Json
          scope?: string
          source_metric?: string | null
        }
        Update: {
          consultant_id?: string | null
          created_at?: string
          generated_at?: string
          id?: string
          payload?: Json
          scope?: string
          source_metric?: string | null
        }
        Relationships: []
      }
      ad_recommendations: {
        Row: {
          action_label: string | null
          action_payload: Json | null
          applied_at: string | null
          consultant_id: string
          created_at: string
          dismissed_at: string | null
          id: string
          message: string
          severity: string
          title: string
          type: string
        }
        Insert: {
          action_label?: string | null
          action_payload?: Json | null
          applied_at?: string | null
          consultant_id: string
          created_at?: string
          dismissed_at?: string | null
          id?: string
          message: string
          severity?: string
          title: string
          type: string
        }
        Update: {
          action_label?: string | null
          action_payload?: Json | null
          applied_at?: string | null
          consultant_id?: string
          created_at?: string
          dismissed_at?: string | null
          id?: string
          message?: string
          severity?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      ad_template_usages: {
        Row: {
          campaign_id: string | null
          consultant_id: string
          created_at: string
          id: string
          template_id: string
        }
        Insert: {
          campaign_id?: string | null
          consultant_id: string
          created_at?: string
          id?: string
          template_id: string
        }
        Update: {
          campaign_id?: string | null
          consultant_id?: string
          created_at?: string
          id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_template_usages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ad_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_templates: {
        Row: {
          age_max: number
          age_min: number
          avg_cpl_cents: number | null
          consultant_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          description_text: string
          genders: string[]
          headline: string
          headline_variants: string[]
          id: string
          origin_template_id: string | null
          photos: Json
          primary_text: string
          primary_text_variants: string[]
          status: string
          suggested_daily_budget_cents: number
          target_cidades: string[]
          target_distribuidora_ids: string[]
          title: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          age_max?: number
          age_min?: number
          avg_cpl_cents?: number | null
          consultant_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          description_text?: string
          genders?: string[]
          headline?: string
          headline_variants?: string[]
          id?: string
          origin_template_id?: string | null
          photos?: Json
          primary_text?: string
          primary_text_variants?: string[]
          status?: string
          suggested_daily_budget_cents?: number
          target_cidades?: string[]
          target_distribuidora_ids?: string[]
          title: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          age_max?: number
          age_min?: number
          avg_cpl_cents?: number | null
          consultant_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          description_text?: string
          genders?: string[]
          headline?: string
          headline_variants?: string[]
          id?: string
          origin_template_id?: string | null
          photos?: Json
          primary_text?: string
          primary_text_variants?: string[]
          status?: string
          suggested_daily_budget_cents?: number
          target_cidades?: string[]
          target_distribuidora_ids?: string[]
          title?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_templates_origin_template_id_fkey"
            columns: ["origin_template_id"]
            isOneToOne: false
            referencedRelation: "ad_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      ai_agent_config: {
        Row: {
          consultant_id: string | null
          created_at: string
          enabled: boolean
          handoff_rules: Json
          id: string
          persona_name: string
          step_prompts: Json
          system_prompt: string | null
          tone: string
          typing_max_ms: number
          typing_min_ms: number
          updated_at: string
        }
        Insert: {
          consultant_id?: string | null
          created_at?: string
          enabled?: boolean
          handoff_rules?: Json
          id?: string
          persona_name?: string
          step_prompts?: Json
          system_prompt?: string | null
          tone?: string
          typing_max_ms?: number
          typing_min_ms?: number
          updated_at?: string
        }
        Update: {
          consultant_id?: string | null
          created_at?: string
          enabled?: boolean
          handoff_rules?: Json
          id?: string
          persona_name?: string
          step_prompts?: Json
          system_prompt?: string | null
          tone?: string
          typing_max_ms?: number
          typing_min_ms?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_agent_logs: {
        Row: {
          consultant_id: string
          created_at: string
          customer_id: string | null
          error: string | null
          handoff: boolean
          handoff_reason: string | null
          id: string
          latency_ms: number | null
          llm_output: Json | null
          media_sent_id: string | null
          phone: string | null
          step_after: string | null
          step_before: string | null
          user_input: string | null
          user_input_kind: string | null
        }
        Insert: {
          consultant_id: string
          created_at?: string
          customer_id?: string | null
          error?: string | null
          handoff?: boolean
          handoff_reason?: string | null
          id?: string
          latency_ms?: number | null
          llm_output?: Json | null
          media_sent_id?: string | null
          phone?: string | null
          step_after?: string | null
          step_before?: string | null
          user_input?: string | null
          user_input_kind?: string | null
        }
        Update: {
          consultant_id?: string
          created_at?: string
          customer_id?: string | null
          error?: string | null
          handoff?: boolean
          handoff_reason?: string | null
          id?: string
          latency_ms?: number | null
          llm_output?: Json | null
          media_sent_id?: string | null
          phone?: string | null
          step_after?: string | null
          step_before?: string | null
          user_input?: string | null
          user_input_kind?: string | null
        }
        Relationships: []
      }
      ai_agent_slots: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          fallback_text: string | null
          is_testing: boolean
          label: string
          min_interval_minutes: number
          position: number
          slot_key: string
          trigger_hint: string | null
          updated_at: string
          version: number
          video_label: string | null
          video_storage_path: string | null
          video_url: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          fallback_text?: string | null
          is_testing?: boolean
          label: string
          min_interval_minutes?: number
          position?: number
          slot_key: string
          trigger_hint?: string | null
          updated_at?: string
          version?: number
          video_label?: string | null
          video_storage_path?: string | null
          video_url?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          fallback_text?: string | null
          is_testing?: boolean
          label?: string
          min_interval_minutes?: number
          position?: number
          slot_key?: string
          trigger_hint?: string | null
          updated_at?: string
          version?: number
          video_label?: string | null
          video_storage_path?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      ai_decisions: {
        Row: {
          ai_output: Json | null
          consultant_id: string
          created_at: string
          customer_id: string | null
          feedback: Json | null
          id: string
          intent_detected: string | null
          latency_ms: number | null
          media_sent_id: string | null
          model: string | null
          phase: string
          reasoning: string | null
          tool_called: string
          user_input: string | null
        }
        Insert: {
          ai_output?: Json | null
          consultant_id: string
          created_at?: string
          customer_id?: string | null
          feedback?: Json | null
          id?: string
          intent_detected?: string | null
          latency_ms?: number | null
          media_sent_id?: string | null
          model?: string | null
          phase: string
          reasoning?: string | null
          tool_called: string
          user_input?: string | null
        }
        Update: {
          ai_output?: Json | null
          consultant_id?: string
          created_at?: string
          customer_id?: string | null
          feedback?: Json | null
          id?: string
          intent_detected?: string | null
          latency_ms?: number | null
          media_sent_id?: string | null
          model?: string | null
          phase?: string
          reasoning?: string | null
          tool_called?: string
          user_input?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_decisions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_sections: {
        Row: {
          content: string
          created_at: string
          id: string
          is_active: boolean
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_learned_patterns: {
        Row: {
          bad_examples: Json
          consultant_id: string
          created_at: string
          good_examples: Json
          id: string
          intent: string
          sample_count: number
          updated_at: string
        }
        Insert: {
          bad_examples?: Json
          consultant_id: string
          created_at?: string
          good_examples?: Json
          id?: string
          intent: string
          sample_count?: number
          updated_at?: string
        }
        Update: {
          bad_examples?: Json
          consultant_id?: string
          created_at?: string
          good_examples?: Json
          id?: string
          intent?: string
          sample_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_learning_digest: {
        Row: {
          created_at: string
          digest_date: string
          id: string
          metrics: Json
          sent_at: string | null
          sent_to: string | null
          summary_text: string | null
        }
        Insert: {
          created_at?: string
          digest_date: string
          id?: string
          metrics?: Json
          sent_at?: string | null
          sent_to?: string | null
          summary_text?: string | null
        }
        Update: {
          created_at?: string
          digest_date?: string
          id?: string
          metrics?: Json
          sent_at?: string | null
          sent_to?: string | null
          summary_text?: string | null
        }
        Relationships: []
      }
      ai_media_library: {
        Row: {
          active: boolean
          consultant_id: string | null
          created_at: string
          delay_before_ms: number
          duration_sec: number | null
          id: string
          intent_tags: string[]
          is_draft: boolean
          is_primary_explainer: boolean
          is_public: boolean
          kind: string
          label: string
          priority: number
          reply_count: number
          send_order: number
          sent_count: number
          slot_key: string | null
          step_tags: string[]
          storage_path: string | null
          text_content: string | null
          transcript: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          active?: boolean
          consultant_id?: string | null
          created_at?: string
          delay_before_ms?: number
          duration_sec?: number | null
          id?: string
          intent_tags?: string[]
          is_draft?: boolean
          is_primary_explainer?: boolean
          is_public?: boolean
          kind: string
          label: string
          priority?: number
          reply_count?: number
          send_order?: number
          sent_count?: number
          slot_key?: string | null
          step_tags?: string[]
          storage_path?: string | null
          text_content?: string | null
          transcript?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          active?: boolean
          consultant_id?: string | null
          created_at?: string
          delay_before_ms?: number
          duration_sec?: number | null
          id?: string
          intent_tags?: string[]
          is_draft?: boolean
          is_primary_explainer?: boolean
          is_public?: boolean
          kind?: string
          label?: string
          priority?: number
          reply_count?: number
          send_order?: number
          sent_count?: number
          slot_key?: string | null
          step_tags?: string[]
          storage_path?: string | null
          text_content?: string | null
          transcript?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_media_library_slot_key_fkey"
            columns: ["slot_key"]
            isOneToOne: false
            referencedRelation: "ai_agent_slots"
            referencedColumns: ["slot_key"]
          },
        ]
      }
      ai_slot_dispatch_log: {
        Row: {
          consultant_id: string
          customer_id: string | null
          dispatch_status: string
          id: string
          media_id: string | null
          reply_within_min: number | null
          sent_at: string
          slot_key: string
          variant: string
        }
        Insert: {
          consultant_id: string
          customer_id?: string | null
          dispatch_status?: string
          id?: string
          media_id?: string | null
          reply_within_min?: number | null
          sent_at?: string
          slot_key: string
          variant: string
        }
        Update: {
          consultant_id?: string
          customer_id?: string | null
          dispatch_status?: string
          id?: string
          media_id?: string | null
          reply_within_min?: number | null
          sent_at?: string
          slot_key?: string
          variant?: string
        }
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          consultant_id: string | null
          cost_estimate_cents: number | null
          created_at: string
          customer_id: string | null
          degraded: boolean | null
          function_name: string
          id: string
          latency_ms: number | null
          metadata: Json | null
          model: string
          outcome: string | null
          thinking_tokens: number | null
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          consultant_id?: string | null
          cost_estimate_cents?: number | null
          created_at?: string
          customer_id?: string | null
          degraded?: boolean | null
          function_name: string
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          model: string
          outcome?: string | null
          thinking_tokens?: number | null
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          consultant_id?: string | null
          cost_estimate_cents?: number | null
          created_at?: string
          customer_id?: string | null
          degraded?: boolean | null
          function_name?: string
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          model?: string
          outcome?: string | null
          thinking_tokens?: number | null
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: []
      }
      bot_flow_qa: {
        Row: {
          created_at: string
          flow_id: string
          id: string
          intent_name: string
          is_closing: boolean
          is_opening: boolean
          position: number
          text_response: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          flow_id: string
          id?: string
          intent_name?: string
          is_closing?: boolean
          is_opening?: boolean
          position?: number
          text_response?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          flow_id?: string
          id?: string
          intent_name?: string
          is_closing?: boolean
          is_opening?: boolean
          position?: number
          text_response?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_flow_qa_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "bot_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_flow_qa_media: {
        Row: {
          created_at: string
          id: string
          media_id: string | null
          media_kind: string
          position: number
          qa_id: string
          slot_key: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          media_id?: string | null
          media_kind: string
          position?: number
          qa_id: string
          slot_key?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          media_id?: string | null
          media_kind?: string
          position?: number
          qa_id?: string
          slot_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_flow_qa_media_qa_id_fkey"
            columns: ["qa_id"]
            isOneToOne: false
            referencedRelation: "bot_flow_qa"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_flow_qa_triggers: {
        Row: {
          created_at: string
          id: string
          phrase: string
          qa_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          phrase: string
          qa_id: string
        }
        Update: {
          created_at?: string
          id?: string
          phrase?: string
          qa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_flow_qa_triggers_qa_id_fkey"
            columns: ["qa_id"]
            isOneToOne: false
            referencedRelation: "bot_flow_qa"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_flow_steps: {
        Row: {
          auto_detect_doc_type: boolean
          captures: Json
          condition_text: string | null
          created_at: string
          fallback: Json
          flow_id: string
          icon: string
          id: string
          is_active: boolean
          media_order: Json
          message_text: string | null
          position: number
          slot_key: string | null
          step_key: string | null
          step_type: string
          summary: string | null
          text_delay_ms: number
          title: string | null
          transitions: Json
          transitions_backup_pre_v2: Json | null
          updated_at: string
          wait_for: string
          wait_seconds: number
        }
        Insert: {
          auto_detect_doc_type?: boolean
          captures?: Json
          condition_text?: string | null
          created_at?: string
          fallback?: Json
          flow_id: string
          icon?: string
          id?: string
          is_active?: boolean
          media_order?: Json
          message_text?: string | null
          position?: number
          slot_key?: string | null
          step_key?: string | null
          step_type: string
          summary?: string | null
          text_delay_ms?: number
          title?: string | null
          transitions?: Json
          transitions_backup_pre_v2?: Json | null
          updated_at?: string
          wait_for?: string
          wait_seconds?: number
        }
        Update: {
          auto_detect_doc_type?: boolean
          captures?: Json
          condition_text?: string | null
          created_at?: string
          fallback?: Json
          flow_id?: string
          icon?: string
          id?: string
          is_active?: boolean
          media_order?: Json
          message_text?: string | null
          position?: number
          slot_key?: string | null
          step_key?: string | null
          step_type?: string
          summary?: string | null
          text_delay_ms?: number
          title?: string | null
          transitions?: Json
          transitions_backup_pre_v2?: Json | null
          updated_at?: string
          wait_for?: string
          wait_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "bot_flow_steps_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "bot_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_flows: {
        Row: {
          consultant_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          strict_mode: boolean
          updated_at: string
        }
        Insert: {
          consultant_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          strict_mode?: boolean
          updated_at?: string
        }
        Update: {
          consultant_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          strict_mode?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      bot_handoff_alerts: {
        Row: {
          consultant_id: string
          created_at: string
          customer_id: string | null
          id: string
          phone: string | null
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          user_message: string | null
        }
        Insert: {
          consultant_id: string
          created_at?: string
          customer_id?: string | null
          id?: string
          phone?: string | null
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          user_message?: string | null
        }
        Update: {
          consultant_id?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          phone?: string | null
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          user_message?: string | null
        }
        Relationships: []
      }
      bot_message_ab_results: {
        Row: {
          advanced_count: number
          consultant_id: string | null
          created_at: string
          id: string
          last_sent_at: string | null
          replied_count: number
          sent_count: number
          step_key: string
          template_key: string
          updated_at: string
          variant: string
        }
        Insert: {
          advanced_count?: number
          consultant_id?: string | null
          created_at?: string
          id?: string
          last_sent_at?: string | null
          replied_count?: number
          sent_count?: number
          step_key: string
          template_key: string
          updated_at?: string
          variant?: string
        }
        Update: {
          advanced_count?: number
          consultant_id?: string | null
          created_at?: string
          id?: string
          last_sent_at?: string | null
          replied_count?: number
          sent_count?: number
          step_key?: string
          template_key?: string
          updated_at?: string
          variant?: string
        }
        Relationships: []
      }
      bot_messages: {
        Row: {
          active: boolean
          created_at: string
          id: string
          step_key: string
          template_key: string
          text: string
          updated_at: string
          variant: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          step_key: string
          template_key: string
          text: string
          updated_at?: string
          variant?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          step_key?: string
          template_key?: string
          text?: string
          updated_at?: string
          variant?: string
        }
        Relationships: []
      }
      bot_step_transitions: {
        Row: {
          confidence: number | null
          consultant_id: string | null
          created_at: string
          customer_id: string | null
          duration_ms: number | null
          from_step: string | null
          id: string
          intent: string | null
          phone: string | null
          to_step: string
        }
        Insert: {
          confidence?: number | null
          consultant_id?: string | null
          created_at?: string
          customer_id?: string | null
          duration_ms?: number | null
          from_step?: string | null
          id?: string
          intent?: string | null
          phone?: string | null
          to_step: string
        }
        Update: {
          confidence?: number | null
          consultant_id?: string | null
          created_at?: string
          customer_id?: string | null
          duration_ms?: number | null
          from_step?: string | null
          id?: string
          intent?: string | null
          phone?: string | null
          to_step?: string
        }
        Relationships: []
      }
      consultant_ad_settings: {
        Row: {
          age_max: number
          age_min: number
          cities: Json
          consultant_id: string
          created_at: string
          display_name: string | null
          distribuidora_default: string | null
          updated_at: string
          whatsapp_destination_number: string | null
        }
        Insert: {
          age_max?: number
          age_min?: number
          cities?: Json
          consultant_id: string
          created_at?: string
          display_name?: string | null
          distribuidora_default?: string | null
          updated_at?: string
          whatsapp_destination_number?: string | null
        }
        Update: {
          age_max?: number
          age_min?: number
          cities?: Json
          consultant_id?: string
          created_at?: string
          display_name?: string | null
          distribuidora_default?: string | null
          updated_at?: string
          whatsapp_destination_number?: string | null
        }
        Relationships: []
      }
      consultant_wallet: {
        Row: {
          auto_pause_at_cents: number
          balance_cents: number
          consultant_id: string
          created_at: string
          debt_cents: number
          last_synced_at: string | null
          total_spent_cents: number
          total_topped_up_cents: number
          updated_at: string
        }
        Insert: {
          auto_pause_at_cents?: number
          balance_cents?: number
          consultant_id: string
          created_at?: string
          debt_cents?: number
          last_synced_at?: string | null
          total_spent_cents?: number
          total_topped_up_cents?: number
          updated_at?: string
        }
        Update: {
          auto_pause_at_cents?: number
          balance_cents?: number
          consultant_id?: string
          created_at?: string
          debt_cents?: number
          last_synced_at?: string | null
          total_spent_cents?: number
          total_topped_up_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      consultants: {
        Row: {
          approved: boolean | null
          cadastro_url: string
          conversational_flow_enabled: boolean
          created_at: string | null
          facebook_label_id: string | null
          facebook_pixel_id: string | null
          flow_step_media_order: Json
          google_analytics_id: string | null
          id: string
          igreen_id: string | null
          igreen_portal_email: string | null
          igreen_portal_password: string | null
          licenciada_cadastro_url: string | null
          license: string
          name: string
          phone: string
          photo_url: string | null
          referred_by: string | null
        }
        Insert: {
          approved?: boolean | null
          cadastro_url: string
          conversational_flow_enabled?: boolean
          created_at?: string | null
          facebook_label_id?: string | null
          facebook_pixel_id?: string | null
          flow_step_media_order?: Json
          google_analytics_id?: string | null
          id: string
          igreen_id?: string | null
          igreen_portal_email?: string | null
          igreen_portal_password?: string | null
          licenciada_cadastro_url?: string | null
          license: string
          name: string
          phone: string
          photo_url?: string | null
          referred_by?: string | null
        }
        Update: {
          approved?: boolean | null
          cadastro_url?: string
          conversational_flow_enabled?: boolean
          created_at?: string | null
          facebook_label_id?: string | null
          facebook_pixel_id?: string | null
          flow_step_media_order?: Json
          google_analytics_id?: string | null
          id?: string
          igreen_id?: string | null
          igreen_portal_email?: string | null
          igreen_portal_password?: string | null
          licenciada_cadastro_url?: string | null
          license?: string
          name?: string
          phone?: string
          photo_url?: string | null
          referred_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultants_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultants_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "consultants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          conversation_step: string | null
          created_at: string
          customer_id: string
          id: string
          message_direction: string
          message_text: string | null
          message_type: string | null
        }
        Insert: {
          conversation_step?: string | null
          created_at?: string
          customer_id: string
          id?: string
          message_direction: string
          message_text?: string | null
          message_type?: string | null
        }
        Update: {
          conversation_step?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          message_direction?: string
          message_text?: string | null
          message_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_auto_message_log: {
        Row: {
          consultant_id: string
          created_at: string
          customer_name: string | null
          deal_id: string
          id: string
          message_preview: string | null
          remote_jid: string | null
          stage_key: string
          status: string
        }
        Insert: {
          consultant_id: string
          created_at?: string
          customer_name?: string | null
          deal_id: string
          id?: string
          message_preview?: string | null
          remote_jid?: string | null
          stage_key: string
          status?: string
        }
        Update: {
          consultant_id?: string
          created_at?: string
          customer_name?: string | null
          deal_id?: string
          id?: string
          message_preview?: string | null
          remote_jid?: string | null
          stage_key?: string
          status?: string
        }
        Relationships: []
      }
      crm_deals: {
        Row: {
          approved_at: string | null
          consultant_id: string
          created_at: string
          customer_id: string | null
          deal_origin: string | null
          id: string
          notes: string | null
          rejected_at: string | null
          rejection_reason: string | null
          remote_jid: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          consultant_id: string
          created_at?: string
          customer_id?: string | null
          deal_origin?: string | null
          id?: string
          notes?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          remote_jid?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          consultant_id?: string
          created_at?: string
          customer_id?: string | null
          deal_origin?: string | null
          id?: string
          notes?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          remote_jid?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_deals_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_page_events: {
        Row: {
          created_at: string
          device_type: string | null
          event_target: string | null
          event_type: string
          id: string
          referrer: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          event_target?: string | null
          event_type?: string
          id?: string
          referrer?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          created_at?: string
          device_type?: string | null
          event_target?: string | null
          event_type?: string
          id?: string
          referrer?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      customer_memory: {
        Row: {
          active: boolean
          category: string
          confidence: number
          consultant_id: string
          created_at: string
          customer_id: string
          expires_at: string | null
          id: string
          key: string
          last_confirmed_at: string
          metadata: Json | null
          source: string
          updated_at: string
          value: string
        }
        Insert: {
          active?: boolean
          category: string
          confidence?: number
          consultant_id: string
          created_at?: string
          customer_id: string
          expires_at?: string | null
          id?: string
          key: string
          last_confirmed_at?: string
          metadata?: Json | null
          source?: string
          updated_at?: string
          value: string
        }
        Update: {
          active?: boolean
          category?: string
          confidence?: number
          consultant_id?: string
          created_at?: string
          customer_id?: string
          expires_at?: string | null
          id?: string
          key?: string
          last_confirmed_at?: string
          metadata?: Json | null
          source?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      customer_tags: {
        Row: {
          consultant_id: string
          created_at: string
          id: string
          remote_jid: string
          tag_color: string
          tag_name: string
        }
        Insert: {
          consultant_id: string
          created_at?: string
          id?: string
          remote_jid: string
          tag_color?: string
          tag_name: string
        }
        Update: {
          consultant_id?: string
          created_at?: string
          id?: string
          remote_jid?: string
          tag_color?: string
          tag_name?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          ai_last_rescue_at: string | null
          ai_rescue_count: number
          andamento_igreen: string | null
          assigned_human_id: string | null
          assinatura_cliente: string | null
          assinatura_igreen: string | null
          bill_base64: string | null
          bill_message_id: string | null
          bill_requested_at: string | null
          bot_paused: boolean
          bot_paused_at: string | null
          bot_paused_reason: string | null
          bot_paused_until: string | null
          cashback: string | null
          cep: string | null
          consultant_id: string | null
          conta_pdf_protegida: boolean | null
          conversation_step: string | null
          conversation_summary: string | null
          conversational_flow_enabled: boolean | null
          cpf: string | null
          created_at: string
          customer_referred_by_consultant_id: string | null
          customer_referred_by_name: string | null
          customer_referred_by_phone: string | null
          data_ativo: string | null
          data_cadastro: string | null
          data_nascimento: string | null
          data_validado: string | null
          debitos_aberto: boolean | null
          desconto_cliente: number | null
          devolutiva: string | null
          distribuidora: string | null
          document_back_url: string | null
          document_front_base64: string | null
          document_front_url: string | null
          document_type: string | null
          electricity_bill_photo_url: string | null
          electricity_bill_value: number | null
          email: string | null
          error_message: string | null
          facial_confirmed_at: string | null
          followup_count: number
          id: string
          igreen_code: string | null
          igreen_link: string | null
          intent_signals: Json | null
          last_bot_interaction_at: string | null
          last_bot_reply_at: string | null
          last_followup_at: string | null
          last_rescue_at: string | null
          lead_source: Json | null
          link_assinatura: string | null
          link_facial: string | null
          media_consumo: number | null
          media_message_id: string | null
          media_storage: string | null
          name: string | null
          name_source: string | null
          next_followup_at: string | null
          next_rescue_allowed_at: string | null
          nivel_licenciado: string | null
          nome_mae: string | null
          nome_pai: string | null
          numero_instalacao: string | null
          observacao: string | null
          ocr_confianca: number | null
          ocr_conta_attempts: number
          ocr_doc_attempts: number
          ocr_done: boolean
          otp_code: string | null
          otp_received_at: string | null
          pain_point: string | null
          phone_contact_confirmed: boolean
          phone_landline: string | null
          phone_whatsapp: string
          portal_submitted_at: string | null
          possui_procurador: boolean | null
          qualification_score: number | null
          registered_by_igreen_id: string | null
          registered_by_name: string | null
          rescue_attempts: number
          rg: string | null
          sales_phase: string | null
          senha_pdf: string | null
          status: string
          status_financeiro: string | null
          summary_updated_at: string | null
          tipo_produto: string
          updated_at: string
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          ai_last_rescue_at?: string | null
          ai_rescue_count?: number
          andamento_igreen?: string | null
          assigned_human_id?: string | null
          assinatura_cliente?: string | null
          assinatura_igreen?: string | null
          bill_base64?: string | null
          bill_message_id?: string | null
          bill_requested_at?: string | null
          bot_paused?: boolean
          bot_paused_at?: string | null
          bot_paused_reason?: string | null
          bot_paused_until?: string | null
          cashback?: string | null
          cep?: string | null
          consultant_id?: string | null
          conta_pdf_protegida?: boolean | null
          conversation_step?: string | null
          conversation_summary?: string | null
          conversational_flow_enabled?: boolean | null
          cpf?: string | null
          created_at?: string
          customer_referred_by_consultant_id?: string | null
          customer_referred_by_name?: string | null
          customer_referred_by_phone?: string | null
          data_ativo?: string | null
          data_cadastro?: string | null
          data_nascimento?: string | null
          data_validado?: string | null
          debitos_aberto?: boolean | null
          desconto_cliente?: number | null
          devolutiva?: string | null
          distribuidora?: string | null
          document_back_url?: string | null
          document_front_base64?: string | null
          document_front_url?: string | null
          document_type?: string | null
          electricity_bill_photo_url?: string | null
          electricity_bill_value?: number | null
          email?: string | null
          error_message?: string | null
          facial_confirmed_at?: string | null
          followup_count?: number
          id?: string
          igreen_code?: string | null
          igreen_link?: string | null
          intent_signals?: Json | null
          last_bot_interaction_at?: string | null
          last_bot_reply_at?: string | null
          last_followup_at?: string | null
          last_rescue_at?: string | null
          lead_source?: Json | null
          link_assinatura?: string | null
          link_facial?: string | null
          media_consumo?: number | null
          media_message_id?: string | null
          media_storage?: string | null
          name?: string | null
          name_source?: string | null
          next_followup_at?: string | null
          next_rescue_allowed_at?: string | null
          nivel_licenciado?: string | null
          nome_mae?: string | null
          nome_pai?: string | null
          numero_instalacao?: string | null
          observacao?: string | null
          ocr_confianca?: number | null
          ocr_conta_attempts?: number
          ocr_doc_attempts?: number
          ocr_done?: boolean
          otp_code?: string | null
          otp_received_at?: string | null
          pain_point?: string | null
          phone_contact_confirmed?: boolean
          phone_landline?: string | null
          phone_whatsapp: string
          portal_submitted_at?: string | null
          possui_procurador?: boolean | null
          qualification_score?: number | null
          registered_by_igreen_id?: string | null
          registered_by_name?: string | null
          rescue_attempts?: number
          rg?: string | null
          sales_phase?: string | null
          senha_pdf?: string | null
          status?: string
          status_financeiro?: string | null
          summary_updated_at?: string | null
          tipo_produto?: string
          updated_at?: string
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          ai_last_rescue_at?: string | null
          ai_rescue_count?: number
          andamento_igreen?: string | null
          assigned_human_id?: string | null
          assinatura_cliente?: string | null
          assinatura_igreen?: string | null
          bill_base64?: string | null
          bill_message_id?: string | null
          bill_requested_at?: string | null
          bot_paused?: boolean
          bot_paused_at?: string | null
          bot_paused_reason?: string | null
          bot_paused_until?: string | null
          cashback?: string | null
          cep?: string | null
          consultant_id?: string | null
          conta_pdf_protegida?: boolean | null
          conversation_step?: string | null
          conversation_summary?: string | null
          conversational_flow_enabled?: boolean | null
          cpf?: string | null
          created_at?: string
          customer_referred_by_consultant_id?: string | null
          customer_referred_by_name?: string | null
          customer_referred_by_phone?: string | null
          data_ativo?: string | null
          data_cadastro?: string | null
          data_nascimento?: string | null
          data_validado?: string | null
          debitos_aberto?: boolean | null
          desconto_cliente?: number | null
          devolutiva?: string | null
          distribuidora?: string | null
          document_back_url?: string | null
          document_front_base64?: string | null
          document_front_url?: string | null
          document_type?: string | null
          electricity_bill_photo_url?: string | null
          electricity_bill_value?: number | null
          email?: string | null
          error_message?: string | null
          facial_confirmed_at?: string | null
          followup_count?: number
          id?: string
          igreen_code?: string | null
          igreen_link?: string | null
          intent_signals?: Json | null
          last_bot_interaction_at?: string | null
          last_bot_reply_at?: string | null
          last_followup_at?: string | null
          last_rescue_at?: string | null
          lead_source?: Json | null
          link_assinatura?: string | null
          link_facial?: string | null
          media_consumo?: number | null
          media_message_id?: string | null
          media_storage?: string | null
          name?: string | null
          name_source?: string | null
          next_followup_at?: string | null
          next_rescue_allowed_at?: string | null
          nivel_licenciado?: string | null
          nome_mae?: string | null
          nome_pai?: string | null
          numero_instalacao?: string | null
          observacao?: string | null
          ocr_confianca?: number | null
          ocr_conta_attempts?: number
          ocr_doc_attempts?: number
          ocr_done?: boolean
          otp_code?: string | null
          otp_received_at?: string | null
          pain_point?: string | null
          phone_contact_confirmed?: boolean
          phone_landline?: string | null
          phone_whatsapp?: string
          portal_submitted_at?: string | null
          possui_procurador?: boolean | null
          qualification_score?: number | null
          registered_by_igreen_id?: string | null
          registered_by_name?: string | null
          rescue_attempts?: number
          rg?: string | null
          sales_phase?: string | null
          senha_pdf?: string | null
          status?: string
          status_financeiro?: string | null
          summary_updated_at?: string | null
          tipo_produto?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_customer_referred_by_consultant_id_fkey"
            columns: ["customer_referred_by_consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_customer_referred_by_consultant_id_fkey"
            columns: ["customer_referred_by_consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_campaigns: {
        Row: {
          age_max: number
          age_min: number
          cities: Json
          consultant_id: string
          created_at: string
          creative_pack_id: string | null
          daily_budget_cents: number
          distribuidora: string | null
          duration_days: number | null
          ended_at: string | null
          fb_ad_ids: Json
          fb_adset_ids: Json
          fb_campaign_id: string | null
          id: string
          initial_message: string | null
          leads_count: number
          migrated_to_abo_at: string | null
          name: string
          optimization_strategy: string
          parent_campaign_id: string | null
          pixel_event_optimized: string | null
          rejection_reason: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          age_max?: number
          age_min?: number
          cities?: Json
          consultant_id: string
          created_at?: string
          creative_pack_id?: string | null
          daily_budget_cents: number
          distribuidora?: string | null
          duration_days?: number | null
          ended_at?: string | null
          fb_ad_ids?: Json
          fb_adset_ids?: Json
          fb_campaign_id?: string | null
          id?: string
          initial_message?: string | null
          leads_count?: number
          migrated_to_abo_at?: string | null
          name: string
          optimization_strategy?: string
          parent_campaign_id?: string | null
          pixel_event_optimized?: string | null
          rejection_reason?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          age_max?: number
          age_min?: number
          cities?: Json
          consultant_id?: string
          created_at?: string
          creative_pack_id?: string | null
          daily_budget_cents?: number
          distribuidora?: string | null
          duration_days?: number | null
          ended_at?: string | null
          fb_ad_ids?: Json
          fb_adset_ids?: Json
          fb_campaign_id?: string | null
          id?: string
          initial_message?: string | null
          leads_count?: number
          migrated_to_abo_at?: string | null
          name?: string
          optimization_strategy?: string
          parent_campaign_id?: string | null
          pixel_event_optimized?: string | null
          rejection_reason?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facebook_campaigns_creative_pack_id_fkey"
            columns: ["creative_pack_id"]
            isOneToOne: false
            referencedRelation: "facebook_creative_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facebook_campaigns_parent_campaign_id_fkey"
            columns: ["parent_campaign_id"]
            isOneToOne: false
            referencedRelation: "facebook_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_capi_events: {
        Row: {
          consultant_id: string
          created_at: string
          customer_id: string | null
          event_id: string
          event_name: string
          event_time: string
          fb_response: Json | null
          id: string
          status: string
        }
        Insert: {
          consultant_id: string
          created_at?: string
          customer_id?: string | null
          event_id: string
          event_name: string
          event_time?: string
          fb_response?: Json | null
          id?: string
          status?: string
        }
        Update: {
          consultant_id?: string
          created_at?: string
          customer_id?: string | null
          event_id?: string
          event_name?: string
          event_time?: string
          fb_response?: Json | null
          id?: string
          status?: string
        }
        Relationships: []
      }
      facebook_connections: {
        Row: {
          access_token_encrypted: string
          ad_account_currency: string | null
          ad_account_id: string | null
          ad_account_name: string | null
          audience_source_count: number | null
          audience_synced_at: string | null
          business_id: string | null
          business_name: string | null
          consultant_id: string
          created_at: string
          custom_audience_id: string | null
          fb_user_id: string
          fb_user_name: string | null
          id: string
          ig_account_id: string | null
          ig_account_username: string | null
          last_validated_at: string | null
          lookalike_audience_id: string | null
          page_id: string | null
          page_name: string | null
          pixel_id: string | null
          pixel_name: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
          validation_errors: Json | null
          whatsapp_destination_number: string | null
          whatsapp_display_number: string | null
          whatsapp_phone_number_id: string | null
        }
        Insert: {
          access_token_encrypted: string
          ad_account_currency?: string | null
          ad_account_id?: string | null
          ad_account_name?: string | null
          audience_source_count?: number | null
          audience_synced_at?: string | null
          business_id?: string | null
          business_name?: string | null
          consultant_id: string
          created_at?: string
          custom_audience_id?: string | null
          fb_user_id: string
          fb_user_name?: string | null
          id?: string
          ig_account_id?: string | null
          ig_account_username?: string | null
          last_validated_at?: string | null
          lookalike_audience_id?: string | null
          page_id?: string | null
          page_name?: string | null
          pixel_id?: string | null
          pixel_name?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          validation_errors?: Json | null
          whatsapp_destination_number?: string | null
          whatsapp_display_number?: string | null
          whatsapp_phone_number_id?: string | null
        }
        Update: {
          access_token_encrypted?: string
          ad_account_currency?: string | null
          ad_account_id?: string | null
          ad_account_name?: string | null
          audience_source_count?: number | null
          audience_synced_at?: string | null
          business_id?: string | null
          business_name?: string | null
          consultant_id?: string
          created_at?: string
          custom_audience_id?: string | null
          fb_user_id?: string
          fb_user_name?: string | null
          id?: string
          ig_account_id?: string | null
          ig_account_username?: string | null
          last_validated_at?: string | null
          lookalike_audience_id?: string | null
          page_id?: string | null
          page_name?: string | null
          pixel_id?: string | null
          pixel_name?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          validation_errors?: Json | null
          whatsapp_destination_number?: string | null
          whatsapp_display_number?: string | null
          whatsapp_phone_number_id?: string | null
        }
        Relationships: []
      }
      facebook_creative_packs: {
        Row: {
          consultant_id: string
          copy_pack: Json
          created_at: string
          generated_variants: Json
          id: string
          name: string
          photos: Json
          updated_at: string
        }
        Insert: {
          consultant_id: string
          copy_pack?: Json
          created_at?: string
          generated_variants?: Json
          id?: string
          name?: string
          photos?: Json
          updated_at?: string
        }
        Update: {
          consultant_id?: string
          copy_pack?: Json
          created_at?: string
          generated_variants?: Json
          id?: string
          name?: string
          photos?: Json
          updated_at?: string
        }
        Relationships: []
      }
      facebook_metrics_daily: {
        Row: {
          campaign_id: string
          clicks: number
          complete_registrations: number
          cost_per_lead_cents: number
          cpl_by_placement: Json | null
          cpm_cents: number
          ctr_bps: number
          customers_acquired: number
          date: string
          frequency_x100: number
          gross_spend_cents: number
          impressions: number
          leads: number
          messaging_conversations_started: number
          reach: number
          spend_cents: number
          synced_to_wallet_cents: number
          updated_at: string
        }
        Insert: {
          campaign_id: string
          clicks?: number
          complete_registrations?: number
          cost_per_lead_cents?: number
          cpl_by_placement?: Json | null
          cpm_cents?: number
          ctr_bps?: number
          customers_acquired?: number
          date: string
          frequency_x100?: number
          gross_spend_cents?: number
          impressions?: number
          leads?: number
          messaging_conversations_started?: number
          reach?: number
          spend_cents?: number
          synced_to_wallet_cents?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          clicks?: number
          complete_registrations?: number
          cost_per_lead_cents?: number
          cpl_by_placement?: Json | null
          cpm_cents?: number
          ctr_bps?: number
          customers_acquired?: number
          date?: string
          frequency_x100?: number
          gross_spend_cents?: number
          impressions?: number
          leads?: number
          messaging_conversations_started?: number
          reach?: number
          spend_cents?: number
          synced_to_wallet_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facebook_metrics_daily_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "facebook_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      fb_city_cache: {
        Row: {
          country_code: string
          created_at: string
          fb_key: string
          name: string
          region: string | null
          region_id: number | null
          uf: string
        }
        Insert: {
          country_code?: string
          created_at?: string
          fb_key: string
          name: string
          region?: string | null
          region_id?: number | null
          uf: string
        }
        Update: {
          country_code?: string
          created_at?: string
          fb_key?: string
          name?: string
          region?: string | null
          region_id?: number | null
          uf?: string
        }
        Relationships: []
      }
      kanban_stages: {
        Row: {
          auto_message_enabled: boolean
          auto_message_image_url: string | null
          auto_message_media_url: string | null
          auto_message_text: string | null
          auto_message_type: string | null
          color: string
          consultant_id: string
          created_at: string
          id: string
          label: string
          position: number
          stage_key: string
        }
        Insert: {
          auto_message_enabled?: boolean
          auto_message_image_url?: string | null
          auto_message_media_url?: string | null
          auto_message_text?: string | null
          auto_message_type?: string | null
          color?: string
          consultant_id: string
          created_at?: string
          id?: string
          label: string
          position?: number
          stage_key: string
        }
        Update: {
          auto_message_enabled?: boolean
          auto_message_image_url?: string | null
          auto_message_media_url?: string | null
          auto_message_text?: string | null
          auto_message_type?: string | null
          color?: string
          consultant_id?: string
          created_at?: string
          id?: string
          label?: string
          position?: number
          stage_key?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          consultant_id: string
          content: string
          created_at: string | null
          id: string
          image_url: string | null
          media_type: string | null
          media_url: string | null
          name: string
          origin_template_id: string | null
        }
        Insert: {
          consultant_id: string
          content: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          media_type?: string | null
          media_url?: string | null
          name: string
          origin_template_id?: string | null
        }
        Update: {
          consultant_id?: string
          content?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          media_type?: string | null
          media_url?: string | null
          name?: string
          origin_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_origin_template_id_fkey"
            columns: ["origin_template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      network_members: {
        Row: {
          bonificavel: number | null
          cidade: string | null
          clientes_ativos: number | null
          consultant_id: string
          data_ativo: string | null
          data_nascimento: string | null
          diretos_ativos: number | null
          diretos_inicio_rapido: number | null
          diretos_mes: number | null
          gi: number | null
          gi_mes: number | null
          gi_total: number | null
          gp: number | null
          gp_mes: number | null
          gp_total: number | null
          graduacao: string | null
          graduacao_expansao: string | null
          green_points: number | null
          green_points_mes: number | null
          id: string
          igreen_id: number
          inicio_rapido: string | null
          name: string
          nivel: number | null
          phone: string | null
          pro: string | null
          qtde_diretos: number | null
          sponsor_id: number | null
          total_pontos: number | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          bonificavel?: number | null
          cidade?: string | null
          clientes_ativos?: number | null
          consultant_id: string
          data_ativo?: string | null
          data_nascimento?: string | null
          diretos_ativos?: number | null
          diretos_inicio_rapido?: number | null
          diretos_mes?: number | null
          gi?: number | null
          gi_mes?: number | null
          gi_total?: number | null
          gp?: number | null
          gp_mes?: number | null
          gp_total?: number | null
          graduacao?: string | null
          graduacao_expansao?: string | null
          green_points?: number | null
          green_points_mes?: number | null
          id?: string
          igreen_id: number
          inicio_rapido?: string | null
          name: string
          nivel?: number | null
          phone?: string | null
          pro?: string | null
          qtde_diretos?: number | null
          sponsor_id?: number | null
          total_pontos?: number | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          bonificavel?: number | null
          cidade?: string | null
          clientes_ativos?: number | null
          consultant_id?: string
          data_ativo?: string | null
          data_nascimento?: string | null
          diretos_ativos?: number | null
          diretos_inicio_rapido?: number | null
          diretos_mes?: number | null
          gi?: number | null
          gi_mes?: number | null
          gi_total?: number | null
          gp?: number | null
          gp_mes?: number | null
          gp_total?: number | null
          graduacao?: string | null
          graduacao_expansao?: string | null
          green_points?: number | null
          green_points_mes?: number | null
          id?: string
          igreen_id?: number
          inicio_rapido?: string | null
          name?: string
          nivel?: number | null
          phone?: string | null
          pro?: string | null
          qtde_diretos?: number | null
          sponsor_id?: number | null
          total_pontos?: number | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      page_events: {
        Row: {
          consultant_id: string
          created_at: string
          device_type: string | null
          event_target: string | null
          event_type: string
          id: string
          page_type: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          consultant_id: string
          created_at?: string
          device_type?: string | null
          event_target?: string | null
          event_type?: string
          id?: string
          page_type?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          consultant_id?: string
          created_at?: string
          device_type?: string | null
          event_target?: string | null
          event_type?: string
          id?: string
          page_type?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_events_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_events_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      page_views: {
        Row: {
          consultant_id: string
          created_at: string
          device_type: string | null
          id: string
          page_type: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          consultant_id: string
          created_at?: string
          device_type?: string | null
          id?: string
          page_type?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          consultant_id?: string
          created_at?: string
          device_type?: string | null
          id?: string
          page_type?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_views_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_views_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_facebook_account: {
        Row: {
          access_token_encrypted: string
          ad_account_currency: string | null
          ad_account_id: string | null
          ad_account_name: string | null
          audience_source_count: number | null
          audience_synced_at: string | null
          business_id: string | null
          business_name: string | null
          created_at: string
          custom_audience_id: string | null
          fb_user_id: string | null
          fb_user_name: string | null
          id: boolean
          ig_account_id: string | null
          ig_account_username: string | null
          last_validated_at: string | null
          lookalike_audience_id: string | null
          page_id: string | null
          page_name: string | null
          pixel_id: string | null
          pixel_name: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
          validation_errors: Json | null
        }
        Insert: {
          access_token_encrypted: string
          ad_account_currency?: string | null
          ad_account_id?: string | null
          ad_account_name?: string | null
          audience_source_count?: number | null
          audience_synced_at?: string | null
          business_id?: string | null
          business_name?: string | null
          created_at?: string
          custom_audience_id?: string | null
          fb_user_id?: string | null
          fb_user_name?: string | null
          id?: boolean
          ig_account_id?: string | null
          ig_account_username?: string | null
          last_validated_at?: string | null
          lookalike_audience_id?: string | null
          page_id?: string | null
          page_name?: string | null
          pixel_id?: string | null
          pixel_name?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          validation_errors?: Json | null
        }
        Update: {
          access_token_encrypted?: string
          ad_account_currency?: string | null
          ad_account_id?: string | null
          ad_account_name?: string | null
          audience_source_count?: number | null
          audience_synced_at?: string | null
          business_id?: string | null
          business_name?: string | null
          created_at?: string
          custom_audience_id?: string | null
          fb_user_id?: string | null
          fb_user_name?: string | null
          id?: boolean
          ig_account_id?: string | null
          ig_account_username?: string | null
          last_validated_at?: string | null
          lookalike_audience_id?: string | null
          page_id?: string | null
          page_name?: string | null
          pixel_id?: string | null
          pixel_name?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          validation_errors?: Json | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          campaign_safety_multiplier: number
          default_auto_pause_at_cents: number
          id: boolean
          iof_compensation_percent: number
          low_balance_alert_cents: number
          min_balance_to_create_campaign_cents: number
          platform_fee_percent: number
          updated_at: string
        }
        Insert: {
          campaign_safety_multiplier?: number
          default_auto_pause_at_cents?: number
          id?: boolean
          iof_compensation_percent?: number
          low_balance_alert_cents?: number
          min_balance_to_create_campaign_cents?: number
          platform_fee_percent?: number
          updated_at?: string
        }
        Update: {
          campaign_safety_multiplier?: number
          default_auto_pause_at_cents?: number
          id?: boolean
          iof_compensation_percent?: number
          low_balance_alert_cents?: number
          min_balance_to_create_campaign_cents?: number
          platform_fee_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_messages: {
        Row: {
          consultant_id: string
          created_at: string
          id: string
          instance_name: string
          message_text: string
          remote_jid: string
          scheduled_at: string
          sent_at: string | null
          status: string
        }
        Insert: {
          consultant_id: string
          created_at?: string
          id?: string
          instance_name: string
          message_text: string
          remote_jid: string
          scheduled_at: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          consultant_id?: string
          created_at?: string
          id?: string
          instance_name?: string
          message_text?: string
          remote_jid?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value?: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      stage_auto_messages: {
        Row: {
          consultant_id: string
          created_at: string
          deal_origin: string | null
          delay_seconds: number
          id: string
          image_url: string | null
          media_url: string | null
          message_text: string | null
          message_type: string
          position: number
          rejection_reason: string | null
          stage_id: string
        }
        Insert: {
          consultant_id: string
          created_at?: string
          deal_origin?: string | null
          delay_seconds?: number
          id?: string
          image_url?: string | null
          media_url?: string | null
          message_text?: string | null
          message_type?: string
          position?: number
          rejection_reason?: string | null
          stage_id: string
        }
        Update: {
          consultant_id?: string
          created_at?: string
          deal_origin?: string | null
          delay_seconds?: number
          id?: string
          image_url?: string | null
          media_url?: string | null
          message_text?: string | null
          message_type?: string
          position?: number
          rejection_reason?: string | null
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_auto_messages_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "kanban_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_migration_log: {
        Row: {
          attempts: number
          completed_at: string | null
          consultant_id: string | null
          created_at: string
          customer_jid: string | null
          error: string | null
          id: string
          media_kind: string | null
          size_bytes: number | null
          source_bucket: string
          source_path: string
          source_url: string | null
          started_at: string | null
          status: string
          target_object_key: string | null
          target_url: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          consultant_id?: string | null
          created_at?: string
          customer_jid?: string | null
          error?: string | null
          id?: string
          media_kind?: string | null
          size_bytes?: number | null
          source_bucket: string
          source_path: string
          source_url?: string | null
          started_at?: string | null
          status?: string
          target_object_key?: string | null
          target_url?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          consultant_id?: string | null
          created_at?: string
          customer_jid?: string | null
          error?: string | null
          id?: string
          media_kind?: string | null
          size_bytes?: number | null
          source_bucket?: string
          source_path?: string
          source_url?: string | null
          started_at?: string | null
          status?: string
          target_object_key?: string | null
          target_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount_cents: number
          balance_after_cents: number | null
          campaign_id: string | null
          consultant_id: string
          created_at: string
          description: string | null
          gross_spend_cents: number | null
          id: string
          metadata: Json | null
          stripe_fee_cents: number
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          type: string
        }
        Insert: {
          amount_cents: number
          balance_after_cents?: number | null
          campaign_id?: string | null
          consultant_id: string
          created_at?: string
          description?: string | null
          gross_spend_cents?: number | null
          id?: string
          metadata?: Json | null
          stripe_fee_cents?: number
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          type: string
        }
        Update: {
          amount_cents?: number
          balance_after_cents?: number | null
          campaign_id?: string | null
          consultant_id?: string
          created_at?: string
          description?: string | null
          gross_spend_cents?: number | null
          id?: string
          metadata?: Json | null
          stripe_fee_cents?: number
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          type?: string
        }
        Relationships: []
      }
      webhook_message_dedup: {
        Row: {
          instance_name: string
          message_id: string
          processed_at: string
        }
        Insert: {
          instance_name: string
          message_id: string
          processed_at?: string
        }
        Update: {
          instance_name?: string
          message_id?: string
          processed_at?: string
        }
        Relationships: []
      }
      whatsapp_instances: {
        Row: {
          connected_phone: string | null
          consultant_id: string
          created_at: string | null
          id: string
          instance_name: string
          last_health_check_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          connected_phone?: string | null
          consultant_id: string
          created_at?: string | null
          id?: string
          instance_name: string
          last_health_check_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          connected_phone?: string | null
          consultant_id?: string
          created_at?: string | null
          id?: string
          instance_name?: string
          last_health_check_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_message_buffer: {
        Row: {
          consultant_id: string
          created_at: string
          customer_id: string | null
          id: string
          message_id: string | null
          message_text: string | null
          phone: string
          processed_at: string | null
          raw_payload: Json | null
          remote_jid: string | null
        }
        Insert: {
          consultant_id: string
          created_at?: string
          customer_id?: string | null
          id?: string
          message_id?: string | null
          message_text?: string | null
          phone: string
          processed_at?: string | null
          raw_payload?: Json | null
          remote_jid?: string | null
        }
        Update: {
          consultant_id?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          message_id?: string | null
          message_text?: string | null
          phone?: string
          processed_at?: string | null
          raw_payload?: Json | null
          remote_jid?: string | null
        }
        Relationships: []
      }
      worker_phase_logs: {
        Row: {
          attempt: number | null
          created_at: string
          customer_id: string | null
          duration_ms: number | null
          id: string
          message: string | null
          phase: string
          screenshot_url: string | null
          selector_used: string | null
          status: string
          worker_version: string | null
        }
        Insert: {
          attempt?: number | null
          created_at?: string
          customer_id?: string | null
          duration_ms?: number | null
          id?: string
          message?: string | null
          phase: string
          screenshot_url?: string | null
          selector_used?: string | null
          status?: string
          worker_version?: string | null
        }
        Update: {
          attempt?: number | null
          created_at?: string
          customer_id?: string | null
          duration_ms?: number | null
          id?: string
          message?: string | null
          phase?: string
          screenshot_url?: string | null
          selector_used?: string | null
          status?: string
          worker_version?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      consultants_public: {
        Row: {
          cadastro_url: string | null
          created_at: string | null
          facebook_pixel_id: string | null
          google_analytics_id: string | null
          id: string | null
          igreen_id: string | null
          licenciada_cadastro_url: string | null
          license: string | null
          name: string | null
          phone: string | null
          photo_url: string | null
          referred_by: string | null
        }
        Insert: {
          cadastro_url?: string | null
          created_at?: string | null
          facebook_pixel_id?: string | null
          google_analytics_id?: string | null
          id?: string | null
          igreen_id?: string | null
          licenciada_cadastro_url?: string | null
          license?: string | null
          name?: string | null
          phone?: string | null
          photo_url?: string | null
          referred_by?: string | null
        }
        Update: {
          cadastro_url?: string | null
          created_at?: string | null
          facebook_pixel_id?: string | null
          google_analytics_id?: string | null
          id?: string | null
          igreen_id?: string | null
          licenciada_cadastro_url?: string | null
          license?: string | null
          name?: string | null
          phone?: string | null
          photo_url?: string | null
          referred_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultants_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultants_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "consultants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_memory_active: {
        Row: {
          active: boolean | null
          category: string | null
          confidence: number | null
          consultant_id: string | null
          created_at: string | null
          customer_id: string | null
          expires_at: string | null
          id: string | null
          key: string | null
          last_confirmed_at: string | null
          metadata: Json | null
          source: string | null
          updated_at: string | null
          value: string | null
        }
        Insert: {
          active?: boolean | null
          category?: string | null
          confidence?: number | null
          consultant_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          expires_at?: string | null
          id?: string | null
          key?: string | null
          last_confirmed_at?: string | null
          metadata?: Json | null
          source?: string | null
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          active?: boolean | null
          category?: string | null
          confidence?: number | null
          consultant_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          expires_at?: string | null
          id?: string | null
          key?: string | null
          last_confirmed_at?: string | null
          metadata?: Json | null
          source?: string | null
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      v_ai_agent_health: {
        Row: {
          avg_latency_ms: number | null
          consultant_id: string | null
          day: string | null
          decisions: number | null
          handoffs: number | null
          intent_detected: string | null
          media_sent: number | null
          model: string | null
          phase: string | null
          selfcheck_blocks: number | null
          tool_called: string | null
        }
        Relationships: []
      }
      whatsapp_instances_public: {
        Row: {
          connected_phone: string | null
          instance_name: string | null
        }
        Insert: {
          connected_phone?: string | null
          instance_name?: string | null
        }
        Update: {
          connected_phone?: string | null
          instance_name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_unpause_global_bot: { Args: never; Returns: number }
      cleanup_webhook_artifacts: { Args: never; Returns: undefined }
      credit_consultant_wallet:
        | {
            Args: {
              _amount_cents: number
              _consultant_id: string
              _description?: string
              _metadata?: Json
              _stripe_payment_intent_id?: string
              _stripe_session_id?: string
            }
            Returns: number
          }
        | {
            Args: {
              _amount_cents: number
              _consultant_id: string
              _description?: string
              _metadata?: Json
              _stripe_fee_cents?: number
              _stripe_payment_intent_id?: string
              _stripe_session_id?: string
            }
            Returns: number
          }
      debit_consultant_wallet:
        | {
            Args: {
              _amount_cents: number
              _campaign_id?: string
              _consultant_id: string
              _description?: string
              _metadata?: Json
            }
            Returns: number
          }
        | {
            Args: {
              _amount_cents: number
              _campaign_id?: string
              _consultant_id: string
              _description?: string
              _gross_spend_cents?: number
              _metadata?: Json
            }
            Returns: number
          }
      fb_emit_capi: {
        Args: {
          _consultant_id: string
          _customer_id?: string
          _email?: string
          _event_name: string
          _phone?: string
          _value?: number
        }
        Returns: undefined
      }
      fork_ad_template: { Args: { _origin_id: string }; Returns: string }
      fork_message_template: { Args: { _origin_id: string }; Returns: string }
      fork_public_ai_media: { Args: { _media_id: string }; Returns: string }
      get_coverage_summary: {
        Args: never
        Returns: {
          cidades: string
          distribuidora: string
          total_clientes: number
          uf: string
        }[]
      }
      get_platform_pnl: {
        Args: { _from?: string; _to?: string }
        Returns: {
          charged_to_consultants_cents: number
          gross_meta_spend_cents: number
          gross_topped_up_cents: number
          margin_cents: number
          net_profit_cents: number
          net_received_cents: number
          refunds_cents: number
          stripe_fees_cents: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_ab_metric: {
        Args: {
          p_consultant_id: string
          p_metric: string
          p_step_key: string
          p_template_key: string
          p_variant: string
        }
        Returns: undefined
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      lint_bot_flow_consistency: {
        Args: { _consultant_id?: string }
        Returns: {
          category: string
          consultant_id: string
          customer_id: string
          detail: string
          occurrences: number
          severity: string
          step: string
        }[]
      }
      log_admin_action: {
        Args: {
          _action: string
          _metadata?: Json
          _target_id?: string
          _target_type?: string
        }
        Returns: string
      }
      refund_consultant_wallet: {
        Args: {
          _amount_cents: number
          _consultant_id: string
          _description?: string
          _stripe_payment_intent_id?: string
          _stripe_session_id?: string
        }
        Returns: number
      }
      reset_lead_conversation: {
        Args: {
          _consultant_id: string
          _customer_id?: string
          _remote_jid?: string
        }
        Returns: Json
      }
      seed_default_camila_flow: {
        Args: { _consultant_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "super_admin"],
    },
  },
} as const
