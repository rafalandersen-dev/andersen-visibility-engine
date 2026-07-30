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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          bucket: string
          period: string
          updated_at: string
          used: number
          user_id: string
        }
        Insert: {
          bucket: string
          period: string
          updated_at?: string
          used?: number
          user_id: string
        }
        Update: {
          bucket?: string
          period?: string
          updated_at?: string
          used?: number
          user_id?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          ai_signal_source: string | null
          ai_signal_type: string | null
          city: string | null
          content_asset_id: string | null
          country: string | null
          created_at: string
          destination_type: string | null
          device_type: string | null
          event_type: string
          id: string
          metadata: Json
          milo_asset_id: string | null
          path: string | null
          project_id: string
          referrer: string | null
          referrer_domain: string | null
          session_id: string | null
          title: string | null
          url: string | null
          user_agent: string | null
          visitor_id: string | null
        }
        Insert: {
          ai_signal_source?: string | null
          ai_signal_type?: string | null
          city?: string | null
          content_asset_id?: string | null
          country?: string | null
          created_at?: string
          destination_type?: string | null
          device_type?: string | null
          event_type: string
          id?: string
          metadata?: Json
          milo_asset_id?: string | null
          path?: string | null
          project_id: string
          referrer?: string | null
          referrer_domain?: string | null
          session_id?: string | null
          title?: string | null
          url?: string | null
          user_agent?: string | null
          visitor_id?: string | null
        }
        Update: {
          ai_signal_source?: string | null
          ai_signal_type?: string | null
          city?: string | null
          content_asset_id?: string | null
          country?: string | null
          created_at?: string
          destination_type?: string | null
          device_type?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          milo_asset_id?: string | null
          path?: string | null
          project_id?: string
          referrer?: string | null
          referrer_domain?: string | null
          session_id?: string | null
          title?: string | null
          url?: string | null
          user_agent?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      cron_heartbeats: {
        Row: {
          job_name: string
          last_run_at: string
          last_summary: Json | null
        }
        Insert: {
          job_name: string
          last_run_at?: string
          last_summary?: Json | null
        }
        Update: {
          job_name?: string
          last_run_at?: string
          last_summary?: Json | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      google_connections: {
        Row: {
          access_token_expires_at: string | null
          created_at: string
          encrypted_refresh_token: string | null
          google_account_email: string | null
          id: string
          provider: string
          revoked_at: string | null
          scope: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          access_token_expires_at?: string | null
          created_at?: string
          encrypted_refresh_token?: string | null
          google_account_email?: string | null
          id?: string
          provider?: string
          revoked_at?: string | null
          scope?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          access_token_expires_at?: string | null
          created_at?: string
          encrypted_refresh_token?: string | null
          google_account_email?: string | null
          id?: string
          provider?: string
          revoked_at?: string | null
          scope?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      link_network_listings: {
        Row: {
          contact_email: string
          created_at: string
          id: string
          language: string
          locale: string
          project_id: string
          site_name: string
          site_url: string
          status: string
          topics: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_email?: string
          created_at?: string
          id?: string
          language?: string
          locale?: string
          project_id: string
          site_name: string
          site_url: string
          status?: string
          topics?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_email?: string
          created_at?: string
          id?: string
          language?: string
          locale?: string
          project_id?: string
          site_name?: string
          site_url?: string
          status?: string
          topics?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      link_network_matches: {
        Row: {
          a_project: string
          a_site: string
          a_user: string
          b_contact: string
          b_language: string
          b_name: string
          b_project: string
          b_site: string
          b_topics: string[]
          b_user: string
          created_at: string
          id: string
          last_check_found: boolean | null
          last_checked_at: string | null
          link_rel: string | null
          score: number
          shared_topics: string[]
          status: string
          target_url: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          a_project: string
          a_site: string
          a_user: string
          b_contact?: string
          b_language?: string
          b_name?: string
          b_project: string
          b_site: string
          b_topics?: string[]
          b_user: string
          created_at?: string
          id?: string
          last_check_found?: boolean | null
          last_checked_at?: string | null
          link_rel?: string | null
          score?: number
          shared_topics?: string[]
          status?: string
          target_url?: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          a_project?: string
          a_site?: string
          a_user?: string
          b_contact?: string
          b_language?: string
          b_name?: string
          b_project?: string
          b_site?: string
          b_topics?: string[]
          b_user?: string
          created_at?: string
          id?: string
          last_check_found?: boolean | null
          last_checked_at?: string | null
          link_rel?: string | null
          score?: number
          shared_topics?: string[]
          status?: string
          target_url?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      mcp_connections: {
        Row: {
          created_at: string
          id: string
          label: string | null
          last_used_at: string | null
          revoked_at: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_audit_log: {
        Row: {
          client_id: string | null
          created_at: string
          detail: Json
          event: string
          id: string
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          detail?: Json
          event: string
          id?: string
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          detail?: Json
          event?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      oauth_authorization_codes: {
        Row: {
          client_id: string
          code_challenge: string
          code_challenge_method: string
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          nonce: string | null
          redirect_uri: string
          resource: string | null
          scope: string
          user_id: string
        }
        Insert: {
          client_id: string
          code_challenge: string
          code_challenge_method?: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          nonce?: string | null
          redirect_uri: string
          resource?: string | null
          scope?: string
          user_id: string
        }
        Update: {
          client_id?: string
          code_challenge?: string
          code_challenge_method?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          nonce?: string | null
          redirect_uri?: string
          resource?: string | null
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_authorization_requests: {
        Row: {
          client_id: string
          code_challenge: string
          code_challenge_method: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          redirect_uri: string
          resource: string | null
          scope: string
          state: string | null
        }
        Insert: {
          client_id: string
          code_challenge: string
          code_challenge_method?: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          redirect_uri: string
          resource?: string | null
          scope?: string
          state?: string | null
        }
        Update: {
          client_id?: string
          code_challenge?: string
          code_challenge_method?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          redirect_uri?: string
          resource?: string | null
          scope?: string
          state?: string | null
        }
        Relationships: []
      }
      oauth_clients: {
        Row: {
          client_id: string
          client_name: string | null
          client_secret_hash: string | null
          created_at: string
          disabled_at: string | null
          grant_types: string[]
          id: string
          last_used_at: string | null
          metadata: Json
          redirect_uris: string[]
          response_types: string[]
          scope: string | null
          software_id: string | null
          token_endpoint_auth_method: string
        }
        Insert: {
          client_id: string
          client_name?: string | null
          client_secret_hash?: string | null
          created_at?: string
          disabled_at?: string | null
          grant_types?: string[]
          id?: string
          last_used_at?: string | null
          metadata?: Json
          redirect_uris?: string[]
          response_types?: string[]
          scope?: string | null
          software_id?: string | null
          token_endpoint_auth_method?: string
        }
        Update: {
          client_id?: string
          client_name?: string | null
          client_secret_hash?: string | null
          created_at?: string
          disabled_at?: string | null
          grant_types?: string[]
          id?: string
          last_used_at?: string | null
          metadata?: Json
          redirect_uris?: string[]
          response_types?: string[]
          scope?: string | null
          software_id?: string | null
          token_endpoint_auth_method?: string
        }
        Relationships: []
      }
      oauth_consents: {
        Row: {
          client_id: string
          granted_at: string
          id: string
          revoked_at: string | null
          scope: string
          user_id: string
        }
        Insert: {
          client_id: string
          granted_at?: string
          id?: string
          revoked_at?: string | null
          scope?: string
          user_id: string
        }
        Update: {
          client_id?: string
          granted_at?: string
          id?: string
          revoked_at?: string | null
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_rate_limits: {
        Row: {
          bucket: string
          count: number
          key: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          key: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      oauth_tokens: {
        Row: {
          access_expires_at: string
          access_token_hash: string
          client_id: string
          created_at: string
          id: string
          label: string | null
          last_used_at: string | null
          refresh_expires_at: string | null
          refresh_family_id: string | null
          refresh_token_hash: string | null
          resource: string | null
          revoked_at: string | null
          rotated_at: string | null
          scope: string
          user_id: string
        }
        Insert: {
          access_expires_at: string
          access_token_hash: string
          client_id: string
          created_at?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          refresh_expires_at?: string | null
          refresh_family_id?: string | null
          refresh_token_hash?: string | null
          resource?: string | null
          revoked_at?: string | null
          rotated_at?: string | null
          scope?: string
          user_id: string
        }
        Update: {
          access_expires_at?: string
          access_token_hash?: string
          client_id?: string
          created_at?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          refresh_expires_at?: string | null
          refresh_family_id?: string | null
          refresh_token_hash?: string | null
          resource?: string | null
          revoked_at?: string | null
          rotated_at?: string | null
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_publishes: {
        Row: {
          asset_id: string
          attempts: number
          claimed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          project_id: string
          publish_at: string
          published_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_id: string
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          project_id: string
          publish_at: string
          published_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_id?: string
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          project_id?: string
          publish_at?: string
          published_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_entities: {
        Row: {
          collection: string
          data: Json
          entity_id: string
          ord: number
          updated_at: string
          user_id: string
        }
        Insert: {
          collection: string
          data: Json
          entity_id: string
          ord?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          collection?: string
          data?: Json
          entity_id?: string
          ord?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workspace_meta: {
        Row: {
          active_project_id: string
          billing_profile: Json | null
          extras: Json
          migrated_at: string
          rev: number
          subscription: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_project_id?: string
          billing_profile?: Json | null
          extras?: Json
          migrated_at?: string
          rev?: number
          subscription?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_project_id?: string
          billing_profile?: Json | null
          extras?: Json
          migrated_at?: string
          rev?: number
          subscription?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          created_at: string
          data: Json
          id: string
          rev: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          rev?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          rev?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_workspace_entity_batch: {
        Args: {
          p_deletes?: Json
          p_expected_rev?: number
          p_meta?: Json
          p_upserts?: Json
          p_user_id: string
        }
        Returns: number
      }
      auto_scheduler_secret: { Args: never; Returns: string }
      backfill_workspace_entities: {
        Args: { p_entities: Json; p_meta: Json; p_user_id: string }
        Returns: boolean
      }
      bump_rate_limit: {
        Args: { p_bucket: string; p_key: string; p_window_start: string }
        Returns: number
      }
      claim_ai_usage: {
        Args: {
          p_bucket: string
          p_cap: number
          p_period: string
          p_units?: number
          p_user: string
        }
        Returns: {
          allowed: boolean
          cap: number
          used: number
        }[]
      }
      claim_scheduled_publishes: {
        Args: { batch_size?: number; max_attempts?: number }
        Returns: {
          asset_id: string
          attempts: number
          claimed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          project_id: string
          publish_at: string
          published_at: string | null
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "scheduled_publishes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_rate_limits: { Args: { p_before: string }; Returns: undefined }
      consume_refresh_token: {
        Args: { p_now: string; p_refresh_hash: string }
        Returns: boolean
      }
      cron_heartbeat_age_seconds: { Args: { job: string }; Returns: number }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      gsc_cron_secret: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      publish_cron_secret: { Args: never; Returns: string }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      read_workspace_bundle: { Args: { p_user_id: string }; Returns: Json }
      reap_stale_scheduled_publishes: {
        Args: { stale_after?: string }
        Returns: {
          asset_id: string
          last_error: string
          user_id: string
        }[]
      }
      record_cron_heartbeat: {
        Args: { job: string; summary?: Json }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "owner" | "member"
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
      app_role: ["owner", "member"],
    },
  },
} as const
