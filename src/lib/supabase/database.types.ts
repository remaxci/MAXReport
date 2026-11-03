// Fichier généré depuis la base Supabase (projet MAXreport-dev).
// Ne pas modifier à la main : le régénérer après chaque migration.

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          brand_id: string | null
          id: number
          new_values: Json | null
          old_values: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          brand_id?: string | null
          id?: never
          new_values?: Json | null
          old_values?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          brand_id?: string | null
          id?: never
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      brand_modules: {
        Row: {
          brand_id: string
          enabled: boolean
          module_key: string
          settings: Json
          updated_at: string
        }
        Insert: {
          brand_id: string
          enabled?: boolean
          module_key: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          brand_id?: string
          enabled?: boolean
          module_key?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_modules_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_modules_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
        ]
      }
      brands: {
        Row: {
          archived_at: string | null
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          logo_path: string | null
          name: string
          primary_color: string | null
          reporting_currency: string
          slug: string
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          logo_path?: string | null
          name: string
          primary_color?: string | null
          reporting_currency?: string
          slug: string
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          logo_path?: string | null
          name?: string
          primary_color?: string | null
          reporting_currency?: string
          slug?: string
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      commercial_documents: {
        Row: {
          amount: number | null
          archived_at: string | null
          brand_id: string
          comments: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          custom: Json
          follow_up_on: string | null
          id: string
          issued_on: string
          kind: string
          owner_id: string
          recipient_response: string | null
          reference: string
          sent_on: string | null
          status_id: string
          subject: string
          updated_at: string
          updated_by: string | null
          valid_until: string | null
        }
        Insert: {
          amount?: number | null
          archived_at?: string | null
          brand_id: string
          comments?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          custom?: Json
          follow_up_on?: string | null
          id?: string
          issued_on?: string
          kind: string
          owner_id?: string
          recipient_response?: string | null
          reference?: string
          sent_on?: string | null
          status_id: string
          subject: string
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
        }
        Update: {
          amount?: number | null
          archived_at?: string | null
          brand_id?: string
          comments?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          custom?: Json
          follow_up_on?: string | null
          id?: string
          issued_on?: string
          kind?: string
          owner_id?: string
          recipient_response?: string | null
          reference?: string
          sent_on?: string | null
          status_id?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_documents_brand_id_company_id_fkey"
            columns: ["brand_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "commercial_documents_brand_id_contact_id_fkey"
            columns: ["brand_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "commercial_documents_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_documents_brand_id_status_id_fkey"
            columns: ["brand_id", "status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "commercial_documents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          archived_at: string | null
          brand_id: string
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          custom: Json
          email: string | null
          id: string
          import_batch_id: string | null
          name: string
          next_follow_up_on: string | null
          owner_id: string | null
          phone: string | null
          sector: string | null
          source: string | null
          status_id: string | null
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          archived_at?: string | null
          brand_id: string
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          custom?: Json
          email?: string | null
          id?: string
          import_batch_id?: string | null
          name: string
          next_follow_up_on?: string | null
          owner_id?: string | null
          phone?: string | null
          sector?: string | null
          source?: string | null
          status_id?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          archived_at?: string | null
          brand_id?: string
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          custom?: Json
          email?: string | null
          id?: string
          import_batch_id?: string | null
          name?: string
          next_follow_up_on?: string | null
          owner_id?: string | null
          phone?: string | null
          sector?: string | null
          source?: string | null
          status_id?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_brand_id_status_id_fkey"
            columns: ["brand_id", "status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "companies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          archived_at: string | null
          brand_id: string
          company_id: string
          created_at: string
          created_by: string | null
          custom: Json
          email: string | null
          full_name: string
          id: string
          job_title: string | null
          phone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          brand_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          custom?: Json
          email?: string | null
          full_name: string
          id?: string
          job_title?: string | null
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          brand_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          custom?: Json
          email?: string | null
          full_name?: string
          id?: string
          job_title?: string | null
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_brand_id_company_id_fkey"
            columns: ["brand_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["brand_id", "id"]
          },
        ]
      }
      contracts: {
        Row: {
          amount: number
          archived_at: string | null
          brand_id: string
          comments: string | null
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          custom: Json
          end_on: string | null
          id: string
          offer_id: string | null
          opportunity_id: string | null
          owner_id: string
          signed_on: string
          start_on: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          archived_at?: string | null
          brand_id: string
          comments?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          currency: string
          custom?: Json
          end_on?: string | null
          id?: string
          offer_id?: string | null
          opportunity_id?: string | null
          owner_id?: string
          signed_on: string
          start_on?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          archived_at?: string | null
          brand_id?: string
          comments?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          custom?: Json
          end_on?: string | null
          id?: string
          offer_id?: string | null
          opportunity_id?: string | null
          owner_id?: string
          signed_on?: string
          start_on?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_brand_id_company_id_fkey"
            columns: ["brand_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "contracts_brand_id_offer_id_fkey"
            columns: ["brand_id", "offer_id"]
            isOneToOne: false
            referencedRelation: "commercial_documents"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "contracts_brand_id_opportunity_id_fkey"
            columns: ["brand_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "contracts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_definitions: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          entity: string
          help_text: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          options_list_id: string | null
          position: number
          required: boolean
          type: string
          updated_at: string
          validation: Json
          write_permission: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          entity: string
          help_text?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          options_list_id?: string | null
          position?: number
          required?: boolean
          type: string
          updated_at?: string
          validation?: Json
          write_permission?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          entity?: string
          help_text?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          options_list_id?: string | null
          position?: number
          required?: boolean
          type?: string
          updated_at?: string
          validation?: Json
          write_permission?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_definitions_brand_id_options_list_id_fkey"
            columns: ["brand_id", "options_list_id"]
            isOneToOne: false
            referencedRelation: "option_lists"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "custom_field_definitions_write_permission_fkey"
            columns: ["write_permission"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      document_attachments: {
        Row: {
          brand_id: string
          created_at: string
          document_id: string
          file_name: string
          id: string
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          document_id: string
          file_name: string
          id?: string
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          document_id?: string
          file_name?: string
          id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_attachments_brand_id_document_id_fkey"
            columns: ["brand_id", "document_id"]
            isOneToOne: false
            referencedRelation: "commercial_documents"
            referencedColumns: ["brand_id", "id"]
          },
        ]
      }
      document_events: {
        Row: {
          actor_id: string | null
          brand_id: string
          document_id: string
          id: string
          occurred_at: string
          payload: Json
          type: string
        }
        Insert: {
          actor_id?: string | null
          brand_id: string
          document_id: string
          id?: string
          occurred_at?: string
          payload?: Json
          type: string
        }
        Update: {
          actor_id?: string | null
          brand_id?: string
          document_id?: string
          id?: string
          occurred_at?: string
          payload?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_events_brand_id_document_id_fkey"
            columns: ["brand_id", "document_id"]
            isOneToOne: false
            referencedRelation: "commercial_documents"
            referencedColumns: ["brand_id", "id"]
          },
        ]
      }
      interactions: {
        Row: {
          brand_id: string
          company_id: string
          contact_id: string | null
          created_at: string
          id: string
          occurred_at: string
          opportunity_id: string | null
          summary: string
          type: string
          user_id: string
        }
        Insert: {
          brand_id: string
          company_id: string
          contact_id?: string | null
          created_at?: string
          id?: string
          occurred_at?: string
          opportunity_id?: string | null
          summary: string
          type: string
          user_id?: string
        }
        Update: {
          brand_id?: string
          company_id?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          occurred_at?: string
          opportunity_id?: string | null
          summary?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_brand_id_company_id_fkey"
            columns: ["brand_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "interactions_brand_id_contact_id_fkey"
            columns: ["brand_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "interactions_brand_id_opportunity_id_fkey"
            columns: ["brand_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          brand_id: string | null
          created_at: string
          created_by: string | null
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          group_label: string
          key: string
          label: string
          position: number
        }
        Insert: {
          group_label: string
          key: string
          label: string
          position?: number
        }
        Update: {
          group_label?: string
          key?: string
          label?: string
          position?: number
        }
        Relationships: []
      }
      objectives: {
        Row: {
          brand_id: string
          comments: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          id: string
          metric_key: string
          period_end: string
          period_start: string
          target_value: number
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          brand_id: string
          comments?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          id?: string
          metric_key: string
          period_end: string
          period_start: string
          target_value: number
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          brand_id?: string
          comments?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          id?: string
          metric_key?: string
          period_end?: string
          period_start?: string
          target_value?: number
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objectives_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectives_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          amount: number | null
          archived_at: string | null
          brand_id: string
          closed_on: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          custom: Json
          expected_close_on: string | null
          id: string
          lost_reason: string | null
          owner_id: string
          source: string | null
          stage_id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: number | null
          archived_at?: string | null
          brand_id: string
          closed_on?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          custom?: Json
          expected_close_on?: string | null
          id?: string
          lost_reason?: string | null
          owner_id?: string
          source?: string | null
          stage_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number | null
          archived_at?: string | null
          brand_id?: string
          closed_on?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          custom?: Json
          expected_close_on?: string | null
          id?: string
          lost_reason?: string | null
          owner_id?: string
          source?: string | null
          stage_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_brand_id_company_id_fkey"
            columns: ["brand_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "opportunities_brand_id_contact_id_fkey"
            columns: ["brand_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "opportunities_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_brand_id_stage_id_fkey"
            columns: ["brand_id", "stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      option_items: {
        Row: {
          brand_id: string
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string
          list_id: string
          position: number
          updated_at: string
          value: string
        }
        Insert: {
          brand_id: string
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          list_id: string
          position?: number
          updated_at?: string
          value: string
        }
        Update: {
          brand_id?: string
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          list_id?: string
          position?: number
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "option_items_brand_id_list_id_fkey"
            columns: ["brand_id", "list_id"]
            isOneToOne: false
            referencedRelation: "option_lists"
            referencedColumns: ["brand_id", "id"]
          },
        ]
      }
      option_lists: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          is_system: boolean
          key: string
          label: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          is_system?: boolean
          key: string
          label: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          is_system?: boolean
          key?: string
          label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "option_lists_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          key: string
          label: string
          module: string
        }
        Insert: {
          key: string
          label: string
          module: string
        }
        Update: {
          key?: string
          label?: string
          module?: string
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          brand_id: string
          category: string
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          key: string
          label: string
          position: number
          probability: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          key: string
          label: string
          position?: number
          probability?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          key?: string
          label?: string
          position?: number
          probability?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_brand_id: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          job_title: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_brand_id?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          job_title?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_brand_id?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          job_title?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_brand_id_fkey"
            columns: ["default_brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission: string
          role_id: string
        }
        Insert: {
          permission: string
          role_id: string
        }
        Update: {
          permission?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          key: string
          label: string
          scope: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          label: string
          scope: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          label?: string
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      statuses: {
        Row: {
          brand_id: string
          category: string
          color: string | null
          created_at: string
          entity: string
          id: string
          is_active: boolean
          is_default: boolean
          key: string
          label: string
          position: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          category: string
          color?: string | null
          created_at?: string
          entity: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          key: string
          label: string
          position?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          category?: string
          color?: string | null
          created_at?: string
          entity?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          key?: string
          label?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "statuses_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reports: {
        Row: {
          brand_id: string
          calls_follow_up: number
          calls_prospecting: number
          comments: string | null
          created_at: string
          custom: Json
          emails_sent: number
          id: string
          memos_declared: number | null
          opportunities_declared: number | null
          qualified_meetings: number
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
          validated_at: string | null
          validated_by: string | null
          week_start: string
        }
        Insert: {
          brand_id: string
          calls_follow_up?: number
          calls_prospecting?: number
          comments?: string | null
          created_at?: string
          custom?: Json
          emails_sent?: number
          id?: string
          memos_declared?: number | null
          opportunities_declared?: number | null
          qualified_meetings?: number
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          validated_at?: string | null
          validated_by?: string | null
          week_start: string
        }
        Update: {
          brand_id?: string
          calls_follow_up?: number
          calls_prospecting?: number
          comments?: string | null
          created_at?: string
          custom?: Json
          emails_sent?: number
          id?: string
          memos_declared?: number | null
          opportunities_declared?: number | null
          qualified_meetings?: number
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          validated_at?: string | null
          validated_by?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reports_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platforms: {
        Row: {
          is_active: boolean
          key: string
          kind: string
          label: string
          position: number
        }
        Insert: {
          is_active?: boolean
          key: string
          kind: string
          label: string
          position?: number
        }
        Update: {
          is_active?: boolean
          key?: string
          kind?: string
          label?: string
          position?: number
        }
        Relationships: []
      }
      social_accounts: {
        Row: {
          archived_at: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          handle: string | null
          id: string
          name: string
          platform: string
          updated_at: string
          updated_by: string | null
          url: string | null
        }
        Insert: {
          archived_at?: string | null
          brand_id: string
          created_at?: string
          created_by?: string | null
          handle?: string | null
          id?: string
          name: string
          platform: string
          updated_at?: string
          updated_by?: string | null
          url?: string | null
        }
        Update: {
          archived_at?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          handle?: string | null
          id?: string
          name?: string
          platform?: string
          updated_at?: string
          updated_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_platform_fkey"
            columns: ["platform"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["key"]
          },
        ]
      }
      social_snapshots: {
        Row: {
          account_id: string
          brand_id: string
          clicks: number | null
          comments: string | null
          created_at: string
          created_by: string | null
          followers_new: number | null
          followers_total: number | null
          id: string
          import_batch_id: string | null
          impressions: number | null
          interactions: number | null
          period_end: string
          period_start: string
          posts: number | null
          reach: number | null
          source: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          brand_id: string
          clicks?: number | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          followers_new?: number | null
          followers_total?: number | null
          id?: string
          import_batch_id?: string | null
          impressions?: number | null
          interactions?: number | null
          period_end: string
          period_start: string
          posts?: number | null
          reach?: number | null
          source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          brand_id?: string
          clicks?: number | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          followers_new?: number | null
          followers_total?: number | null
          id?: string
          import_batch_id?: string | null
          impressions?: number | null
          interactions?: number | null
          period_end?: string
          period_start?: string
          posts?: number | null
          reach?: number | null
          source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_snapshots_brand_id_account_id_fkey"
            columns: ["brand_id", "account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["brand_id", "id"]
          },
        ]
      }
      campaigns: {
        Row: {
          archived_at: string | null
          brand_id: string
          comments: string | null
          created_at: string
          created_by: string | null
          currency: string
          custom: Json
          end_on: string | null
          external_id: string | null
          id: string
          name: string
          objective: string
          planned_budget: number | null
          platform: string
          start_on: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          brand_id: string
          comments?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          custom?: Json
          end_on?: string | null
          external_id?: string | null
          id?: string
          name: string
          objective?: string
          planned_budget?: number | null
          platform: string
          start_on?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          brand_id?: string
          comments?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          custom?: Json
          end_on?: string | null
          external_id?: string | null
          id?: string
          name?: string
          objective?: string
          planned_budget?: number | null
          platform?: string
          start_on?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_platform_fkey"
            columns: ["platform"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["key"]
          },
        ]
      }
      campaign_snapshots: {
        Row: {
          brand_id: string
          campaign_id: string
          clicks: number | null
          comments: string | null
          conversion_value: number | null
          conversions: number | null
          created_at: string
          created_by: string | null
          id: string
          import_batch_id: string | null
          impressions: number | null
          leads: number | null
          period_end: string
          period_start: string
          reach: number | null
          source: string
          spend: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_id: string
          campaign_id: string
          clicks?: number | null
          comments?: string | null
          conversion_value?: number | null
          conversions?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          impressions?: number | null
          leads?: number | null
          period_end: string
          period_start: string
          reach?: number | null
          source?: string
          spend?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_id?: string
          campaign_id?: string
          clicks?: number | null
          comments?: string | null
          conversion_value?: number | null
          conversions?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          impressions?: number | null
          leads?: number | null
          period_end?: string
          period_start?: string
          reach?: number | null
          source?: string
          spend?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_snapshots_brand_id_campaign_id_fkey"
            columns: ["brand_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["brand_id", "id"]
          },
        ]
      }
      websites: {
        Row: {
          archived_at: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
          updated_by: string | null
          url: string | null
        }
        Insert: {
          archived_at?: string | null
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          updated_by?: string | null
          url?: string | null
        }
        Update: {
          archived_at?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "websites_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      website_snapshots: {
        Row: {
          brand_id: string
          comments: string | null
          conversions: number | null
          created_at: string
          created_by: string | null
          form_submissions: number | null
          id: string
          import_batch_id: string | null
          page_views: number | null
          period_end: string
          period_start: string
          sessions: number | null
          sessions_direct: number | null
          sessions_email: number | null
          sessions_organic: number | null
          sessions_other: number | null
          sessions_paid: number | null
          sessions_referral: number | null
          sessions_social: number | null
          source: string
          updated_at: string
          updated_by: string | null
          users: number | null
          website_id: string
        }
        Insert: {
          brand_id: string
          comments?: string | null
          conversions?: number | null
          created_at?: string
          created_by?: string | null
          form_submissions?: number | null
          id?: string
          import_batch_id?: string | null
          page_views?: number | null
          period_end: string
          period_start: string
          sessions?: number | null
          sessions_direct?: number | null
          sessions_email?: number | null
          sessions_organic?: number | null
          sessions_other?: number | null
          sessions_paid?: number | null
          sessions_referral?: number | null
          sessions_social?: number | null
          source?: string
          updated_at?: string
          updated_by?: string | null
          users?: number | null
          website_id: string
        }
        Update: {
          brand_id?: string
          comments?: string | null
          conversions?: number | null
          created_at?: string
          created_by?: string | null
          form_submissions?: number | null
          id?: string
          import_batch_id?: string | null
          page_views?: number | null
          period_end?: string
          period_start?: string
          sessions?: number | null
          sessions_direct?: number | null
          sessions_email?: number | null
          sessions_organic?: number | null
          sessions_other?: number | null
          sessions_paid?: number | null
          sessions_referral?: number | null
          sessions_social?: number | null
          source?: string
          updated_at?: string
          updated_by?: string | null
          users?: number | null
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_snapshots_brand_id_website_id_fkey"
            columns: ["brand_id", "website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["brand_id", "id"]
          },
        ]
      }
      import_batches: {
        Row: {
          brand_id: string
          committed_at: string | null
          committed_by: string | null
          created_at: string
          created_by: string | null
          error_count: number | null
          file_name: string
          file_sha256: string
          file_size: number
          headers: Json
          id: string
          inserted_count: number | null
          mapping: Json
          options: Json
          report: Json | null
          rolled_back_at: string | null
          rolled_back_by: string | null
          row_count: number
          rows: Json
          skipped_count: number | null
          status: string
          target: string
        }
        Insert: {
          brand_id: string
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          created_by?: string | null
          error_count?: number | null
          file_name: string
          file_sha256: string
          file_size: number
          headers: Json
          id?: string
          inserted_count?: number | null
          mapping?: Json
          options?: Json
          report?: Json | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          row_count: number
          rows: Json
          skipped_count?: number | null
          status?: string
          target: string
        }
        Update: {
          brand_id?: string
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          created_by?: string | null
          error_count?: number | null
          file_name?: string
          file_sha256?: string
          file_size?: number
          headers?: Json
          id?: string
          inserted_count?: number | null
          mapping?: Json
          options?: Json
          report?: Json | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          row_count?: number
          rows?: Json
          skipped_count?: number | null
          status?: string
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_metrics: {
        Row: {
          brand_id: string
          comments: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          id: string
          import_batch_id: string
          metric_key: string
          period_end: string
          period_start: string
          user_id: string | null
          value: number
        }
        Insert: {
          brand_id: string
          comments?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          id?: string
          import_batch_id: string
          metric_key: string
          period_end: string
          period_start: string
          user_id?: string | null
          value: number
        }
        Update: {
          brand_id?: string
          comments?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          id?: string
          import_batch_id?: string
          metric_key?: string
          period_end?: string
          period_start?: string
          user_id?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "historical_metrics_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_metrics_brand_id_import_batch_id_fkey"
            columns: ["brand_id", "import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "historical_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          created_at: string
          created_by: string | null
          from_currency: string
          id: string
          rate: number
          rate_date: string
          source: string
          to_currency: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_currency: string
          id?: string
          rate: number
          rate_date: string
          source: string
          to_currency: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_currency?: string
          id?: string
          rate?: number
          rate_date?: string
          source?: string
          to_currency?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          amount: number
          archived_at: string | null
          brand_id: string
          comments: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          name: string
          period_end: string
          period_start: string
          scope: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          archived_at?: string | null
          brand_id: string
          comments?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          name: string
          period_end: string
          period_start: string
          scope?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          archived_at?: string | null
          brand_id?: string
          comments?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          name?: string
          period_end?: string
          period_start?: string
          scope?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budgets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_lines: {
        Row: {
          amount: number
          brand_id: string
          budget_id: string
          campaign_id: string | null
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          position: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          brand_id: string
          budget_id: string
          campaign_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          position?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          brand_id?: string
          budget_id?: string
          campaign_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          position?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_brand_id_budget_id_fkey"
            columns: ["brand_id", "budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "budget_lines_brand_id_campaign_id_fkey"
            columns: ["brand_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["brand_id", "id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          archived_at: string | null
          brand_id: string
          budget_line_id: string
          campaign_id: string | null
          comments: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string
          expense_date: string
          external_ref: string | null
          id: string
          import_batch_id: string | null
          paid_on: string | null
          source: string
          status: string
          supplier: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          archived_at?: string | null
          brand_id: string
          budget_line_id: string
          campaign_id?: string | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
          description: string
          expense_date: string
          external_ref?: string | null
          id?: string
          import_batch_id?: string | null
          paid_on?: string | null
          source?: string
          status?: string
          supplier?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          archived_at?: string | null
          brand_id?: string
          budget_line_id?: string
          campaign_id?: string | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          expense_date?: string
          external_ref?: string | null
          id?: string
          import_batch_id?: string | null
          paid_on?: string | null
          source?: string
          status?: string
          supplier?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_brand_id_budget_line_id_fkey"
            columns: ["brand_id", "budget_line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "expenses_brand_id_campaign_id_fkey"
            columns: ["brand_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "expenses_brand_id_import_batch_id_fkey"
            columns: ["brand_id", "import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["brand_id", "id"]
          },
        ]
      }
      report_templates: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          period_kind: string
          sections: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          period_kind?: string
          sections: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          period_kind?: string
          sections?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          due_on: string
          id: string
          name: string
          project_id: string
          reached_on: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          due_on: string
          id?: string
          name: string
          project_id: string
          reached_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          due_on?: string
          id?: string
          name?: string
          project_id?: string
          reached_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "milestones_brand_id_project_id_fkey"
            columns: ["brand_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["brand_id", "id"]
          },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          brand_id: string
          color: string | null
          created_at: string
          created_by: string | null
          custom: Json
          description: string | null
          end_on: string | null
          id: string
          name: string
          owner_id: string | null
          start_on: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          brand_id: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          custom?: Json
          description?: string | null
          end_on?: string | null
          id?: string
          name: string
          owner_id?: string | null
          start_on?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          brand_id?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          custom?: Json
          description?: string | null
          end_on?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          start_on?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_events: {
        Row: {
          actor_id: string | null
          brand_id: string
          id: string
          occurred_at: string
          payload: Json
          task_id: string
          type: string
        }
        Insert: {
          actor_id?: string | null
          brand_id: string
          id?: string
          occurred_at?: string
          payload?: Json
          task_id: string
          type: string
        }
        Update: {
          actor_id?: string | null
          brand_id?: string
          id?: string
          occurred_at?: string
          payload?: Json
          task_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_events_brand_id_task_id_fkey"
            columns: ["brand_id", "task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["brand_id", "id"]
          },
        ]
      }
      tasks: {
        Row: {
          archived_at: string | null
          assignee_id: string | null
          brand_id: string
          campaign_id: string | null
          company_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          custom: Json
          description: string | null
          document_id: string | null
          due_on: string | null
          estimate_hours: number | null
          id: string
          milestone_id: string | null
          parent_id: string | null
          position: number
          priority: string
          progress: number
          project_id: string | null
          start_on: string | null
          status_id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          assignee_id?: string | null
          brand_id: string
          campaign_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          custom?: Json
          description?: string | null
          document_id?: string | null
          due_on?: string | null
          estimate_hours?: number | null
          id?: string
          milestone_id?: string | null
          parent_id?: string | null
          position?: number
          priority?: string
          progress?: number
          project_id?: string | null
          start_on?: string | null
          status_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          assignee_id?: string | null
          brand_id?: string
          campaign_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          custom?: Json
          description?: string | null
          document_id?: string | null
          due_on?: string | null
          estimate_hours?: number | null
          id?: string
          milestone_id?: string | null
          parent_id?: string | null
          position?: number
          priority?: string
          progress?: number
          project_id?: string | null
          start_on?: string | null
          status_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_brand_id_campaign_id_fkey"
            columns: ["brand_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "tasks_brand_id_company_id_fkey"
            columns: ["brand_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "tasks_brand_id_document_id_fkey"
            columns: ["brand_id", "document_id"]
            isOneToOne: false
            referencedRelation: "commercial_documents"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "tasks_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_brand_id_milestone_id_fkey"
            columns: ["brand_id", "milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "tasks_brand_id_parent_id_fkey"
            columns: ["brand_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "tasks_brand_id_project_id_fkey"
            columns: ["brand_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["brand_id", "id"]
          },
          {
            foreignKeyName: "tasks_brand_id_status_id_fkey"
            columns: ["brand_id", "status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["brand_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activity_members: {
        Args: { p_brand_id: string }
        Returns: {
          label: string
          user_id: string
        }[]
      }
      add_brand_member: {
        Args: { p_brand_id: string; p_email: string; p_role_id: string }
        Returns: string
      }
      brand_member_options: {
        Args: { p_brand_id: string }
        Returns: {
          is_global: boolean
          label: string
          user_id: string
        }[]
      }
      commit_import: {
        Args: {
          p_batch_id: string
          p_errors: number
          p_report: Json
          p_rows: Json
          p_skipped: number
        }
        Returns: number
      }
      metric_actuals: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          currency: string
          metric_key: string
          user_id: string
          value: number
        }[]
      }
      reorder_config: {
        Args: { p_brand_id: string; p_ids: string[]; p_table: string }
        Returns: undefined
      }
      rollback_import: {
        Args: { p_batch_id: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
