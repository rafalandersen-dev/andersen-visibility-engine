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
      ai_answer_evidence: {
        Row: {
          created_at: string
          document: Json
          document_hash: string
          id: string
          project_id: string
          prompt_id: string
          prompt_revision: number
          supersedes_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          document: Json
          document_hash: string
          id?: string
          project_id: string
          prompt_id: string
          prompt_revision: number
          supersedes_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          document?: Json
          document_hash?: string
          id?: string
          project_id?: string
          prompt_id?: string
          prompt_revision?: number
          supersedes_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_answer_evidence_user_id_project_id_prompt_id_prompt_rev_fkey"
            columns: ["user_id", "project_id", "prompt_id", "prompt_revision"]
            isOneToOne: false
            referencedRelation: "ai_visibility_prompts"
            referencedColumns: ["user_id", "project_id", "id", "revision"]
          },
          {
            foreignKeyName: "ai_answer_evidence_user_id_project_id_supersedes_id_fkey"
            columns: ["user_id", "project_id", "supersedes_id"]
            isOneToOne: true
            referencedRelation: "ai_answer_evidence"
            referencedColumns: ["user_id", "project_id", "id"]
          },
        ]
      }
      ai_citation_answer_erasures: {
        Row: {
          answer_id: string
          erased_at: string
          project_collection: string
          project_id: string
          user_id: string
        }
        Insert: {
          answer_id: string
          erased_at?: string
          project_collection?: string
          project_id: string
          user_id: string
        }
        Update: {
          answer_id?: string
          erased_at?: string
          project_collection?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_answer_erasures_user_id_project_collection_pro_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      ai_citation_business_facts: {
        Row: {
          confirmed_at: string
          confirmed_by: string
          created_at: string
          fact_id: string
          id: string
          kind: string
          predecessor_deleted: boolean
          project_collection: string
          project_id: string
          record: Json
          record_sha256: string
          supersedes_id: string | null
          user_id: string
          valid_from: string
          valid_until: string | null
          value: string
          version: number
        }
        Insert: {
          confirmed_at?: string
          confirmed_by: string
          created_at?: string
          fact_id: string
          id?: string
          kind: string
          predecessor_deleted?: boolean
          project_collection?: string
          project_id: string
          record: Json
          record_sha256: string
          supersedes_id?: string | null
          user_id: string
          valid_from: string
          valid_until?: string | null
          value: string
          version: number
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string
          created_at?: string
          fact_id?: string
          id?: string
          kind?: string
          predecessor_deleted?: boolean
          project_collection?: string
          project_id?: string
          record?: Json
          record_sha256?: string
          supersedes_id?: string | null
          user_id?: string
          valid_from?: string
          valid_until?: string | null
          value?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_business_facts_user_id_project_collection_proj_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
          {
            foreignKeyName: "ai_citation_business_facts_user_id_project_id_supersedes_i_fkey"
            columns: ["user_id", "project_id", "supersedes_id"]
            isOneToOne: true
            referencedRelation: "ai_citation_business_facts"
            referencedColumns: ["user_id", "project_id", "id"]
          },
        ]
      }
      ai_citation_change_approval_decisions: {
        Row: {
          approved: boolean
          approved_by: string
          approver_kind: string
          artifact_id: string
          artifact_sha256: string
          decided_at: string
          digest: string
          id: string
          project_id: string
          request_id: string
          revision: number
          user_id: string
        }
        Insert: {
          approved: boolean
          approved_by: string
          approver_kind: string
          artifact_id: string
          artifact_sha256: string
          decided_at: string
          digest: string
          id?: string
          project_id: string
          request_id: string
          revision: number
          user_id: string
        }
        Update: {
          approved?: boolean
          approved_by?: string
          approver_kind?: string
          artifact_id?: string
          artifact_sha256?: string
          decided_at?: string
          digest?: string
          id?: string
          project_id?: string
          request_id?: string
          revision?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_change_approval_d_user_id_project_id_artifact__fkey"
            columns: ["user_id", "project_id", "artifact_id"]
            isOneToOne: false
            referencedRelation: "ai_citation_change_approvals"
            referencedColumns: ["user_id", "project_id", "artifact_id"]
          },
        ]
      }
      ai_citation_change_approvals: {
        Row: {
          approved: boolean
          approved_by: string
          approver_kind: string
          artifact_deleted_at: string | null
          artifact_id: string
          artifact_sha256: string
          delegate_membership_revision: number | null
          delegate_policy_revision: number | null
          kind: string
          project_collection: string
          project_id: string
          revision: number
          updated_at: string
          user_id: string
        }
        Insert: {
          approved: boolean
          approved_by: string
          approver_kind: string
          artifact_deleted_at?: string | null
          artifact_id: string
          artifact_sha256: string
          delegate_membership_revision?: number | null
          delegate_policy_revision?: number | null
          kind: string
          project_collection?: string
          project_id: string
          revision?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          approved?: boolean
          approved_by?: string
          approver_kind?: string
          artifact_deleted_at?: string | null
          artifact_id?: string
          artifact_sha256?: string
          delegate_membership_revision?: number | null
          delegate_policy_revision?: number | null
          kind?: string
          project_collection?: string
          project_id?: string
          revision?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_change_approvals_user_id_project_collection_pr_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      ai_citation_change_artifacts: {
        Row: {
          artifact_sha256: string
          created_at: string
          created_by: string
          fields: Json
          id: string
          kind: string
          project_collection: string
          project_id: string
          reference: string
          user_id: string
        }
        Insert: {
          artifact_sha256: string
          created_at?: string
          created_by: string
          fields: Json
          id?: string
          kind: string
          project_collection?: string
          project_id: string
          reference: string
          user_id: string
        }
        Update: {
          artifact_sha256?: string
          created_at?: string
          created_by?: string
          fields?: Json
          id?: string
          kind?: string
          project_collection?: string
          project_id?: string
          reference?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_change_artifacts_user_id_project_collection_pr_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      ai_citation_change_receipts: {
        Row: {
          approval_revision: number
          artifact_deleted_at: string | null
          artifact_id: string
          artifact_sha256: string
          digest: string
          id: string
          kind: string
          performed_at: string
          performed_by: string
          performer_kind: string
          project_collection: string
          project_id: string
          recorded_at: string
          reference: string
          user_id: string
        }
        Insert: {
          approval_revision: number
          artifact_deleted_at?: string | null
          artifact_id: string
          artifact_sha256: string
          digest: string
          id?: string
          kind: string
          performed_at: string
          performed_by: string
          performer_kind: string
          project_collection?: string
          project_id: string
          recorded_at?: string
          reference: string
          user_id: string
        }
        Update: {
          approval_revision?: number
          artifact_deleted_at?: string | null
          artifact_id?: string
          artifact_sha256?: string
          digest?: string
          id?: string
          kind?: string
          performed_at?: string
          performed_by?: string
          performer_kind?: string
          project_collection?: string
          project_id?: string
          recorded_at?: string
          reference?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_change_receipts_user_id_project_collection_pro_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      ai_citation_fact_erasures: {
        Row: {
          erased_at: string
          fact_id: string
          fact_row_id: string
          project_collection: string
          project_id: string
          user_id: string
          version: number
        }
        Insert: {
          erased_at?: string
          fact_id: string
          fact_row_id: string
          project_collection?: string
          project_id: string
          user_id: string
          version: number
        }
        Update: {
          erased_at?: string
          fact_id?: string
          fact_row_id?: string
          project_collection?: string
          project_id?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_fact_erasures_user_id_project_collection_proje_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      ai_citation_finding_dissent_tombstones: {
        Row: {
          created_at: string
          finding_id: string
          project_collection: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          finding_id: string
          project_collection?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          finding_id?: string
          project_collection?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_finding_dissent_t_user_id_project_collection_p_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      ai_citation_finding_reviews: {
        Row: {
          created_at: string
          decision: string
          finding_id: string
          finding_row_id: string
          finding_version: number
          id: string
          inspection_complete: boolean
          membership_revision: number
          note: string | null
          policy_mode: string
          policy_revision: number
          project_id: string
          record_sha256: string
          reviewer_id: string
          reviewer_role: string
          user_id: string
          withdrawn: boolean
          withdrawn_at: string | null
        }
        Insert: {
          created_at?: string
          decision: string
          finding_id: string
          finding_row_id: string
          finding_version: number
          id?: string
          inspection_complete?: boolean
          membership_revision: number
          note?: string | null
          policy_mode: string
          policy_revision: number
          project_id: string
          record_sha256: string
          reviewer_id: string
          reviewer_role: string
          user_id: string
          withdrawn?: boolean
          withdrawn_at?: string | null
        }
        Update: {
          created_at?: string
          decision?: string
          finding_id?: string
          finding_row_id?: string
          finding_version?: number
          id?: string
          inspection_complete?: boolean
          membership_revision?: number
          note?: string | null
          policy_mode?: string
          policy_revision?: number
          project_id?: string
          record_sha256?: string
          reviewer_id?: string
          reviewer_role?: string
          user_id?: string
          withdrawn?: boolean
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_finding_reviews_user_id_project_id_finding_row_fkey"
            columns: ["user_id", "project_id", "finding_row_id"]
            isOneToOne: false
            referencedRelation: "ai_citation_findings"
            referencedColumns: ["user_id", "project_id", "id"]
          },
        ]
      }
      ai_citation_findings: {
        Row: {
          actor_id: string
          client_market: string
          client_name: string
          created_at: string
          decision: string
          evidence_erased_at: string | null
          family: string
          finding_id: string
          id: string
          panel_id: string
          panel_version: number
          predecessor_deleted: boolean
          project_collection: string
          project_id: string
          record: Json
          record_sha256: string
          reviewer_id: string
          scope_enforced_at: string | null
          supersedes_id: string | null
          user_id: string
          version: number
        }
        Insert: {
          actor_id: string
          client_market: string
          client_name: string
          created_at?: string
          decision: string
          evidence_erased_at?: string | null
          family: string
          finding_id: string
          id?: string
          panel_id: string
          panel_version: number
          predecessor_deleted?: boolean
          project_collection?: string
          project_id: string
          record: Json
          record_sha256: string
          reviewer_id: string
          scope_enforced_at?: string | null
          supersedes_id?: string | null
          user_id: string
          version: number
        }
        Update: {
          actor_id?: string
          client_market?: string
          client_name?: string
          created_at?: string
          decision?: string
          evidence_erased_at?: string | null
          family?: string
          finding_id?: string
          id?: string
          panel_id?: string
          panel_version?: number
          predecessor_deleted?: boolean
          project_collection?: string
          project_id?: string
          record?: Json
          record_sha256?: string
          reviewer_id?: string
          scope_enforced_at?: string | null
          supersedes_id?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_findings_user_id_project_collection_project_id_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
          {
            foreignKeyName: "ai_citation_findings_user_id_project_id_supersedes_id_fkey"
            columns: ["user_id", "project_id", "supersedes_id"]
            isOneToOne: true
            referencedRelation: "ai_citation_findings"
            referencedColumns: ["user_id", "project_id", "id"]
          },
        ]
      }
      ai_citation_improvement_change_bindings: {
        Row: {
          artifact_deleted_at: string | null
          artifact_id: string
          artifact_sha256: string
          improvement_row_id: string
          kind: string
          owner_inspection: Json | null
          project_id: string
          receipt_id: string
          reference: string
          user_id: string
        }
        Insert: {
          artifact_deleted_at?: string | null
          artifact_id: string
          artifact_sha256: string
          improvement_row_id: string
          kind: string
          owner_inspection?: Json | null
          project_id: string
          receipt_id: string
          reference: string
          user_id: string
        }
        Update: {
          artifact_deleted_at?: string | null
          artifact_id?: string
          artifact_sha256?: string
          improvement_row_id?: string
          kind?: string
          owner_inspection?: Json | null
          project_id?: string
          receipt_id?: string
          reference?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_improvement_chang_user_id_project_id_improveme_fkey"
            columns: ["user_id", "project_id", "improvement_row_id"]
            isOneToOne: true
            referencedRelation: "ai_citation_improvements"
            referencedColumns: ["user_id", "project_id", "id"]
          },
        ]
      }
      ai_citation_improvement_inspections: {
        Row: {
          assignment_revision: number
          check_result: string
          created_at: string
          digest: string
          expected_head: string | null
          expected_version: number
          id: string
          improvement_row_id: string
          improvement_sha256: string
          inspector_id: string
          inspector_role: string
          membership_revision: number
          observed_at: string | null
          observed_reference: string | null
          policy_mode: string
          policy_revision: number
          project_id: string
          supersedes_id: string | null
          user_id: string
          version: number
        }
        Insert: {
          assignment_revision: number
          check_result: string
          created_at?: string
          digest: string
          expected_head?: string | null
          expected_version: number
          id?: string
          improvement_row_id: string
          improvement_sha256: string
          inspector_id: string
          inspector_role: string
          membership_revision: number
          observed_at?: string | null
          observed_reference?: string | null
          policy_mode: string
          policy_revision: number
          project_id: string
          supersedes_id?: string | null
          user_id: string
          version: number
        }
        Update: {
          assignment_revision?: number
          check_result?: string
          created_at?: string
          digest?: string
          expected_head?: string | null
          expected_version?: number
          id?: string
          improvement_row_id?: string
          improvement_sha256?: string
          inspector_id?: string
          inspector_role?: string
          membership_revision?: number
          observed_at?: string | null
          observed_reference?: string | null
          policy_mode?: string
          policy_revision?: number
          project_id?: string
          supersedes_id?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_improvement_inspe_user_id_project_id_improveme_fkey"
            columns: ["user_id", "project_id", "improvement_row_id"]
            isOneToOne: false
            referencedRelation: "ai_citation_improvements"
            referencedColumns: ["user_id", "project_id", "id"]
          },
        ]
      }
      ai_citation_improvements: {
        Row: {
          actor_id: string
          bound_finding_row_ids: string[]
          client_market: string
          client_name: string
          created_at: string
          id: string
          improvement_id: string
          panel_id: string
          panel_version: number
          predecessor_deleted: boolean
          project_collection: string
          project_id: string
          publication_binding: Json | null
          record: Json
          record_sha256: string
          scope_enforced_at: string | null
          supersedes_id: string | null
          user_id: string
          version: number
        }
        Insert: {
          actor_id: string
          bound_finding_row_ids?: string[]
          client_market: string
          client_name: string
          created_at?: string
          id?: string
          improvement_id: string
          panel_id: string
          panel_version: number
          predecessor_deleted?: boolean
          project_collection?: string
          project_id: string
          publication_binding?: Json | null
          record: Json
          record_sha256: string
          scope_enforced_at?: string | null
          supersedes_id?: string | null
          user_id: string
          version: number
        }
        Update: {
          actor_id?: string
          bound_finding_row_ids?: string[]
          client_market?: string
          client_name?: string
          created_at?: string
          id?: string
          improvement_id?: string
          panel_id?: string
          panel_version?: number
          predecessor_deleted?: boolean
          project_collection?: string
          project_id?: string
          publication_binding?: Json | null
          record?: Json
          record_sha256?: string
          scope_enforced_at?: string | null
          supersedes_id?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_improvements_user_id_project_collection_projec_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
          {
            foreignKeyName: "ai_citation_improvements_user_id_project_id_supersedes_id_fkey"
            columns: ["user_id", "project_id", "supersedes_id"]
            isOneToOne: true
            referencedRelation: "ai_citation_improvements"
            referencedColumns: ["user_id", "project_id", "id"]
          },
        ]
      }
      ai_citation_inspection_assignments: {
        Row: {
          active: boolean
          granted_at: string
          improvement_row_id: string
          inspector_id: string
          project_id: string
          revision: number
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          granted_at?: string
          improvement_row_id: string
          inspector_id: string
          project_id: string
          revision?: number
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          granted_at?: string
          improvement_row_id?: string
          inspector_id?: string
          project_id?: string
          revision?: number
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_inspection_assign_user_id_project_id_improveme_fkey"
            columns: ["user_id", "project_id", "improvement_row_id"]
            isOneToOne: false
            referencedRelation: "ai_citation_improvements"
            referencedColumns: ["user_id", "project_id", "id"]
          },
        ]
      }
      ai_citation_native_erasures: {
        Row: {
          erased_at: string
          native_id: string
          project_collection: string
          project_id: string
          user_id: string
        }
        Insert: {
          erased_at?: string
          native_id: string
          project_collection?: string
          project_id: string
          user_id: string
        }
        Update: {
          erased_at?: string
          native_id?: string
          project_collection?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_native_erasures_user_id_project_collection_pro_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      ai_citation_review_assignments: {
        Row: {
          active: boolean
          finding_row_id: string
          granted_at: string
          project_id: string
          reviewer_id: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          finding_row_id: string
          granted_at?: string
          project_id: string
          reviewer_id: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          finding_row_id?: string
          granted_at?: string
          project_id?: string
          reviewer_id?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_review_assignment_user_id_project_id_finding_r_fkey"
            columns: ["user_id", "project_id", "finding_row_id"]
            isOneToOne: false
            referencedRelation: "ai_citation_findings"
            referencedColumns: ["user_id", "project_id", "id"]
          },
        ]
      }
      ai_citation_source_erasures: {
        Row: {
          erased_at: string
          project_collection: string
          project_id: string
          source_id: string
          user_id: string
        }
        Insert: {
          erased_at?: string
          project_collection?: string
          project_id: string
          source_id: string
          user_id: string
        }
        Update: {
          erased_at?: string
          project_collection?: string
          project_id?: string
          source_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_source_erasures_user_id_project_collection_pro_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      ai_expense_budgets: {
        Row: {
          cap_microusd: number
          paused: boolean
          period: string
          provenance: string
          requires_permit: boolean
          reserved_microusd: number
          scope: string
          spent_microusd: number
        }
        Insert: {
          cap_microusd: number
          paused?: boolean
          period: string
          provenance?: string
          requires_permit?: boolean
          reserved_microusd?: number
          scope: string
          spent_microusd?: number
        }
        Update: {
          cap_microusd?: number
          paused?: boolean
          period?: string
          provenance?: string
          requires_permit?: boolean
          reserved_microusd?: number
          scope?: string
          spent_microusd?: number
        }
        Relationships: []
      }
      ai_expense_permits: {
        Row: {
          ceiling_microusd: number
          created_at: string
          expires_at: string
          job_id: string
          model: string
          operation: string
          period: string
          provider: string
          request_id: string
          revoked: boolean
          user_id: string
        }
        Insert: {
          ceiling_microusd: number
          created_at?: string
          expires_at: string
          job_id: string
          model: string
          operation: string
          period: string
          provider: string
          request_id: string
          revoked?: boolean
          user_id: string
        }
        Update: {
          ceiling_microusd?: number
          created_at?: string
          expires_at?: string
          job_id?: string
          model?: string
          operation?: string
          period?: string
          provider?: string
          request_id?: string
          revoked?: boolean
          user_id?: string
        }
        Relationships: []
      }
      ai_expense_requests: {
        Row: {
          actual_microusd: number | null
          cost_source: string | null
          created_at: string
          input_tokens: number | null
          job_id: string
          model: string
          operation: string
          outcome: string | null
          output_tokens: number | null
          period: string
          provider: string
          provider_request_id: string | null
          reconciled_at: string | null
          request_id: string
          reserved_microusd: number
          state: string
          user_id: string
        }
        Insert: {
          actual_microusd?: number | null
          cost_source?: string | null
          created_at?: string
          input_tokens?: number | null
          job_id: string
          model: string
          operation: string
          outcome?: string | null
          output_tokens?: number | null
          period: string
          provider: string
          provider_request_id?: string | null
          reconciled_at?: string | null
          request_id: string
          reserved_microusd: number
          state?: string
          user_id: string
        }
        Update: {
          actual_microusd?: number | null
          cost_source?: string | null
          created_at?: string
          input_tokens?: number | null
          job_id?: string
          model?: string
          operation?: string
          outcome?: string | null
          output_tokens?: number | null
          period?: string
          provider?: string
          provider_request_id?: string | null
          reconciled_at?: string | null
          request_id?: string
          reserved_microusd?: number
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_generation_results: {
        Row: {
          created_at: string
          discarded_at: string | null
          discarded_output_identity: Json | null
          payload: Json | null
          receipt_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          discarded_at?: string | null
          discarded_output_identity?: Json | null
          payload?: Json | null
          receipt_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          discarded_at?: string | null
          discarded_output_identity?: Json | null
          payload?: Json | null
          receipt_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_generation_results_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: true
            referencedRelation: "ai_generation_usage_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_generation_usage_receipts: {
        Row: {
          bucket: string
          claim_cap: number
          created_at: string
          id: string
          native_attempt_id: string | null
          operation: string
          period: string
          settled_at: string | null
          state: string
          units: number
          user_id: string
        }
        Insert: {
          bucket: string
          claim_cap: number
          created_at?: string
          id: string
          native_attempt_id?: string | null
          operation: string
          period: string
          settled_at?: string | null
          state: string
          units: number
          user_id: string
        }
        Update: {
          bucket?: string
          claim_cap?: number
          created_at?: string
          id?: string
          native_attempt_id?: string | null
          operation?: string
          period?: string
          settled_at?: string | null
          state?: string
          units?: number
          user_id?: string
        }
        Relationships: []
      }
      ai_native_report_artifacts: {
        Row: {
          actor_id: string
          artifact_sha256: string
          byte_length: number
          bytes: string
          created_at: string
          id: string
          metadata: Json
          predecessor_deleted: boolean
          project_collection: string
          project_id: string
          scope_key: string
          status: string
          supersedes_id: string | null
          user_id: string
        }
        Insert: {
          actor_id: string
          artifact_sha256: string
          byte_length: number
          bytes: string
          created_at?: string
          id?: string
          metadata: Json
          predecessor_deleted?: boolean
          project_collection?: string
          project_id: string
          scope_key: string
          status?: string
          supersedes_id?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string
          artifact_sha256?: string
          byte_length?: number
          bytes?: string
          created_at?: string
          id?: string
          metadata?: Json
          predecessor_deleted?: boolean
          project_collection?: string
          project_id?: string
          scope_key?: string
          status?: string
          supersedes_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_native_report_artifacts_user_id_project_collection_proj_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
          {
            foreignKeyName: "ai_native_report_artifacts_user_id_project_id_supersedes_i_fkey"
            columns: ["user_id", "project_id", "supersedes_id"]
            isOneToOne: true
            referencedRelation: "ai_native_report_artifacts"
            referencedColumns: ["user_id", "project_id", "id"]
          },
        ]
      }
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
      ai_visibility_prompts: {
        Row: {
          created_at: string
          data: Json
          id: string
          project_collection: string
          project_id: string
          revision: number
          user_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id: string
          project_collection?: string
          project_id: string
          revision: number
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          project_collection?: string
          project_id?: string
          revision?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_visibility_prompts_user_id_project_collection_project_i_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
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
      auto_scheduler_leases: {
        Row: {
          acquired_at: string
          finished_at: string | null
          lease_until: string
          planned_period: string
          project_collection: string
          project_id: string
          status: string
          token: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          finished_at?: string | null
          lease_until?: string
          planned_period: string
          project_collection?: string
          project_id: string
          status: string
          token?: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          finished_at?: string | null
          lease_until?: string
          planned_period?: string
          project_collection?: string
          project_id?: string
          status?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_scheduler_leases_user_id_project_collection_project_i_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      backlink_detail_pages: {
        Row: {
          next_cursor: string | null
          page_number: number
          parent_request_id: string | null
          prior_returned_count: number
          project_id: string
          request_cursor: string | null
          request_cursor_hash: string | null
          request_id: string
          root_request_id: string
          user_id: string
        }
        Insert: {
          next_cursor?: string | null
          page_number: number
          parent_request_id?: string | null
          prior_returned_count: number
          project_id: string
          request_cursor?: string | null
          request_cursor_hash?: string | null
          request_id: string
          root_request_id: string
          user_id: string
        }
        Update: {
          next_cursor?: string | null
          page_number?: number
          parent_request_id?: string | null
          prior_returned_count?: number
          project_id?: string
          request_cursor?: string | null
          request_cursor_hash?: string | null
          request_id?: string
          root_request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backlink_detail_pages_user_id_request_id_fkey"
            columns: ["user_id", "request_id"]
            isOneToOne: true
            referencedRelation: "backlink_details_requests"
            referencedColumns: ["user_id", "request_id"]
          },
        ]
      }
      backlink_details_requests: {
        Row: {
          accounting_state: string
          ceiling_microusd: number
          created_at: string
          dispatched_at: string | null
          lease_token: string
          lease_until: string
          observation: Json | null
          project_collection: string
          project_id: string
          request_id: string
          scope: Json
          status: string
          updated_at: string
          user_id: string
          website_value: string
        }
        Insert: {
          accounting_state?: string
          ceiling_microusd: number
          created_at?: string
          dispatched_at?: string | null
          lease_token: string
          lease_until: string
          observation?: Json | null
          project_collection?: string
          project_id: string
          request_id: string
          scope: Json
          status: string
          updated_at?: string
          user_id: string
          website_value: string
        }
        Update: {
          accounting_state?: string
          ceiling_microusd?: number
          created_at?: string
          dispatched_at?: string | null
          lease_token?: string
          lease_until?: string
          observation?: Json | null
          project_collection?: string
          project_id?: string
          request_id?: string
          scope?: Json
          status?: string
          updated_at?: string
          user_id?: string
          website_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "backlink_details_requests_user_id_project_collection_proje_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      backlink_monitoring_limits: {
        Row: {
          dispatches: string[]
          leases: Json
          requests: string[]
          scope: string
        }
        Insert: {
          dispatches?: string[]
          leases?: Json
          requests?: string[]
          scope: string
        }
        Update: {
          dispatches?: string[]
          leases?: Json
          requests?: string[]
          scope?: string
        }
        Relationships: []
      }
      backlink_monitoring_requests: {
        Row: {
          accounting_state: string
          ceiling_microusd: number
          created_at: string
          dispatched_at: string | null
          lease_token: string
          lease_until: string
          observation: Json | null
          project_collection: string
          project_id: string
          request_id: string
          scope: Json
          status: string
          updated_at: string
          user_id: string
          website_value: string
        }
        Insert: {
          accounting_state?: string
          ceiling_microusd: number
          created_at?: string
          dispatched_at?: string | null
          lease_token: string
          lease_until: string
          observation?: Json | null
          project_collection?: string
          project_id: string
          request_id: string
          scope: Json
          status: string
          updated_at?: string
          user_id: string
          website_value: string
        }
        Update: {
          accounting_state?: string
          ceiling_microusd?: number
          created_at?: string
          dispatched_at?: string | null
          lease_token?: string
          lease_until?: string
          observation?: Json | null
          project_collection?: string
          project_id?: string
          request_id?: string
          scope?: Json
          status?: string
          updated_at?: string
          user_id?: string
          website_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "backlink_monitoring_requests_user_id_project_collection_pr_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      backlink_recurring_monitors: {
        Row: {
          created_at: string
          last_change_id: string
          last_checked_at: string | null
          monitor_id: string
          next_due_at: string
          project_collection: string
          project_id: string
          revision: number
          settings: Json
          updated_at: string
          user_id: string
          website_value: string
        }
        Insert: {
          created_at?: string
          last_change_id: string
          last_checked_at?: string | null
          monitor_id?: string
          next_due_at: string
          project_collection?: string
          project_id: string
          revision: number
          settings: Json
          updated_at?: string
          user_id: string
          website_value: string
        }
        Update: {
          created_at?: string
          last_change_id?: string
          last_checked_at?: string | null
          monitor_id?: string
          next_due_at?: string
          project_collection?: string
          project_id?: string
          revision?: number
          settings?: Json
          updated_at?: string
          user_id?: string
          website_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "backlink_recurring_monitors_user_id_project_collection_pro_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      backlink_recurring_observations: {
        Row: {
          billing_month: string
          ceiling_microusd: number
          created_at: string
          monitor_id: string
          next_due_at: string
          occurrence_at: string
          project_id: string
          request_id: string
          scope: Json
          settings_revision: number
          undispatched_at: string | null
          user_id: string
          website_value: string
        }
        Insert: {
          billing_month: string
          ceiling_microusd: number
          created_at?: string
          monitor_id: string
          next_due_at: string
          occurrence_at: string
          project_id: string
          request_id: string
          scope: Json
          settings_revision: number
          undispatched_at?: string | null
          user_id: string
          website_value: string
        }
        Update: {
          billing_month?: string
          ceiling_microusd?: number
          created_at?: string
          monitor_id?: string
          next_due_at?: string
          occurrence_at?: string
          project_id?: string
          request_id?: string
          scope?: Json
          settings_revision?: number
          undispatched_at?: string | null
          user_id?: string
          website_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "backlink_recurring_observatio_user_id_project_id_monitor_i_fkey"
            columns: ["user_id", "project_id", "monitor_id"]
            isOneToOne: false
            referencedRelation: "backlink_recurring_monitors"
            referencedColumns: ["user_id", "project_id", "monitor_id"]
          },
          {
            foreignKeyName: "backlink_recurring_observations_user_id_request_id_fkey"
            columns: ["user_id", "request_id"]
            isOneToOne: true
            referencedRelation: "backlink_monitoring_requests"
            referencedColumns: ["user_id", "request_id"]
          },
        ]
      }
      billing_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          payload: Json
          processed_at: string
          provider: string
        }
        Insert: {
          event_id: string
          event_type: string
          payload?: Json
          processed_at?: string
          provider?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          payload?: Json
          processed_at?: string
          provider?: string
        }
        Relationships: []
      }
      citation_brand_runs: {
        Row: {
          created_at: string
          document: Json
          panel_id: string
          panel_version: number
          project_collection: string
          project_id: string
          run_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document: Json
          panel_id: string
          panel_version: number
          project_collection?: string
          project_id: string
          run_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          document?: Json
          panel_id?: string
          panel_version?: number
          project_collection?: string
          project_id?: string
          run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "citation_brand_runs_user_id_project_collection_project_id_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
          {
            foreignKeyName: "citation_brand_runs_user_id_project_id_panel_id_panel_vers_fkey"
            columns: ["user_id", "project_id", "panel_id", "panel_version"]
            isOneToOne: false
            referencedRelation: "citation_panels"
            referencedColumns: ["user_id", "project_id", "panel_id", "version"]
          },
        ]
      }
      citation_capture_tombstones: {
        Row: {
          answer_id: string
          brand_run_id: string | null
          created_at: string
          panel_id: string
          panel_version: number
          project_collection: string
          project_id: string
          question_id: string
          round: number
          user_id: string
        }
        Insert: {
          answer_id: string
          brand_run_id?: string | null
          created_at?: string
          panel_id: string
          panel_version: number
          project_collection?: string
          project_id: string
          question_id: string
          round: number
          user_id: string
        }
        Update: {
          answer_id?: string
          brand_run_id?: string | null
          created_at?: string
          panel_id?: string
          panel_version?: number
          project_collection?: string
          project_id?: string
          question_id?: string
          round?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "citation_capture_tombstones_user_id_project_collection_pro_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      citation_panels: {
        Row: {
          created_at: string
          document: Json
          panel_id: string
          project_collection: string
          project_id: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          document: Json
          panel_id: string
          project_collection?: string
          project_id: string
          user_id: string
          version: number
        }
        Update: {
          created_at?: string
          document?: Json
          panel_id?: string
          project_collection?: string
          project_id?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "citation_panels_user_id_project_collection_project_id_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
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
      entitlements: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          plan_id: string
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          plan_id?: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          plan_id?: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
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
      google_index_account_limits: {
        Row: {
          hour_count: number
          hour_start: string
          leases: Json
          minute_count: number
          minute_start: string
          user_id: string
        }
        Insert: {
          hour_count: number
          hour_start: string
          leases?: Json
          minute_count: number
          minute_start: string
          user_id: string
        }
        Update: {
          hour_count?: number
          hour_start?: string
          leases?: Json
          minute_count?: number
          minute_start?: string
          user_id?: string
        }
        Relationships: []
      }
      google_index_dispatch_limits: {
        Row: {
          hour_count: number
          hour_start: string
          leases: Json
          minute_count: number
          minute_start: string
          source: string
        }
        Insert: {
          hour_count: number
          hour_start: string
          leases?: Json
          minute_count: number
          minute_start: string
          source: string
        }
        Update: {
          hour_count?: number
          hour_start?: string
          leases?: Json
          minute_count?: number
          minute_start?: string
          source?: string
        }
        Relationships: []
      }
      google_index_inspections: {
        Row: {
          created_at: string
          dispatched_at: string | null
          error_code: string | null
          lease_token: string
          lease_until: string
          observation: Json | null
          project_collection: string
          project_id: string
          property: string
          request_id: string
          status: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dispatched_at?: string | null
          error_code?: string | null
          lease_token: string
          lease_until: string
          observation?: Json | null
          project_collection?: string
          project_id: string
          property: string
          request_id: string
          status: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          dispatched_at?: string | null
          error_code?: string | null
          lease_token?: string
          lease_until?: string
          observation?: Json | null
          project_collection?: string
          project_id?: string
          property?: string
          request_id?: string
          status?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_index_inspections_user_id_project_collection_projec_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
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
      milo_conversation_diagnostics: {
        Row: {
          created_at: string
          error_class: string
          http_status: number | null
          id: string
          name_category: string
          operation_id: string | null
          outcome: string
          outcome_code: string
          provenance: string
          sql_state: string | null
          stage: string
          turn_id: string
        }
        Insert: {
          created_at?: string
          error_class: string
          http_status?: number | null
          id?: string
          name_category: string
          operation_id?: string | null
          outcome: string
          outcome_code: string
          provenance: string
          sql_state?: string | null
          stage: string
          turn_id: string
        }
        Update: {
          created_at?: string
          error_class?: string
          http_status?: number | null
          id?: string
          name_category?: string
          operation_id?: string | null
          outcome?: string
          outcome_code?: string
          provenance?: string
          sql_state?: string | null
          stage?: string
          turn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milo_conversation_diagnostics_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: true
            referencedRelation: "milo_conversation_turns"
            referencedColumns: ["turn_id"]
          },
        ]
      }
      milo_conversation_dispatch_attempts: {
        Row: {
          actor_id: string
          request_id: number
          requested_at: string
          turn_id: string
        }
        Insert: {
          actor_id: string
          request_id: number
          requested_at?: string
          turn_id: string
        }
        Update: {
          actor_id?: string
          request_id?: number
          requested_at?: string
          turn_id?: string
        }
        Relationships: []
      }
      milo_conversation_dispatch_control: {
        Row: {
          enabled: boolean
          singleton: boolean
        }
        Insert: {
          enabled?: boolean
          singleton?: boolean
        }
        Update: {
          enabled?: boolean
          singleton?: boolean
        }
        Relationships: []
      }
      milo_conversation_turns: {
        Row: {
          actor_id: string
          allow_draft_generation: boolean
          allow_provider_checks: boolean
          attempt_id: string | null
          body: string
          conversation_id: string
          created_at: string
          dispatch_last_at: string | null
          dispatch_until: string | null
          events: Json
          lease_until: string | null
          locale: string
          membership_revision: number
          ordinal: number
          state: string
          turn_id: string
          updated_at: string
        }
        Insert: {
          actor_id: string
          allow_draft_generation?: boolean
          allow_provider_checks?: boolean
          attempt_id?: string | null
          body: string
          conversation_id: string
          created_at?: string
          dispatch_last_at?: string | null
          dispatch_until?: string | null
          events?: Json
          lease_until?: string | null
          locale: string
          membership_revision: number
          ordinal: number
          state?: string
          turn_id: string
          updated_at?: string
        }
        Update: {
          actor_id?: string
          allow_draft_generation?: boolean
          allow_provider_checks?: boolean
          attempt_id?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          dispatch_last_at?: string | null
          dispatch_until?: string | null
          events?: Json
          lease_until?: string | null
          locale?: string
          membership_revision?: number
          ordinal?: number
          state?: string
          turn_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "milo_conversation_turns_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "milo_conversations"
            referencedColumns: ["conversation_id"]
          },
        ]
      }
      milo_conversations: {
        Row: {
          actor_id: string
          conversation_id: string
          created_at: string
          export_revision: number
          owner_id: string
          project_collection: string
          project_id: string
          title: string
          turn_count: number
          updated_at: string
        }
        Insert: {
          actor_id: string
          conversation_id: string
          created_at?: string
          export_revision?: number
          owner_id: string
          project_collection?: string
          project_id: string
          title: string
          turn_count?: number
          updated_at?: string
        }
        Update: {
          actor_id?: string
          conversation_id?: string
          created_at?: string
          export_revision?: number
          owner_id?: string
          project_collection?: string
          project_id?: string
          title?: string
          turn_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "milo_conversations_owner_id_project_collection_project_id_fkey"
            columns: ["owner_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      milo_draft_proposals: {
        Row: {
          actor_id: string
          after_hash: string | null
          applied_at: string | null
          asset_collection: string
          asset_id: string
          before_fields: Json
          conversation_id: string
          created_at: string
          draft_hash: string
          explanation: string
          membership_revision: number
          owner_id: string
          patch: Json
          project_id: string
          proposal_id: string
          turn_id: string
        }
        Insert: {
          actor_id: string
          after_hash?: string | null
          applied_at?: string | null
          asset_collection?: string
          asset_id: string
          before_fields: Json
          conversation_id: string
          created_at?: string
          draft_hash: string
          explanation: string
          membership_revision: number
          owner_id: string
          patch: Json
          project_id: string
          proposal_id: string
          turn_id: string
        }
        Update: {
          actor_id?: string
          after_hash?: string | null
          applied_at?: string | null
          asset_collection?: string
          asset_id?: string
          before_fields?: Json
          conversation_id?: string
          created_at?: string
          draft_hash?: string
          explanation?: string
          membership_revision?: number
          owner_id?: string
          patch?: Json
          project_id?: string
          proposal_id?: string
          turn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milo_draft_proposals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "milo_conversations"
            referencedColumns: ["conversation_id"]
          },
          {
            foreignKeyName: "milo_draft_proposals_owner_id_asset_collection_asset_id_fkey"
            columns: ["owner_id", "asset_collection", "asset_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
          {
            foreignKeyName: "milo_draft_proposals_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: true
            referencedRelation: "milo_conversation_turns"
            referencedColumns: ["turn_id"]
          },
        ]
      }
      milo_erased_conversations: {
        Row: {
          actor_id: string
          conversation_id: string
          created_at: string
          erased_at: string
          owner_id: string
          project_id: string
        }
        Insert: {
          actor_id: string
          conversation_id: string
          created_at: string
          erased_at?: string
          owner_id: string
          project_id: string
        }
        Update: {
          actor_id?: string
          conversation_id?: string
          created_at?: string
          erased_at?: string
          owner_id?: string
          project_id?: string
        }
        Relationships: []
      }
      milo_erased_turns: {
        Row: {
          conversation_id: string
          created_at: string
          turn_id: string
        }
        Insert: {
          conversation_id: string
          created_at: string
          turn_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          turn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milo_erased_turns_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "milo_erased_conversations"
            referencedColumns: ["conversation_id"]
          },
        ]
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
      operational_email_items: {
        Row: {
          notification_id: string
          outbox_id: string
        }
        Insert: {
          notification_id: string
          outbox_id: string
        }
        Update: {
          notification_id?: string
          outbox_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_email_items_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "operational_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_email_items_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "operational_email_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_email_outbox: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          finished_at: string | null
          id: string
          lease_token: string | null
          lease_until: string | null
          reason: string | null
          status: string
          user_id: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          lease_token?: string | null
          lease_until?: string | null
          reason?: string | null
          status?: string
          user_id: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          lease_token?: string | null
          lease_until?: string | null
          reason?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      operational_email_preferences: {
        Row: {
          enabled: boolean
          locale: string
          updated_at: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          locale?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          locale?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      operational_notification_scan_attempts: {
        Row: {
          attempted_at: string
          user_id: string
        }
        Insert: {
          attempted_at: string
          user_id: string
        }
        Update: {
          attempted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      operational_notification_scans: {
        Row: {
          scanned_at: string
          user_id: string
          workspace_rev: number
        }
        Insert: {
          scanned_at: string
          user_id: string
          workspace_rev: number
        }
        Update: {
          scanned_at?: string
          user_id?: string
          workspace_rev?: number
        }
        Relationships: []
      }
      operational_notifications: {
        Row: {
          active: boolean
          created_at: string
          detail: Json
          due_at: string | null
          event_key: string
          id: string
          kind: string
          project_collection: string
          project_id: string
          read_at: string | null
          target_id: string
          target_title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          detail?: Json
          due_at?: string | null
          event_key: string
          id?: string
          kind: string
          project_collection?: string
          project_id: string
          read_at?: string | null
          target_id: string
          target_title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          detail?: Json
          due_at?: string | null
          event_key?: string
          id?: string
          kind?: string
          project_collection?: string
          project_id?: string
          read_at?: string | null
          target_id?: string
          target_title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_notifications_user_id_project_collection_proje_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      output_knowledge_reviews: {
        Row: {
          active: boolean
          asset_collection: string
          asset_id: string
          context_hash: string
          project_collection: string
          project_id: string
          review_id: string
          reviewed_at: string
          user_id: string
          version_hash: string
          withdrawn_at: string | null
        }
        Insert: {
          active?: boolean
          asset_collection?: string
          asset_id: string
          context_hash: string
          project_collection?: string
          project_id: string
          review_id: string
          reviewed_at?: string
          user_id: string
          version_hash: string
          withdrawn_at?: string | null
        }
        Update: {
          active?: boolean
          asset_collection?: string
          asset_id?: string
          context_hash?: string
          project_collection?: string
          project_id?: string
          review_id?: string
          reviewed_at?: string
          user_id?: string
          version_hash?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "output_knowledge_reviews_user_id_asset_collection_asset_id_fkey"
            columns: ["user_id", "asset_collection", "asset_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
          {
            foreignKeyName: "output_knowledge_reviews_user_id_project_collection_projec_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      outreach_delivery_receipts: {
        Row: {
          draft_id: string
          project_id: string
          provider_message_id: string | null
          recipient: string
          reserved_at: string
          state: string
          step: string
          updated_at: string
          user_id: string
          version_hash: string
        }
        Insert: {
          draft_id: string
          project_id: string
          provider_message_id?: string | null
          recipient: string
          reserved_at?: string
          state: string
          step: string
          updated_at?: string
          user_id: string
          version_hash: string
        }
        Update: {
          draft_id?: string
          project_id?: string
          provider_message_id?: string | null
          recipient?: string
          reserved_at?: string
          state?: string
          step?: string
          updated_at?: string
          user_id?: string
          version_hash?: string
        }
        Relationships: []
      }
      owner_ai_benchmark_runs: {
        Row: {
          article_request: string
          asset_id: string
          claim_token: string | null
          claimed_at: string | null
          created_at: string
          expires_at: string
          id: string
          image_id: string
          image_request: string
          opportunity_id: string
          project_id: string
          results: Json
          scan_request: string
          snapshot: Json
          stage: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          article_request: string
          asset_id: string
          claim_token?: string | null
          claimed_at?: string | null
          created_at?: string
          expires_at: string
          id: string
          image_id: string
          image_request: string
          opportunity_id: string
          project_id: string
          results?: Json
          scan_request: string
          snapshot: Json
          stage?: string
          state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          article_request?: string
          asset_id?: string
          claim_token?: string | null
          claimed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          image_id?: string
          image_request?: string
          opportunity_id?: string
          project_id?: string
          results?: Json
          scan_request?: string
          snapshot?: Json
          stage?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_ai_benchmark_runs_article_request_fkey"
            columns: ["article_request"]
            isOneToOne: true
            referencedRelation: "ai_expense_permits"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "owner_ai_benchmark_runs_image_request_fkey"
            columns: ["image_request"]
            isOneToOne: true
            referencedRelation: "ai_expense_permits"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "owner_ai_benchmark_runs_scan_request_fkey"
            columns: ["scan_request"]
            isOneToOne: true
            referencedRelation: "ai_expense_permits"
            referencedColumns: ["request_id"]
          },
        ]
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
      project_knowledge_documents: {
        Row: {
          bytes: string
          project_id: string
          source_id: string
          user_id: string
        }
        Insert: {
          bytes: string
          project_id: string
          source_id: string
          user_id: string
        }
        Update: {
          bytes?: string
          project_id?: string
          source_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_knowledge_documents_user_id_project_id_source_id_fkey"
            columns: ["user_id", "project_id", "source_id"]
            isOneToOne: true
            referencedRelation: "project_knowledge_sources"
            referencedColumns: ["user_id", "project_id", "id"]
          },
        ]
      }
      project_knowledge_history: {
        Row: {
          id: string
          kind: string
          payload: Json
          project_id: string
          revision: number
          user_id: string
        }
        Insert: {
          id: string
          kind: string
          payload: Json
          project_id: string
          revision: number
          user_id: string
        }
        Update: {
          id?: string
          kind?: string
          payload?: Json
          project_id?: string
          revision?: number
          user_id?: string
        }
        Relationships: []
      }
      project_knowledge_records: {
        Row: {
          id: string
          payload: Json
          project_id: string
          revision: number
          source_id: string
          user_id: string
        }
        Insert: {
          id: string
          payload: Json
          project_id: string
          revision: number
          source_id: string
          user_id: string
        }
        Update: {
          id?: string
          payload?: Json
          project_id?: string
          revision?: number
          source_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_knowledge_records_user_id_project_id_source_id_fkey"
            columns: ["user_id", "project_id", "source_id"]
            isOneToOne: false
            referencedRelation: "project_knowledge_sources"
            referencedColumns: ["user_id", "project_id", "id"]
          },
        ]
      }
      project_knowledge_sources: {
        Row: {
          id: string
          payload: Json
          project_id: string
          revision: number
          user_id: string
        }
        Insert: {
          id: string
          payload: Json
          project_id: string
          revision: number
          user_id: string
        }
        Update: {
          id?: string
          payload?: Json
          project_id?: string
          revision?: number
          user_id?: string
        }
        Relationships: []
      }
      project_knowledge_tombstones: {
        Row: {
          id: string
          kind: string
          project_id: string
          user_id: string
        }
        Insert: {
          id: string
          kind: string
          project_id: string
          user_id: string
        }
        Update: {
          id?: string
          kind?: string
          project_id?: string
          user_id?: string
        }
        Relationships: []
      }
      project_log_evidence: {
        Row: {
          created_at: string
          document: Json
          document_hash: string
          id: string
          project_collection: string
          project_id: string
          supersedes_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          document: Json
          document_hash: string
          id?: string
          project_collection?: string
          project_id: string
          supersedes_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          document?: Json
          document_hash?: string
          id?: string
          project_collection?: string
          project_id?: string
          supersedes_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_log_evidence_user_id_project_collection_project_id_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
          {
            foreignKeyName: "project_log_evidence_user_id_project_id_supersedes_id_fkey"
            columns: ["user_id", "project_id", "supersedes_id"]
            isOneToOne: true
            referencedRelation: "project_log_evidence"
            referencedColumns: ["user_id", "project_id", "id"]
          },
        ]
      }
      project_output_source_dependencies: {
        Row: {
          asset_id: string
          dependencies: Json
          kind: string
          knowledge_forgotten: boolean
          knowledge_references: Json
          output_id: string
          project_id: string
          source_forgotten: boolean
          user_id: string
        }
        Insert: {
          asset_id: string
          dependencies: Json
          kind: string
          knowledge_forgotten?: boolean
          knowledge_references?: Json
          output_id: string
          project_id: string
          source_forgotten?: boolean
          user_id: string
        }
        Update: {
          asset_id?: string
          dependencies?: Json
          kind?: string
          knowledge_forgotten?: boolean
          knowledge_references?: Json
          output_id?: string
          project_id?: string
          source_forgotten?: boolean
          user_id?: string
        }
        Relationships: []
      }
      project_publish_secrets: {
        Row: {
          project_id: string
          secret: string
          secret_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          project_id: string
          secret: string
          secret_name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          project_id?: string
          secret?: string
          secret_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_scheduler_control: {
        Row: {
          engine: string
          last_dispatch_at: string | null
          preparation: Json
          project_collection: string
          project_id: string
          revision: number
          updated_at: string
          user_id: string
        }
        Insert: {
          engine: string
          last_dispatch_at?: string | null
          preparation: Json
          project_collection?: string
          project_id: string
          revision: number
          updated_at?: string
          user_id: string
        }
        Update: {
          engine?: string
          last_dispatch_at?: string | null
          preparation?: Json
          project_collection?: string
          project_id?: string
          revision?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_scheduler_control_user_id_project_collection_proje_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      project_source_refresh: {
        Row: {
          accepted: Json
          history: Json
          last_attempt: string
          last_status: string
          lease_token: string | null
          lease_until: string | null
          project_id: string
          review_history: Json
          revision: number
          snapshot: Json | null
          source_id: string
          source_revision: number
          user_id: string
        }
        Insert: {
          accepted?: Json
          history?: Json
          last_attempt: string
          last_status: string
          lease_token?: string | null
          lease_until?: string | null
          project_id: string
          review_history?: Json
          revision?: number
          snapshot?: Json | null
          source_id: string
          source_revision: number
          user_id: string
        }
        Update: {
          accepted?: Json
          history?: Json
          last_attempt?: string
          last_status?: string
          lease_token?: string | null
          lease_until?: string | null
          project_id?: string
          review_history?: Json
          revision?: number
          snapshot?: Json | null
          source_id?: string
          source_revision?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_source_refresh_user_id_project_id_source_id_fkey"
            columns: ["user_id", "project_id", "source_id"]
            isOneToOne: true
            referencedRelation: "project_knowledge_sources"
            referencedColumns: ["user_id", "project_id", "id"]
          },
        ]
      }
      project_team_approval_history: {
        Row: {
          actor_id: string
          approved: boolean
          asset_collection: string
          asset_id: string
          created_at: string
          membership_revision: number
          owner_id: string
          policy_revision: number
          project_collection: string
          project_id: string
          review_id: string
          version_hash: string
        }
        Insert: {
          actor_id: string
          approved: boolean
          asset_collection?: string
          asset_id: string
          created_at?: string
          membership_revision: number
          owner_id: string
          policy_revision: number
          project_collection?: string
          project_id: string
          review_id: string
          version_hash: string
        }
        Update: {
          actor_id?: string
          approved?: boolean
          asset_collection?: string
          asset_id?: string
          created_at?: string
          membership_revision?: number
          owner_id?: string
          policy_revision?: number
          project_collection?: string
          project_id?: string
          review_id?: string
          version_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_team_approval_history_owner_id_asset_collection_as_fkey"
            columns: ["owner_id", "asset_collection", "asset_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
          {
            foreignKeyName: "project_team_approval_history_owner_id_project_collection__fkey"
            columns: ["owner_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      project_team_approval_policy: {
        Row: {
          mode: string
          owner_id: string
          project_collection: string
          project_id: string
          revision: number
        }
        Insert: {
          mode: string
          owner_id: string
          project_collection?: string
          project_id: string
          revision: number
        }
        Update: {
          mode?: string
          owner_id?: string
          project_collection?: string
          project_id?: string
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_team_approval_policy_owner_id_project_collection_p_fkey"
            columns: ["owner_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      project_team_audit: {
        Row: {
          action: string
          actor_id: string
          event_id: number
          occurred_at: string
          owner_id: string
          project_id: string
          revision: number | null
          subject_id: string
        }
        Insert: {
          action: string
          actor_id: string
          event_id?: never
          occurred_at?: string
          owner_id: string
          project_id: string
          revision?: number | null
          subject_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          event_id?: never
          occurred_at?: string
          owner_id?: string
          project_id?: string
          revision?: number | null
          subject_id?: string
        }
        Relationships: []
      }
      project_team_comments: {
        Row: {
          actor_id: string
          asset_collection: string
          asset_id: string
          author_name: string
          author_role: string
          body: string
          comment_id: string
          created_at: string
          owner_id: string
          project_collection: string
          project_id: string
          workspace_revision: number
        }
        Insert: {
          actor_id: string
          asset_collection?: string
          asset_id: string
          author_name: string
          author_role: string
          body: string
          comment_id: string
          created_at?: string
          owner_id: string
          project_collection?: string
          project_id: string
          workspace_revision: number
        }
        Update: {
          actor_id?: string
          asset_collection?: string
          asset_id?: string
          author_name?: string
          author_role?: string
          body?: string
          comment_id?: string
          created_at?: string
          owner_id?: string
          project_collection?: string
          project_id?: string
          workspace_revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_team_comments_owner_id_asset_collection_asset_id_fkey"
            columns: ["owner_id", "asset_collection", "asset_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
          {
            foreignKeyName: "project_team_comments_owner_id_project_collection_project__fkey"
            columns: ["owner_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      project_team_edits: {
        Row: {
          actor_id: string
          after_hash: string
          asset_collection: string
          asset_id: string
          before_hash: string
          content_hash: string
          created_at: string
          edit_id: string
          membership_revision: number
          owner_id: string
          patch_hash: string
          project_collection: string
          project_id: string
        }
        Insert: {
          actor_id: string
          after_hash: string
          asset_collection?: string
          asset_id: string
          before_hash: string
          content_hash: string
          created_at?: string
          edit_id: string
          membership_revision: number
          owner_id: string
          patch_hash: string
          project_collection?: string
          project_id: string
        }
        Update: {
          actor_id?: string
          after_hash?: string
          asset_collection?: string
          asset_id?: string
          before_hash?: string
          content_hash?: string
          created_at?: string
          edit_id?: string
          membership_revision?: number
          owner_id?: string
          patch_hash?: string
          project_collection?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_team_edits_owner_id_asset_collection_asset_id_fkey"
            columns: ["owner_id", "asset_collection", "asset_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
          {
            foreignKeyName: "project_team_edits_owner_id_project_collection_project_id_fkey"
            columns: ["owner_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      project_team_invitation_deliveries: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          finished_at: string | null
          id: string
          invite_id: string
          last_requested_at: string
          lease_token: string | null
          lease_until: string | null
          owner_id: string
          project_id: string
          requested_at: string[]
          status: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          invite_id: string
          last_requested_at?: string
          lease_token?: string | null
          lease_until?: string | null
          owner_id: string
          project_id: string
          requested_at?: string[]
          status?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          invite_id?: string
          last_requested_at?: string
          lease_token?: string | null
          lease_until?: string | null
          owner_id?: string
          project_id?: string
          requested_at?: string[]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_team_invitation_deliveries_owner_id_invite_id_fkey"
            columns: ["owner_id", "invite_id"]
            isOneToOne: true
            referencedRelation: "project_team_invitations"
            referencedColumns: ["owner_id", "invite_id"]
          },
        ]
      }
      project_team_invitations: {
        Row: {
          accepted_by: string | null
          created_at: string
          expires_at: string
          invite_id: string
          owner_id: string
          project_collection: string
          project_id: string
          recipient_email: string
          role: string
          state: string
        }
        Insert: {
          accepted_by?: string | null
          created_at?: string
          expires_at: string
          invite_id: string
          owner_id: string
          project_collection?: string
          project_id: string
          recipient_email: string
          role: string
          state?: string
        }
        Update: {
          accepted_by?: string | null
          created_at?: string
          expires_at?: string
          invite_id?: string
          owner_id?: string
          project_collection?: string
          project_id?: string
          recipient_email?: string
          role?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_team_invitations_owner_id_project_collection_proje_fkey"
            columns: ["owner_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      project_team_media_limits: {
        Row: {
          actor_id: string
          hour_count: number
          hour_start: string
          leases: Json
          minute_count: number
          minute_start: string
        }
        Insert: {
          actor_id: string
          hour_count: number
          hour_start: string
          leases?: Json
          minute_count: number
          minute_start: string
        }
        Update: {
          actor_id?: string
          hour_count?: number
          hour_start?: string
          leases?: Json
          minute_count?: number
          minute_start?: string
        }
        Relationships: []
      }
      project_team_members: {
        Row: {
          active: boolean
          actor_id: string
          expires_at: string | null
          owner_id: string
          project_collection: string
          project_id: string
          revision: number
          role: string
        }
        Insert: {
          active?: boolean
          actor_id: string
          expires_at?: string | null
          owner_id: string
          project_collection?: string
          project_id: string
          revision?: number
          role: string
        }
        Update: {
          active?: boolean
          actor_id?: string
          expires_at?: string | null
          owner_id?: string
          project_collection?: string
          project_id?: string
          revision?: number
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_team_members_owner_id_project_collection_project_i_fkey"
            columns: ["owner_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      project_team_notification_items: {
        Row: {
          notification_id: string
          outbox_id: string
          recipient_id: string
        }
        Insert: {
          notification_id: string
          outbox_id: string
          recipient_id: string
        }
        Update: {
          notification_id?: string
          outbox_id?: string
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_team_notification_items_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "operational_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_team_notification_items_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "project_team_notification_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      project_team_notification_outbox: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          finished_at: string | null
          id: string
          lease_token: string | null
          lease_until: string | null
          membership_revision: number
          owner_id: string
          project_id: string
          recipient_id: string
          settings_revision: number
          status: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          lease_token?: string | null
          lease_until?: string | null
          membership_revision: number
          owner_id: string
          project_id: string
          recipient_id: string
          settings_revision: number
          status?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          lease_token?: string | null
          lease_until?: string | null
          membership_revision?: number
          owner_id?: string
          project_id?: string
          recipient_id?: string
          settings_revision?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_team_notification_out_owner_id_project_id_recipien_fkey"
            columns: ["owner_id", "project_id", "recipient_id"]
            isOneToOne: false
            referencedRelation: "project_team_members"
            referencedColumns: ["owner_id", "project_id", "actor_id"]
          },
        ]
      }
      project_team_notification_recipient_audit: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          enabled: boolean
          event_id: number
          owner_id: string
          project_id: string
          recipient_id: string
          revision: number
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          enabled: boolean
          event_id?: never
          owner_id: string
          project_id: string
          recipient_id: string
          revision: number
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          enabled?: boolean
          event_id?: never
          owner_id?: string
          project_id?: string
          recipient_id?: string
          revision?: number
        }
        Relationships: []
      }
      project_team_notification_recipients: {
        Row: {
          assigned: boolean
          last_scan_at: string | null
          membership_revision: number
          opted_in: boolean
          owner_id: string
          project_id: string
          recipient_id: string
          revision: number
          updated_at: string
        }
        Insert: {
          assigned?: boolean
          last_scan_at?: string | null
          membership_revision: number
          opted_in?: boolean
          owner_id: string
          project_id: string
          recipient_id: string
          revision?: number
          updated_at?: string
        }
        Update: {
          assigned?: boolean
          last_scan_at?: string | null
          membership_revision?: number
          opted_in?: boolean
          owner_id?: string
          project_id?: string
          recipient_id?: string
          revision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_team_notification_rec_owner_id_project_id_recipien_fkey"
            columns: ["owner_id", "project_id", "recipient_id"]
            isOneToOne: true
            referencedRelation: "project_team_members"
            referencedColumns: ["owner_id", "project_id", "actor_id"]
          },
        ]
      }
      project_team_preview_limits: {
        Row: {
          account_id: string
          hour_count: number
          hour_start: string
          leases: Json
          minute_count: number
          minute_start: string
          scope: string
        }
        Insert: {
          account_id: string
          hour_count: number
          hour_start: string
          leases?: Json
          minute_count: number
          minute_start: string
          scope: string
        }
        Update: {
          account_id?: string
          hour_count?: number
          hour_start?: string
          leases?: Json
          minute_count?: number
          minute_start?: string
          scope?: string
        }
        Relationships: []
      }
      publication_approvals: {
        Row: {
          algorithm: string
          approved: boolean
          asset_collection: string
          asset_id: string
          delegate_actor_id: string | null
          delegate_membership_revision: number | null
          delegate_policy_revision: number | null
          project_collection: string
          project_id: string
          reviewed_images: Json | null
          updated_at: string
          user_id: string
          version_hash: string
        }
        Insert: {
          algorithm: string
          approved: boolean
          asset_collection?: string
          asset_id: string
          delegate_actor_id?: string | null
          delegate_membership_revision?: number | null
          delegate_policy_revision?: number | null
          project_collection?: string
          project_id: string
          reviewed_images?: Json | null
          updated_at?: string
          user_id: string
          version_hash: string
        }
        Update: {
          algorithm?: string
          approved?: boolean
          asset_collection?: string
          asset_id?: string
          delegate_actor_id?: string | null
          delegate_membership_revision?: number | null
          delegate_policy_revision?: number | null
          project_collection?: string
          project_id?: string
          reviewed_images?: Json | null
          updated_at?: string
          user_id?: string
          version_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "publication_approvals_user_id_asset_collection_asset_id_fkey"
            columns: ["user_id", "asset_collection", "asset_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
          {
            foreignKeyName: "publication_approvals_user_id_project_collection_project_i_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      publication_evidence: {
        Row: {
          action_snapshot: Json | null
          asset_id: string
          finished_at: string | null
          id: string
          outcome: string
          outcome_data: Json | null
          project_collection: string
          project_id: string
          snapshot: Json
          stage_references: Json
          started_at: string
          user_id: string
          version_hash: string
        }
        Insert: {
          action_snapshot?: Json | null
          asset_id: string
          finished_at?: string | null
          id: string
          outcome?: string
          outcome_data?: Json | null
          project_collection?: string
          project_id: string
          snapshot: Json
          stage_references?: Json
          started_at?: string
          user_id: string
          version_hash: string
        }
        Update: {
          action_snapshot?: Json | null
          asset_id?: string
          finished_at?: string | null
          id?: string
          outcome?: string
          outcome_data?: Json | null
          project_collection?: string
          project_id?: string
          snapshot?: Json
          stage_references?: Json
          started_at?: string
          user_id?: string
          version_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "publication_evidence_user_id_project_collection_project_id_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      publication_evidence_actors: {
        Row: {
          actor_id: string
          initiator: string
          project_id: string
          publication_id: string
          recorded_at: string
          user_id: string
        }
        Insert: {
          actor_id: string
          initiator: string
          project_id: string
          publication_id: string
          recorded_at?: string
          user_id: string
        }
        Update: {
          actor_id?: string
          initiator?: string
          project_id?: string
          publication_id?: string
          recorded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publication_evidence_actors_user_id_project_id_publication_fkey"
            columns: ["user_id", "project_id", "publication_id"]
            isOneToOne: true
            referencedRelation: "publication_evidence"
            referencedColumns: ["user_id", "project_id", "id"]
          },
        ]
      }
      publication_observations: {
        Row: {
          import_hash: string
          import_id: string
          observation: Json
          project_id: string
          publication_id: string
          recorded_at: string
          user_id: string
        }
        Insert: {
          import_hash: string
          import_id: string
          observation: Json
          project_id: string
          publication_id: string
          recorded_at?: string
          user_id: string
        }
        Update: {
          import_hash?: string
          import_id?: string
          observation?: Json
          project_id?: string
          publication_id?: string
          recorded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publication_observations_user_id_project_id_publication_id_fkey"
            columns: ["user_id", "project_id", "publication_id"]
            isOneToOne: false
            referencedRelation: "publication_evidence"
            referencedColumns: ["user_id", "project_id", "id"]
          },
        ]
      }
      scheduled_publishes: {
        Row: {
          asset_id: string
          attempts: number
          claimed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          preflight_attempts: number
          preflight_started_at: string | null
          project_id: string
          publish_at: string
          published_at: string | null
          retry_after: string | null
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
          preflight_attempts?: number
          preflight_started_at?: string | null
          project_id: string
          publish_at: string
          published_at?: string | null
          retry_after?: string | null
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
          preflight_attempts?: number
          preflight_started_at?: string | null
          project_id?: string
          publish_at?: string
          published_at?: string | null
          retry_after?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stripe_sandbox_events: {
        Row: {
          event_created: number
          event_id: string
          event_type: string
          fingerprint: string
          object_id: string
          received_at: string
        }
        Insert: {
          event_created: number
          event_id: string
          event_type: string
          fingerprint: string
          object_id: string
          received_at?: string
        }
        Update: {
          event_created?: number
          event_id?: string
          event_type?: string
          fingerprint?: string
          object_id?: string
          received_at?: string
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
      technical_crawl_dispatch_limits: {
        Row: {
          hour_count: number
          hour_start: string
          last_used: string
          leases: Json
          minute_count: number
          minute_start: string
          scope: string
          scope_key: string
        }
        Insert: {
          hour_count: number
          hour_start: string
          last_used: string
          leases?: Json
          minute_count: number
          minute_start: string
          scope: string
          scope_key: string
        }
        Update: {
          hour_count?: number
          hour_start?: string
          last_used?: string
          leases?: Json
          minute_count?: number
          minute_start?: string
          scope?: string
          scope_key?: string
        }
        Relationships: []
      }
      technical_crawl_dispatch_tickets: {
        Row: {
          address: unknown
          expires_at: string
          lease: string
          origin: string
          project_id: string
          run_id: string
          run_lease: string
          user_id: string
        }
        Insert: {
          address?: unknown
          expires_at: string
          lease: string
          origin: string
          project_id: string
          run_id: string
          run_lease: string
          user_id: string
        }
        Update: {
          address?: unknown
          expires_at?: string
          lease?: string
          origin?: string
          project_id?: string
          run_id?: string
          run_lease?: string
          user_id?: string
        }
        Relationships: []
      }
      technical_crawl_findings: {
        Row: {
          code: string
          created_at: string
          evidence_id: string
          opportunity_id: string
          page_index: number
          project_id: string
          run_id: string
          run_revision: number
          snapshot: Json
          snapshot_hash: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          evidence_id: string
          opportunity_id: string
          page_index: number
          project_id: string
          run_id: string
          run_revision: number
          snapshot: Json
          snapshot_hash: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          evidence_id?: string
          opportunity_id?: string
          page_index?: number
          project_id?: string
          run_id?: string
          run_revision?: number
          snapshot?: Json
          snapshot_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_crawl_findings_user_id_run_id_fkey"
            columns: ["user_id", "run_id"]
            isOneToOne: false
            referencedRelation: "technical_crawls"
            referencedColumns: ["user_id", "run_id"]
          },
        ]
      }
      technical_crawl_ownership: {
        Row: {
          attempt_token: string | null
          attempt_until: string | null
          expires_at: string
          issued_at: string
          origin: string
          project_collection: string
          project_id: string
          revoked_at: string | null
          token: string
          user_id: string
          verified_until: string | null
          website_value: string
        }
        Insert: {
          attempt_token?: string | null
          attempt_until?: string | null
          expires_at: string
          issued_at: string
          origin: string
          project_collection?: string
          project_id: string
          revoked_at?: string | null
          token: string
          user_id: string
          verified_until?: string | null
          website_value: string
        }
        Update: {
          attempt_token?: string | null
          attempt_until?: string | null
          expires_at?: string
          issued_at?: string
          origin?: string
          project_collection?: string
          project_id?: string
          revoked_at?: string | null
          token?: string
          user_id?: string
          verified_until?: string | null
          website_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_crawl_ownership_user_id_project_collection_proje_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      technical_crawls: {
        Row: {
          admission_hold: string | null
          created_at: string
          lease_token: string | null
          lease_until: string | null
          origin: string
          project_collection: string
          project_id: string
          resume_status: string | null
          retry_after: string | null
          revision: number
          run_id: string
          state: Json
          status: string
          updated_at: string
          user_id: string
          website_value: string
        }
        Insert: {
          admission_hold?: string | null
          created_at?: string
          lease_token?: string | null
          lease_until?: string | null
          origin: string
          project_collection?: string
          project_id: string
          resume_status?: string | null
          retry_after?: string | null
          revision?: number
          run_id: string
          state?: Json
          status?: string
          updated_at?: string
          user_id: string
          website_value: string
        }
        Update: {
          admission_hold?: string | null
          created_at?: string
          lease_token?: string | null
          lease_until?: string | null
          origin?: string
          project_collection?: string
          project_id?: string
          resume_status?: string | null
          retry_after?: string | null
          revision?: number
          run_id?: string
          state?: Json
          status?: string
          updated_at?: string
          user_id?: string
          website_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_crawls_user_id_project_collection_project_id_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      technical_ownership_dns_limits: {
        Row: {
          active_leases: Json
          hour_count: number
          hour_start: string
          minute_count: number
          minute_start: string
          singleton: boolean
        }
        Insert: {
          active_leases?: Json
          hour_count: number
          hour_start: string
          minute_count: number
          minute_start: string
          singleton?: boolean
        }
        Update: {
          active_leases?: Json
          hour_count?: number
          hour_start?: string
          minute_count?: number
          minute_start?: string
          singleton?: boolean
        }
        Relationships: []
      }
      technical_ownership_limits: {
        Row: {
          active_token: string | null
          active_until: string | null
          hour_start: string
          issue_count: number
          user_id: string
          verify_count: number
        }
        Insert: {
          active_token?: string | null
          active_until?: string | null
          hour_start: string
          issue_count: number
          user_id: string
          verify_count: number
        }
        Update: {
          active_token?: string | null
          active_until?: string | null
          hour_start?: string
          issue_count?: number
          user_id?: string
          verify_count?: number
        }
        Relationships: []
      }
      technical_performance_account_limits: {
        Row: {
          hour_count: number
          hour_start: string
          leases: Json
          minute_count: number
          minute_start: string
          source: string
          user_id: string
        }
        Insert: {
          hour_count: number
          hour_start: string
          leases?: Json
          minute_count: number
          minute_start: string
          source: string
          user_id: string
        }
        Update: {
          hour_count?: number
          hour_start?: string
          leases?: Json
          minute_count?: number
          minute_start?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      technical_performance_provider_limits: {
        Row: {
          hour_count: number
          hour_start: string
          leases: Json
          minute_count: number
          minute_start: string
          source: string
        }
        Insert: {
          hour_count: number
          hour_start: string
          leases?: Json
          minute_count: number
          minute_start: string
          source: string
        }
        Update: {
          hour_count?: number
          hour_start?: string
          leases?: Json
          minute_count?: number
          minute_start?: string
          source?: string
        }
        Relationships: []
      }
      technical_performance_requests: {
        Row: {
          created_at: string
          device: string
          dispatched_at: string | null
          error_code: string | null
          lease_token: string
          lease_until: string
          observation: Json | null
          origin: string
          project_collection: string
          project_id: string
          request_id: string
          scope: string
          source: string
          status: string
          updated_at: string
          url: string
          user_id: string
          website_value: string
        }
        Insert: {
          created_at?: string
          device: string
          dispatched_at?: string | null
          error_code?: string | null
          lease_token: string
          lease_until: string
          observation?: Json | null
          origin: string
          project_collection?: string
          project_id: string
          request_id: string
          scope: string
          source: string
          status: string
          updated_at?: string
          url: string
          user_id: string
          website_value: string
        }
        Update: {
          created_at?: string
          device?: string
          dispatched_at?: string | null
          error_code?: string | null
          lease_token?: string
          lease_until?: string
          observation?: Json | null
          origin?: string
          project_collection?: string
          project_id?: string
          request_id?: string
          scope?: string
          source?: string
          status?: string
          updated_at?: string
          url?: string
          user_id?: string
          website_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_performance_request_user_id_project_collection_p_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
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
      weekly_preparation_stages: {
        Row: {
          control_revision: number
          delivered_at: string | null
          delivery_hash: string | null
          finished_at: string | null
          input_hash: string
          lease_token: string
          output_id: string
          period: string
          project_collection: string
          project_id: string
          publish_at: string
          request_id: string
          result: Json | null
          stage: string
          started_at: string
          state: string
          user_id: string
        }
        Insert: {
          control_revision: number
          delivered_at?: string | null
          delivery_hash?: string | null
          finished_at?: string | null
          input_hash: string
          lease_token: string
          output_id?: string
          period: string
          project_collection?: string
          project_id: string
          publish_at: string
          request_id?: string
          result?: Json | null
          stage: string
          started_at?: string
          state: string
          user_id: string
        }
        Update: {
          control_revision?: number
          delivered_at?: string | null
          delivery_hash?: string | null
          finished_at?: string | null
          input_hash?: string
          lease_token?: string
          output_id?: string
          period?: string
          project_collection?: string
          project_id?: string
          publish_at?: string
          request_id?: string
          result?: Json | null
          stage?: string
          started_at?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_preparation_stages_user_id_project_collection_proje_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      weekly_preparation_summaries: {
        Row: {
          period: string
          project_collection: string
          project_id: string
          summary: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          period: string
          project_collection?: string
          project_id: string
          summary: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          period?: string
          project_collection?: string
          project_id?: string
          summary?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_preparation_summaries_user_id_project_collection_pr_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
      }
      workflow_evaluations: {
        Row: {
          created_at: string
          document: Json
          document_hash: string
          id: string
          project_collection: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document: Json
          document_hash: string
          id?: string
          project_collection?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          document?: Json
          document_hash?: string
          id?: string
          project_collection?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_evaluations_user_id_project_collection_project_id_fkey"
            columns: ["user_id", "project_collection", "project_id"]
            isOneToOne: false
            referencedRelation: "workspace_entities"
            referencedColumns: ["user_id", "collection", "entity_id"]
          },
        ]
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
      accept_project_team_invitation: {
        Args: {
          p_actor: string
          p_invite: string
          p_owner: string
          p_project: string
        }
        Returns: number
      }
      acquire_project_team_media: { Args: { p_actor: string }; Returns: string }
      acquire_project_team_preview: {
        Args: { p_actor: string; p_owner: string; p_project: string }
        Returns: string
      }
      acquire_technical_crawl_dispatch: {
        Args: {
          p_address: unknown
          p_origin: string
          p_prior_lease?: string
          p_project: string
          p_run: string
          p_run_lease: string
          p_user: string
        }
        Returns: Json
      }
      active_plan_id: { Args: { _user_id: string }; Returns: string }
      add_project_team_comment: {
        Args: {
          p_actor: string
          p_asset: string
          p_body: string
          p_comment: string
          p_expected: number
          p_owner: string
          p_project: string
        }
        Returns: boolean
      }
      advance_milo_conversation_turn: {
        Args: {
          p_actor: string
          p_attempt: string
          p_conversation: string
          p_events: Json
          p_expected: number
          p_owner: string
          p_project: string
          p_state: string
          p_turn: string
        }
        Returns: Json
      }
      apply_milo_draft_proposal: {
        Args: {
          p_actor: string
          p_conversation: string
          p_owner: string
          p_project: string
          p_proposal: string
          p_turn: string
        }
        Returns: Json
      }
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
      approve_citation_brand_run: {
        Args: {
          p_budget: number
          p_panel: string
          p_project: string
          p_rounds: number
          p_run: string
          p_user: string
          p_version: number
        }
        Returns: Json
      }
      arm_scheduler_publication: {
        Args: {
          p_asset: string
          p_expected: number
          p_hash: string
          p_project: string
          p_publish: string
          p_token: string
          p_user: string
        }
        Returns: boolean
      }
      assert_knowledge_project: {
        Args: { p_lock?: boolean; p_project: string; p_user: string }
        Returns: undefined
      }
      assert_milo_conversation_access: {
        Args: { p_actor: string; p_owner: string; p_project: string }
        Returns: number
      }
      assert_milo_conversation_execution: {
        Args: { p_actor: string; p_owner: string; p_project: string }
        Returns: number
      }
      assert_project_team_account: {
        Args: { p_user: string }
        Returns: undefined
      }
      assert_project_team_seat: {
        Args: {
          p_email: string
          p_owner: string
          p_project: string
          p_role: string
          p_viewer_seats: number
          p_working_seats: number
        }
        Returns: undefined
      }
      assert_technical_crawl_owner: {
        Args: { p_project: string; p_user: string }
        Returns: string
      }
      assert_technical_crawl_ownership: {
        Args: { p_origin: string; p_project: string; p_user: string }
        Returns: undefined
      }
      authorize_backlink_details_dispatch: {
        Args: {
          p_lease: string
          p_project: string
          p_request: string
          p_user: string
        }
        Returns: boolean
      }
      authorize_backlink_monitoring_dispatch: {
        Args: {
          p_lease: string
          p_project: string
          p_request: string
          p_user: string
        }
        Returns: boolean
      }
      authorize_backlink_page_dispatch: {
        Args: {
          p_lease: string
          p_project: string
          p_request: string
          p_user: string
        }
        Returns: boolean
      }
      authorize_backlink_recurring_dispatch: {
        Args: {
          p_lease: string
          p_project: string
          p_request: string
          p_user: string
        }
        Returns: boolean
      }
      authorize_google_index_dispatch: {
        Args: {
          p_lease: string
          p_project: string
          p_request: string
          p_user: string
        }
        Returns: boolean
      }
      authorize_technical_performance_dispatch: {
        Args: {
          p_lease: string
          p_project: string
          p_request: string
          p_user: string
        }
        Returns: boolean
      }
      auto_scheduler_secret: { Args: never; Returns: string }
      backfill_workspace_entities: {
        Args: { p_entities: Json; p_meta: Json; p_user_id: string }
        Returns: boolean
      }
      backlink_recurring_spending: {
        Args: {
          p_monitor: string
          p_month: string
          p_release_expired?: boolean
          p_user: string
        }
        Returns: Json
      }
      begin_milo_conversation_turn: {
        Args: {
          p_actor: string
          p_allow_checks?: boolean
          p_allow_generation?: boolean
          p_body: string
          p_conversation: string
          p_locale: string
          p_owner: string
          p_project: string
          p_turn: string
        }
        Returns: Json
      }
      begin_operational_email_delivery: {
        Args: { p_id: string; p_lease: string }
        Returns: Json
      }
      begin_project_source_refresh: {
        Args: {
          p_expected: number
          p_project: string
          p_source: string
          p_token: string
          p_user: string
        }
        Returns: Json
      }
      begin_project_team_invitation_delivery: {
        Args: {
          p_email_hash: string
          p_id: string
          p_lease: string
          p_role: string
        }
        Returns: boolean
      }
      begin_project_team_notification_delivery: {
        Args: { p_email_hash: string; p_id: string; p_lease: string }
        Returns: Json
      }
      begin_publication_evidence: {
        Args: {
          p_asset: string
          p_hash: string
          p_id: string
          p_project: string
          p_snapshot: Json
          p_user: string
        }
        Returns: boolean
      }
      begin_technical_ownership_verification: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      begin_weekly_preparation_stage: {
        Args: {
          p_hash: string
          p_lease: string
          p_project: string
          p_publish: string
          p_revision: number
          p_stage: string
          p_user: string
        }
        Returns: Json
      }
      bump_rate_limit: {
        Args: { p_bucket: string; p_key: string; p_window_start: string }
        Returns: number
      }
      cancel_milo_conversation_turn: {
        Args: {
          p_actor: string
          p_conversation: string
          p_owner: string
          p_project: string
          p_turn: string
        }
        Returns: Json
      }
      cancel_outreach_reservation: {
        Args: {
          p_draft: string
          p_hash: string
          p_project: string
          p_step: string
          p_user: string
        }
        Returns: boolean
      }
      cancel_technical_crawl: {
        Args: { p_project: string; p_run: string; p_user: string }
        Returns: boolean
      }
      cancel_weekly_preparation_slot: {
        Args: { p_project: string; p_request: string; p_user: string }
        Returns: boolean
      }
      capture_technical_crawl_finding: {
        Args: {
          p_code: string
          p_page: number
          p_project: string
          p_revision: number
          p_run: string
          p_title: string
          p_user: string
        }
        Returns: Json
      }
      change_project_team_member: {
        Args: {
          p_actor: string
          p_expected: number
          p_member: string
          p_owner: string
          p_project: string
          p_remove: boolean
          p_role: string
          p_viewer_seats?: number
          p_working_seats?: number
        }
        Returns: number
      }
      check_auto_scheduler_lease: {
        Args: { p_project: string; p_token: string; p_user: string }
        Returns: boolean
      }
      check_milo_conversation_execution: {
        Args: {
          p_actor: string
          p_attempt: string
          p_conversation: string
          p_owner: string
          p_project: string
          p_turn: string
        }
        Returns: boolean
      }
      citation_accuracy_resolve: {
        Args: { a: Json; p_project: string; p_record: Json; p_user: string }
        Returns: Json
      }
      citation_change_approval_current: {
        Args: { p_artifact: string; p_project: string; p_user: string }
        Returns: boolean
      }
      citation_change_binding_status: {
        Args: {
          p_bound: string[]
          p_project: string
          p_record: Json
          p_row: string
          p_user: string
        }
        Returns: string
      }
      citation_change_fields_project: {
        Args: { p_fields: Json; p_kind: string }
        Returns: Json
      }
      citation_change_fields_valid: {
        Args: { p_fields: Json; p_kind: string }
        Returns: boolean
      }
      citation_ctx_run: { Args: { p_text: string }; Returns: string }
      citation_fact_ref_matches: {
        Args: {
          a: Json
          p_fact_id: string
          p_fact_row: string
          p_version: number
        }
        Returns: boolean
      }
      citation_finding_accuracy: {
        Args: { p_project: string; p_record: Json; p_user: string }
        Returns: Json
      }
      citation_finding_accuracy_status: {
        Args: { p_project: string; p_record: Json; p_user: string }
        Returns: string
      }
      citation_finding_head_id: {
        Args: {
          p_client_market: string
          p_client_name: string
          p_finding: string
          p_panel: string
          p_panel_version: number
          p_project: string
          p_user: string
        }
        Returns: string
      }
      citation_finding_inspectable: {
        Args: { p_project: string; p_record: Json; p_user: string }
        Returns: boolean
      }
      citation_finding_review_digest_masked: {
        Args: { p_project: string; p_row: string; p_user: string }
        Returns: boolean
      }
      citation_finding_review_status: {
        Args: { p_project: string; p_row: string; p_user: string }
        Returns: string
      }
      citation_finding_sources_available: {
        Args: { p_project: string; p_record: Json; p_user: string }
        Returns: boolean
      }
      citation_forget_redact_answer: {
        Args: { p_answer: string; p_project: string; p_user: string }
        Returns: undefined
      }
      citation_forget_redact_fact: {
        Args: {
          p_fact: string
          p_fact_id: string
          p_project: string
          p_user: string
          p_version: number
        }
        Returns: undefined
      }
      citation_forget_redact_native: {
        Args: { p_native: string; p_project: string; p_user: string }
        Returns: undefined
      }
      citation_forget_redact_source: {
        Args: { p_project: string; p_source: string; p_user: string }
        Returns: undefined
      }
      citation_improvement_actors: {
        Args: { p_project: string; p_row: string; p_user: string }
        Returns: Record<string, unknown>
      }
      citation_improvement_baselines_resolve: {
        Args: { p_project: string; p_record: Json; p_user: string }
        Returns: boolean
      }
      citation_improvement_evidence: {
        Args: { p_project: string; p_record: Json; p_user: string }
        Returns: string
      }
      citation_improvement_finding_gate: {
        Args: { p_bound: string[]; p_project: string; p_user: string }
        Returns: Record<string, unknown>
      }
      citation_improvement_live_v2: {
        Args: { p_project: string; p_row: string; p_user: string }
        Returns: Json
      }
      citation_improvement_status: {
        Args: {
          p_binding: Json
          p_bound: string[]
          p_project: string
          p_record: Json
          p_user: string
        }
        Returns: string
      }
      citation_independent_status: {
        Args: { p_project: string; p_row: string; p_user: string }
        Returns: Record<string, unknown>
      }
      citation_inspection_assigned: {
        Args: {
          p_inspector: string
          p_owner: string
          p_project: string
          p_row: string
        }
        Returns: boolean
      }
      citation_inspection_receipt_effective: {
        Args: { p_owner: string; p_project: string; p_receipt: string }
        Returns: Record<string, unknown>
      }
      citation_inspector_effective: {
        Args: {
          p_inspector: string
          p_owner: string
          p_project: string
          p_row: string
        }
        Returns: boolean
      }
      citation_knowledge_selectable: {
        Args: { p_now: string; p_rec: Json; p_src: Json }
        Returns: boolean
      }
      citation_lock_account: { Args: { p_user: string }; Returns: undefined }
      citation_panel_scope_authenticated: {
        Args: {
          p_market: string
          p_name: string
          p_panel: string
          p_project: string
          p_user: string
          p_version: number
        }
        Returns: boolean
      }
      citation_redact_answer_fields: { Args: { p_record: Json }; Returns: Json }
      citation_review_assigned: {
        Args: {
          p_finding: string
          p_owner: string
          p_project: string
          p_reviewer: string
        }
        Returns: boolean
      }
      citation_review_authorized: {
        Args: { p_actor: string; p_owner: string; p_project: string }
        Returns: Record<string, unknown>
      }
      citation_ts_ms: { Args: { p_text: string }; Returns: string }
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
      claim_auto_scheduler_lease: {
        Args: { p_period: string; p_project: string; p_user: string }
        Returns: string
      }
      claim_due_backlink_monitors: { Args: never; Returns: Json }
      claim_generation_usage: {
        Args: {
          p_bucket: string
          p_cap: number
          p_id: string
          p_native_attempt?: string
          p_operation: string
          p_period: string
          p_user: string
        }
        Returns: {
          allowed: boolean
          cap: number
          claim_status: string
          receipt_id: string
          used: number
        }[]
      }
      claim_milo_conversation_turn: {
        Args: {
          p_actor: string
          p_conversation: string
          p_owner: string
          p_project: string
          p_turn: string
        }
        Returns: Json
      }
      claim_operational_email_digest: {
        Args: never
        Returns: {
          id: string
          lease_token: string
          user_id: string
        }[]
      }
      claim_owner_benchmark_stage: {
        Args: {
          p_image_ceiling: number
          p_image_model: string
          p_run: string
          p_stage: string
          p_text_ceiling: number
          p_text_model: string
          p_token: string
          p_user: string
        }
        Returns: boolean
      }
      claim_project_team_invitation_delivery: {
        Args: never
        Returns: {
          email: string
          id: string
          invite_id: string
          lease_token: string
          locale: string
          owner_id: string
          project_id: string
          role: string
        }[]
      }
      claim_project_team_notification_digest: {
        Args: never
        Returns: {
          id: string
          lease_token: string
          owner_id: string
          project_id: string
          recipient_id: string
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
          preflight_attempts: number
          preflight_started_at: string | null
          project_id: string
          publish_at: string
          published_at: string | null
          retry_after: string | null
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
      claim_technical_crawl: {
        Args: { p_project: string; p_run: string; p_user: string }
        Returns: Json
      }
      cleanup_rate_limits: { Args: { p_before: string }; Returns: undefined }
      consume_refresh_token: {
        Args: { p_now: string; p_refresh_hash: string }
        Returns: boolean
      }
      count_project_team_seats: {
        Args: { p_exclude_email?: string; p_owner: string }
        Returns: {
          viewer: number
          working: number
        }[]
      }
      create_project_team_invitation: {
        Args: {
          p_actor: string
          p_email: string
          p_invite: string
          p_owner: string
          p_project: string
          p_role: string
          p_viewer_seats?: number
          p_working_seats?: number
        }
        Returns: boolean
      }
      cron_heartbeat_age_seconds: { Args: { job: string }; Returns: number }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      discard_generation_result: {
        Args: { p_id: string; p_user: string }
        Returns: {
          receipt_id: string
          state: string
        }[]
      }
      dispatch_outreach_delivery: {
        Args: {
          p_draft: string
          p_expected: number
          p_hash: string
          p_step: string
          p_user: string
        }
        Returns: boolean
      }
      dispatch_pending_milo_turns: { Args: never; Returns: number }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_milo_conversation_turn: {
        Args: { p_turn: string }
        Returns: boolean
      }
      erase_milo_conversation: {
        Args: {
          p_actor: string
          p_conversation: string
          p_owner: string
          p_project: string
        }
        Returns: Json
      }
      export_milo_conversation_page: {
        Args: {
          p_actor: string
          p_after?: number
          p_conversation: string
          p_owner: string
          p_project: string
          p_version?: string
        }
        Returns: Json
      }
      finish_backlink_details: {
        Args: {
          p_lease: string
          p_observation: Json
          p_project: string
          p_request: string
          p_user: string
        }
        Returns: boolean
      }
      finish_backlink_monitoring: {
        Args: {
          p_lease: string
          p_observation: Json
          p_project: string
          p_request: string
          p_user: string
        }
        Returns: boolean
      }
      finish_backlink_page: {
        Args: {
          p_lease: string
          p_next_cursor: string
          p_observation: Json
          p_project: string
          p_request: string
          p_user: string
        }
        Returns: boolean
      }
      finish_backlink_recurring_observation: {
        Args: {
          p_lease: string
          p_observation: Json
          p_project: string
          p_request: string
          p_user: string
        }
        Returns: boolean
      }
      finish_google_index_inspection: {
        Args: {
          p_error: string
          p_lease: string
          p_observation: Json
          p_project: string
          p_request: string
          p_user: string
        }
        Returns: boolean
      }
      finish_operational_email_delivery: {
        Args: { p_id: string; p_lease: string; p_outcome: string }
        Returns: boolean
      }
      finish_outreach_delivery: {
        Args: {
          p_draft: string
          p_hash: string
          p_message: string
          p_state: string
          p_step: string
          p_user: string
        }
        Returns: boolean
      }
      finish_owner_benchmark_stage: {
        Args: {
          p_run: string
          p_stage: string
          p_success: boolean
          p_token: string
          p_user: string
        }
        Returns: boolean
      }
      finish_project_source_refresh: {
        Args: {
          p_project: string
          p_snapshot: Json
          p_source: string
          p_token: string
          p_user: string
        }
        Returns: Json
      }
      finish_project_team_invitation_delivery: {
        Args: { p_id: string; p_lease: string; p_outcome: string }
        Returns: boolean
      }
      finish_project_team_notification_delivery: {
        Args: { p_id: string; p_lease: string; p_outcome: string }
        Returns: boolean
      }
      finish_publication_evidence: {
        Args: {
          p_data: Json
          p_id: string
          p_outcome: string
          p_project: string
          p_user: string
        }
        Returns: boolean
      }
      finish_technical_ownership_verification: {
        Args: {
          p_attempt: string
          p_project: string
          p_user: string
          p_verified: boolean
        }
        Returns: boolean
      }
      finish_technical_performance_request: {
        Args: {
          p_error: string
          p_lease: string
          p_observation: Json
          p_project: string
          p_request: string
          p_user: string
        }
        Returns: boolean
      }
      finish_weekly_preparation_stage: {
        Args: {
          p_hash: string
          p_project: string
          p_request: string
          p_result: Json
          p_user: string
        }
        Returns: boolean
      }
      forget_project_knowledge: {
        Args: {
          p_expected: number
          p_id: string
          p_kind: string
          p_project: string
          p_user: string
        }
        Returns: Json
      }
      grant_ai_citation_inspection_assignment: {
        Args: {
          p_inspector: string
          p_owner: string
          p_project: string
          p_row: string
        }
        Returns: Json
      }
      grant_ai_citation_review_assignment: {
        Args: {
          p_finding: string
          p_owner: string
          p_project: string
          p_reviewer: string
        }
        Returns: Json
      }
      gsc_cron_secret: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hold_technical_crawl_admission: {
        Args: {
          p_lease: string
          p_project: string
          p_reason: string
          p_revision: number
          p_run: string
          p_user: string
        }
        Returns: boolean
      }
      issue_technical_crawl_ownership: {
        Args: {
          p_origin: string
          p_project: string
          p_token: string
          p_user: string
          p_website: string
        }
        Returns: Json
      }
      link_publication_observation: {
        Args: {
          p_id: string
          p_import: Json
          p_observation: Json
          p_project: string
          p_user: string
        }
        Returns: boolean
      }
      list_backlink_details: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      list_backlink_monitoring: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      list_backlink_monitoring_with_origin: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      list_backlink_pages: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      list_generation_results: {
        Args: {
          p_before?: string
          p_before_id?: string
          p_project?: string
          p_user: string
        }
        Returns: {
          created_at: string
          kind: string
          project_id: string
          receipt_id: string
          title: string
        }[]
      }
      list_google_index_inspections: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      list_milo_conversations: {
        Args: {
          p_actor: string
          p_offset?: number
          p_owner: string
          p_project: string
        }
        Returns: Json
      }
      list_my_milo_conversations: {
        Args: {
          p_actor: string
          p_before_conversation?: string
          p_before_created?: string
        }
        Returns: Json
      }
      list_my_project_teams: { Args: { p_actor: string }; Returns: Json }
      list_technical_crawls: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      list_technical_performance_requests: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      lock_citation_panel: {
        Args: {
          p_expected: number
          p_panel: string
          p_project: string
          p_user: string
        }
        Returns: Json
      }
      mark_operational_notification_read: {
        Args: { p_id: string }
        Returns: boolean
      }
      milo_conversation_turn_view: {
        Args: {
          t: Database["public"]["Tables"]["milo_conversation_turns"]["Row"]
        }
        Returns: Json
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
      native_artifact_utf16_length: { Args: { s: string }; Returns: number }
      next_weekly_preparation_targets: { Args: never; Returns: Json }
      operational_notification_scan_targets: {
        Args: { p_limit?: number }
        Returns: {
          user_id: string
        }[]
      }
      project_team_authorship_hash: {
        Args: { p_content: Json }
        Returns: string
      }
      project_team_notification_recipient_eligible: {
        Args: {
          p_membership: number
          p_owner: string
          p_project: string
          p_recipient: string
          p_revision: number
        }
        Returns: boolean
      }
      project_team_notification_scan_targets: {
        Args: never
        Returns: {
          owner_id: string
          project_id: string
          recipient_id: string
        }[]
      }
      prune_milo_conversation_diagnostics: {
        Args: { p_before?: string; p_limit?: number }
        Returns: number
      }
      publish_cron_secret: { Args: never; Returns: string }
      queue_operational_email_digest: {
        Args: { p_user: string }
        Returns: string
      }
      queue_project_team_notification_digest: {
        Args: { p_owner: string; p_project: string; p_recipient: string }
        Returns: string
      }
      read_ai_answer_evidence: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_citation_business_fact: {
        Args: { p_id: string; p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_citation_business_facts: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_citation_change_approval_provenance: {
        Args: { p_artifact: string; p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_citation_change_artifacts: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_citation_finding: {
        Args: { p_id: string; p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_citation_finding_accuracy: {
        Args: { p_id: string; p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_citation_finding_for_review: {
        Args: {
          p_actor: string
          p_id: string
          p_owner: string
          p_project: string
        }
        Returns: Json
      }
      read_ai_citation_finding_for_review_v2: {
        Args: {
          p_actor: string
          p_id: string
          p_owner: string
          p_project: string
        }
        Returns: Json
      }
      read_ai_citation_finding_reviews: {
        Args: {
          p_actor: string
          p_finding: string
          p_owner: string
          p_project: string
        }
        Returns: Json
      }
      read_ai_citation_finding_v2: {
        Args: { p_id: string; p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_citation_findings: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_citation_findings_v2: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_citation_improvement: {
        Args: { p_id: string; p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_citation_improvement_for_inspection: {
        Args: {
          p_actor: string
          p_owner: string
          p_project: string
          p_row: string
        }
        Returns: Json
      }
      read_ai_citation_improvement_inspections: {
        Args: { p_project: string; p_row: string; p_user: string }
        Returns: Json
      }
      read_ai_citation_improvement_v2: {
        Args: { p_id: string; p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_citation_improvement_v4: {
        Args: { p_id: string; p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_citation_improvement_v4_summary: {
        Args: { p_id: string; p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_citation_improvements: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_citation_improvements_v2: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_citation_improvements_v4: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_native_report_artifact: {
        Args: { p_id: string; p_project: string; p_user: string }
        Returns: Json
      }
      read_ai_native_report_artifacts: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_backlink_monitoring_context: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_backlink_monitoring_owner: {
        Args: { p_lock?: boolean; p_project: string; p_user: string }
        Returns: string
      }
      read_backlink_recurring_monitor: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_citation_protocol: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      read_generation_result: {
        Args: { p_id: string; p_user: string }
        Returns: {
          created_at: string
          payload: Json
          receipt_id: string
        }[]
      }
      read_google_index_context: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_milo_conversation: {
        Args: {
          p_actor: string
          p_after?: number
          p_conversation: string
          p_owner: string
          p_project: string
        }
        Returns: Json
      }
      read_milo_draft_proposal: {
        Args: {
          p_actor: string
          p_conversation: string
          p_owner: string
          p_project: string
          p_proposal: string
          p_turn: string
        }
        Returns: Json
      }
      read_output_knowledge_dependencies: {
        Args: { p_assets: string[]; p_project: string; p_user: string }
        Returns: Json
      }
      read_output_knowledge_review_batch: {
        Args: { p_assets: string[]; p_project: string; p_user: string }
        Returns: Json
      }
      read_output_knowledge_review_context: {
        Args: { p_asset: string; p_project: string; p_user: string }
        Returns: Json
      }
      read_output_knowledge_reviews: {
        Args: { p_asset: string; p_project: string; p_user: string }
        Returns: Json
      }
      read_output_source_dependencies: {
        Args: {
          p_asset?: string
          p_assets?: string[]
          p_project: string
          p_user: string
        }
        Returns: Json
      }
      read_outreach_deliveries: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_project_knowledge: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_project_knowledge_brand: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_project_knowledge_document: {
        Args: {
          p_expected: number
          p_id: string
          p_project: string
          p_user: string
        }
        Returns: Json
      }
      read_project_knowledge_history: {
        Args: {
          p_before?: number
          p_id: string
          p_kind: string
          p_project: string
          p_user: string
        }
        Returns: Json
      }
      read_project_log_evidence: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_project_scheduler_control: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_project_source_refresh: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_project_team_approval_policy: {
        Args: { p_actor: string; p_owner: string; p_project: string }
        Returns: Json
      }
      read_project_team_comments: {
        Args: {
          p_actor: string
          p_asset: string
          p_offset?: number
          p_owner: string
          p_project: string
        }
        Returns: Json
      }
      read_project_team_invitation_delivery: {
        Args: { p_actor: string; p_invite: string; p_project: string }
        Returns: Json
      }
      read_project_team_notification_history: {
        Args: {
          p_actor: string
          p_owner: string
          p_project: string
          p_recipient: string
        }
        Returns: Json
      }
      read_project_team_notification_recipient: {
        Args: {
          p_actor: string
          p_owner: string
          p_project: string
          p_recipient: string
        }
        Returns: Json
      }
      read_project_team_review_authority: {
        Args: {
          p_actor: string
          p_asset: string
          p_owner: string
          p_project: string
        }
        Returns: Json
      }
      read_project_team_review_context: {
        Args: {
          p_actor: string
          p_asset: string
          p_owner: string
          p_project: string
        }
        Returns: Json
      }
      read_project_team_review_history: {
        Args: {
          p_actor: string
          p_asset: string
          p_owner: string
          p_project: string
        }
        Returns: Json
      }
      read_project_team_roster: {
        Args: { p_actor: string; p_owner: string; p_project: string }
        Returns: Json
      }
      read_project_team_snapshot: {
        Args: {
          p_actor: string
          p_asset?: string
          p_offset?: number
          p_owner: string
          p_project: string
          p_write?: boolean
        }
        Returns: Json
      }
      read_publication_approval: {
        Args: {
          p_asset: string
          p_hash: string
          p_project: string
          p_user: string
        }
        Returns: boolean
      }
      read_publication_approval_provenance_v1: {
        Args: {
          p_asset: string
          p_hash: string
          p_project: string
          p_user: string
        }
        Returns: Json
      }
      read_publication_evidence: {
        Args: {
          p_id?: string
          p_page: number
          p_project: string
          p_user: string
        }
        Returns: Json
      }
      read_publication_reviewed_images: {
        Args: {
          p_asset: string
          p_hash: string
          p_project: string
          p_user: string
        }
        Returns: Json
      }
      read_publication_snapshot: {
        Args: { p_id: string; p_project: string; p_user: string }
        Returns: Json
      }
      read_technical_crawl: {
        Args: { p_project: string; p_run: string; p_user: string }
        Returns: Json
      }
      read_technical_crawl_context: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_technical_crawl_finding: {
        Args: { p_evidence: string; p_project: string; p_user: string }
        Returns: Json
      }
      read_technical_crawl_owner: {
        Args: { p_project: string; p_user: string }
        Returns: string
      }
      read_technical_crawl_ownership: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_technical_performance_context: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_weekly_preparation_stages: {
        Args: { p_period: string; p_project: string; p_user: string }
        Returns: Json
      }
      read_weekly_preparation_summary: {
        Args: { p_period: string; p_project: string; p_user: string }
        Returns: Json
      }
      read_workflow_evaluations: {
        Args: { p_project: string; p_user: string }
        Returns: Json
      }
      read_workspace_bundle: { Args: { p_user_id: string }; Returns: Json }
      read_workspace_scheduler_controls: {
        Args: { p_user: string }
        Returns: Json
      }
      reap_stale_scheduled_publishes: {
        Args: { stale_after?: string }
        Returns: {
          asset_id: string
          last_error: string
          user_id: string
        }[]
      }
      reconcile_ai_expense: {
        Args: {
          p_actual: number
          p_cost_source?: string
          p_input_tokens?: number
          p_outcome: string
          p_output_tokens?: number
          p_provider_request?: string
          p_request: string
          p_user: string
        }
        Returns: {
          overrun: boolean
          state: string
        }[]
      }
      reconcile_backlink_details: {
        Args: { p_project: string; p_request: string; p_user: string }
        Returns: boolean
      }
      reconcile_backlink_monitoring: {
        Args: { p_project: string; p_request: string; p_user: string }
        Returns: boolean
      }
      reconcile_weekly_preparation: {
        Args: { p_period: string; p_project: string; p_user: string }
        Returns: boolean
      }
      record_cron_heartbeat: {
        Args: { job: string; summary?: Json }
        Returns: undefined
      }
      record_generation_result: {
        Args: { p_id: string; p_result: Json; p_user: string }
        Returns: {
          receipt_id: string
          state: string
        }[]
      }
      record_milo_conversation_diagnostic: {
        Args: {
          p_error_class: string
          p_http_status: number
          p_name_category: string
          p_operation: string
          p_outcome: string
          p_outcome_code: string
          p_provenance: string
          p_sql_state: string
          p_stage: string
          p_turn: string
        }
        Returns: undefined
      }
      record_owner_benchmark_result: {
        Args: {
          p_result: Json
          p_run: string
          p_stage: string
          p_token: string
          p_user: string
        }
        Returns: boolean
      }
      record_publication_actor: {
        Args: {
          p_actor: string
          p_id: string
          p_initiator: string
          p_project: string
          p_user: string
        }
        Returns: boolean
      }
      record_stripe_sandbox_event: {
        Args: {
          p_created: number
          p_event: string
          p_fingerprint: string
          p_object: string
          p_type: string
        }
        Returns: string
      }
      recover_weekly_preparation_stage: {
        Args: { p_project: string; p_request: string; p_user: string }
        Returns: Json
      }
      release_auto_scheduler_lease: {
        Args: { p_project: string; p_token: string; p_user: string }
        Returns: boolean
      }
      release_project_team_media: {
        Args: { p_actor: string; p_lease: string }
        Returns: undefined
      }
      release_project_team_preview: {
        Args: { p_actor: string; p_lease: string; p_owner: string }
        Returns: undefined
      }
      release_technical_crawl_dispatch: {
        Args: {
          p_address: unknown
          p_lease: string
          p_origin: string
          p_user: string
        }
        Returns: undefined
      }
      release_undispatched_backlink_observations: {
        Args: { p_monitor: string; p_user: string }
        Returns: undefined
      }
      remove_ai_answer_evidence: {
        Args: {
          p_id: string
          p_kind: string
          p_project: string
          p_user: string
        }
        Returns: boolean
      }
      remove_ai_citation_business_fact: {
        Args: { p_id: string; p_project: string; p_user: string }
        Returns: boolean
      }
      remove_ai_citation_change_artifact: {
        Args: { p_id: string; p_project: string; p_user: string }
        Returns: boolean
      }
      remove_ai_citation_change_receipt: {
        Args: { p_id: string; p_project: string; p_user: string }
        Returns: boolean
      }
      remove_ai_citation_finding: {
        Args: { p_id: string; p_project: string; p_user: string }
        Returns: boolean
      }
      remove_ai_citation_finding_review: {
        Args: {
          p_actor: string
          p_id: string
          p_owner: string
          p_project: string
        }
        Returns: boolean
      }
      remove_ai_citation_improvement: {
        Args: { p_id: string; p_project: string; p_user: string }
        Returns: boolean
      }
      remove_ai_native_report_artifact: {
        Args: { p_id: string; p_project: string; p_user: string }
        Returns: boolean
      }
      remove_project_log_evidence: {
        Args: { p_id: string; p_project: string; p_user: string }
        Returns: boolean
      }
      request_project_team_invitation_delivery: {
        Args: {
          p_actor: string
          p_email: string
          p_invite: string
          p_project: string
          p_role: string
        }
        Returns: string
      }
      reserve_ai_expense: {
        Args: {
          p_account_cap?: number
          p_ceiling: number
          p_global_cap?: number
          p_job: string
          p_model: string
          p_operation: string
          p_provider: string
          p_request: string
          p_require_manual_budget?: boolean
          p_user: string
        }
        Returns: {
          allowed: boolean
          period: string
          reason: string
        }[]
      }
      reserve_backlink_details: {
        Args: {
          p_project: string
          p_request: string
          p_scope: Json
          p_user: string
          p_website: string
        }
        Returns: Json
      }
      reserve_backlink_monitoring: {
        Args: {
          p_project: string
          p_request: string
          p_scope: Json
          p_user: string
          p_website: string
        }
        Returns: Json
      }
      reserve_backlink_page: {
        Args: {
          p_parent: string
          p_project: string
          p_request: string
          p_scope: Json
          p_user: string
          p_website: string
        }
        Returns: Json
      }
      reserve_backlink_recurring_observation: {
        Args: {
          p_monitor: string
          p_occurrence: string
          p_project: string
          p_request: string
          p_revision: number
          p_scope: Json
          p_user: string
          p_website: string
        }
        Returns: Json
      }
      reserve_google_index_inspection: {
        Args: {
          p_project: string
          p_property: string
          p_request: string
          p_url: string
          p_user: string
        }
        Returns: Json
      }
      reserve_outreach_delivery: {
        Args: {
          p_delay: number
          p_draft: string
          p_expected: number
          p_hash: string
          p_limit: number
          p_project: string
          p_recipient: string
          p_step: string
          p_user: string
        }
        Returns: boolean
      }
      reserve_technical_performance_request: {
        Args: {
          p_device: string
          p_origin: string
          p_project: string
          p_request: string
          p_scope: string
          p_source: string
          p_url: string
          p_user: string
          p_website: string
        }
        Returns: Json
      }
      resume_milo_conversation_turn: {
        Args: {
          p_actor: string
          p_conversation: string
          p_owner: string
          p_project: string
          p_turn: string
        }
        Returns: Json
      }
      resume_technical_crawl_admission: {
        Args: { p_project: string; p_run: string; p_user: string }
        Returns: boolean
      }
      retain_milo_draft_proposal: {
        Args: {
          p_actor: string
          p_asset: string
          p_attempt: string
          p_conversation: string
          p_explanation: string
          p_hash: string
          p_membership: number
          p_owner: string
          p_patch: Json
          p_project: string
          p_proposal: string
          p_turn: string
        }
        Returns: string
      }
      review_project_source_fact: {
        Args: {
          p_accept: boolean
          p_expected: number
          p_fingerprint: string
          p_key: string
          p_previous: boolean
          p_project: string
          p_source: string
          p_user: string
        }
        Returns: boolean
      }
      revoke_ai_citation_inspection_assignment: {
        Args: {
          p_inspector: string
          p_owner: string
          p_project: string
          p_row: string
        }
        Returns: boolean
      }
      revoke_ai_citation_review_assignment: {
        Args: {
          p_finding: string
          p_owner: string
          p_project: string
          p_reviewer: string
        }
        Returns: boolean
      }
      revoke_project_team_invitation: {
        Args: {
          p_actor: string
          p_invite: string
          p_owner: string
          p_project: string
        }
        Returns: boolean
      }
      revoke_technical_crawl_ownership: {
        Args: { p_project: string; p_user: string }
        Returns: undefined
      }
      save_ai_answer_evidence: {
        Args: { p_document: Json; p_project: string; p_user: string }
        Returns: string
      }
      save_ai_citation_business_fact: {
        Args: { p_project: string; p_record: Json; p_user: string }
        Returns: Json
      }
      save_ai_citation_business_fact_v2: {
        Args: {
          p_expected_head: string
          p_expected_version: number
          p_project: string
          p_record: Json
          p_user: string
        }
        Returns: Json
      }
      save_ai_citation_change_artifact: {
        Args: {
          p_fields: Json
          p_kind: string
          p_project: string
          p_reference: string
          p_user: string
        }
        Returns: Json
      }
      save_ai_citation_change_receipt: {
        Args: {
          p_actor: string
          p_artifact: string
          p_owner: string
          p_performed_at: string
          p_project: string
        }
        Returns: Json
      }
      save_ai_citation_finding: {
        Args: {
          p_project: string
          p_record: Json
          p_scope: Json
          p_user: string
        }
        Returns: Json
      }
      save_ai_citation_finding_review: {
        Args: {
          p_actor: string
          p_decision: string
          p_expected_sha: string
          p_finding: string
          p_note: string
          p_owner: string
          p_project: string
        }
        Returns: Json
      }
      save_ai_citation_finding_v2: {
        Args: {
          p_expected_head: string
          p_expected_version: number
          p_project: string
          p_record: Json
          p_scope: Json
          p_user: string
        }
        Returns: Json
      }
      save_ai_citation_improvement: {
        Args: {
          p_binding: Json
          p_project: string
          p_record: Json
          p_scope: Json
          p_user: string
        }
        Returns: Json
      }
      save_ai_citation_improvement_inspection: {
        Args: {
          p_actor: string
          p_check: string
          p_expected_head: string
          p_expected_sha: string
          p_expected_version: number
          p_observed_at: string
          p_owner: string
          p_project: string
          p_row: string
        }
        Returns: Json
      }
      save_ai_citation_improvement_v2: {
        Args: {
          p_binding: Json
          p_project: string
          p_record: Json
          p_scope: Json
          p_user: string
        }
        Returns: Json
      }
      save_ai_citation_improvement_v3: {
        Args: {
          p_binding: Json
          p_expected_findings: Json
          p_expected_head: string
          p_expected_version: number
          p_project: string
          p_record: Json
          p_scope: Json
          p_user: string
        }
        Returns: Json
      }
      save_ai_citation_improvement_v4: {
        Args: {
          p_binding: Json
          p_change_binding: Json
          p_expected_findings: Json
          p_expected_head: string
          p_expected_version: number
          p_project: string
          p_record: Json
          p_scope: Json
          p_user: string
        }
        Returns: Json
      }
      save_ai_native_report_artifact: {
        Args: {
          p_base64: string
          p_metadata: Json
          p_project: string
          p_user: string
        }
        Returns: Json
      }
      save_ai_visibility_prompt: {
        Args: {
          p_data: Json
          p_expected: number
          p_id: string
          p_project: string
          p_user: string
        }
        Returns: number
      }
      save_backlink_recurring_monitor: {
        Args: {
          p_change: string
          p_project: string
          p_revision: number
          p_settings: Json
          p_user: string
          p_website: string
        }
        Returns: Json
      }
      save_citation_capture: {
        Args: { p_document: Json; p_project: string; p_user: string }
        Returns: string
      }
      save_citation_panel_draft: {
        Args: {
          p_document: Json
          p_expected: number
          p_panel: string
          p_project: string
          p_user: string
        }
        Returns: Json
      }
      save_output_knowledge_review: {
        Args: {
          p_asset: string
          p_context: string
          p_expected: number
          p_project: string
          p_review: string
          p_user: string
          p_version: string
        }
        Returns: boolean
      }
      save_project_knowledge: {
        Args: {
          p_expected: number
          p_id: string
          p_kind: string
          p_payload: Json
          p_project: string
          p_user: string
        }
        Returns: Json
      }
      save_project_knowledge_document: {
        Args: {
          p_base64: string
          p_expected: number
          p_id: string
          p_payload: Json
          p_project: string
          p_user: string
        }
        Returns: Json
      }
      save_project_knowledge_pair: {
        Args: {
          p_project: string
          p_record: Json
          p_record_expected: number
          p_source: Json
          p_source_expected: number
          p_user: string
        }
        Returns: Json
      }
      save_project_log_evidence: {
        Args: { p_document: Json; p_project: string; p_user: string }
        Returns: string
      }
      save_project_team_approval: {
        Args: {
          p_actor: string
          p_approved: boolean
          p_asset: string
          p_draft_hash: string
          p_expected: number
          p_images?: Json
          p_membership: number
          p_owner: string
          p_policy: number
          p_project: string
          p_review: string
          p_version: string
        }
        Returns: boolean
      }
      save_project_team_draft: {
        Args: {
          p_actor: string
          p_asset: string
          p_edit: string
          p_hash: string
          p_membership: number
          p_owner: string
          p_patch: Json
          p_project: string
        }
        Returns: string
      }
      save_technical_crawl_step: {
        Args: {
          p_lease: string
          p_project: string
          p_revision: number
          p_run: string
          p_state: Json
          p_status: string
          p_user: string
        }
        Returns: boolean
      }
      save_weekly_preparation_summary: {
        Args: {
          p_period: string
          p_project: string
          p_summary: Json
          p_user: string
        }
        Returns: boolean
      }
      save_workflow_evaluation: {
        Args: { p_document: Json; p_project: string; p_user: string }
        Returns: string
      }
      schedule_approved_publication: {
        Args: {
          p_asset: string
          p_expected: number
          p_hash: string
          p_project: string
          p_publish: string
          p_user: string
        }
        Returns: Json
      }
      set_ai_citation_change_approval: {
        Args: {
          p_actor: string
          p_approved: boolean
          p_artifact: string
          p_expected_revision: number
          p_expected_sha: string
          p_owner: string
          p_project: string
          p_request: string
        }
        Returns: Json
      }
      set_operational_email_enabled: {
        Args: { p_enabled: boolean }
        Returns: boolean
      }
      set_operational_email_language: {
        Args: { p_locale: string }
        Returns: boolean
      }
      set_operational_email_preference: {
        Args: { p_enabled: boolean; p_locale: string }
        Returns: boolean
      }
      set_project_scheduler_control: {
        Args: {
          p_engine: string
          p_expected: number
          p_preparation: Json
          p_project: string
          p_user: string
        }
        Returns: Json
      }
      set_project_team_approval_policy: {
        Args: {
          p_actor: string
          p_expected: number
          p_mode: string
          p_owner: string
          p_project: string
        }
        Returns: number
      }
      set_project_team_notification_recipient: {
        Args: {
          p_action: string
          p_actor: string
          p_enabled: boolean
          p_expected: number
          p_membership: number
          p_owner: string
          p_project: string
          p_recipient: string
        }
        Returns: number
      }
      set_publication_approval: {
        Args: {
          p_approved: boolean
          p_asset: string
          p_expected: number
          p_hash: string
          p_project: string
          p_user: string
        }
        Returns: boolean
      }
      settle_generation_usage: {
        Args: { p_id: string; p_outcome: string; p_user: string }
        Returns: {
          receipt_id: string
          state: string
        }[]
      }
      start_technical_crawl: {
        Args: {
          p_expected: number
          p_origin: string
          p_project: string
          p_run: string
          p_user: string
          p_website: string
        }
        Returns: Json
      }
      sync_operational_notifications: {
        Args: {
          p_events: Json
          p_scanned_at: string
          p_user: string
          p_workspace_rev: number
        }
        Returns: boolean
      }
      withdraw_output_knowledge_review: {
        Args: {
          p_asset: string
          p_project: string
          p_review: string
          p_user: string
        }
        Returns: boolean
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
