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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      reorder_config: {
        Args: { p_brand_id: string; p_ids: string[]; p_table: string }
        Returns: undefined
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
