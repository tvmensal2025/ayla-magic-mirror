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
      consultants: {
        Row: {
          cadastro_url: string
          created_at: string | null
          facebook_pixel_id: string | null
          google_analytics_id: string | null
          id: string
          igreen_id: string | null
          licenciada_cadastro_url: string | null
          license: string
          name: string
          phone: string
          photo_url: string | null
        }
        Insert: {
          cadastro_url: string
          created_at?: string | null
          facebook_pixel_id?: string | null
          google_analytics_id?: string | null
          id: string
          igreen_id?: string | null
          licenciada_cadastro_url?: string | null
          license: string
          name: string
          phone: string
          photo_url?: string | null
        }
        Update: {
          cadastro_url?: string
          created_at?: string | null
          facebook_pixel_id?: string | null
          google_analytics_id?: string | null
          id?: string
          igreen_id?: string | null
          licenciada_cadastro_url?: string | null
          license?: string
          name?: string
          phone?: string
          photo_url?: string | null
        }
        Relationships: []
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
      customers: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          cep: string | null
          conta_pdf_protegida: boolean | null
          conversation_step: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          debitos_aberto: boolean | null
          distribuidora: string | null
          document_back_url: string | null
          document_front_url: string | null
          document_type: string | null
          electricity_bill_photo_url: string | null
          electricity_bill_value: number | null
          email: string | null
          error_message: string | null
          id: string
          igreen_link: string | null
          name: string | null
          nome_mae: string | null
          nome_pai: string | null
          numero_instalacao: string | null
          ocr_confianca: number | null
          otp_code: string | null
          otp_received_at: string | null
          phone_landline: string | null
          phone_whatsapp: string
          portal_submitted_at: string | null
          possui_procurador: boolean | null
          rg: string | null
          senha_pdf: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          cep?: string | null
          conta_pdf_protegida?: boolean | null
          conversation_step?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          debitos_aberto?: boolean | null
          distribuidora?: string | null
          document_back_url?: string | null
          document_front_url?: string | null
          document_type?: string | null
          electricity_bill_photo_url?: string | null
          electricity_bill_value?: number | null
          email?: string | null
          error_message?: string | null
          id?: string
          igreen_link?: string | null
          name?: string | null
          nome_mae?: string | null
          nome_pai?: string | null
          numero_instalacao?: string | null
          ocr_confianca?: number | null
          otp_code?: string | null
          otp_received_at?: string | null
          phone_landline?: string | null
          phone_whatsapp: string
          portal_submitted_at?: string | null
          possui_procurador?: boolean | null
          rg?: string | null
          senha_pdf?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          cep?: string | null
          conta_pdf_protegida?: boolean | null
          conversation_step?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          debitos_aberto?: boolean | null
          distribuidora?: string | null
          document_back_url?: string | null
          document_front_url?: string | null
          document_type?: string | null
          electricity_bill_photo_url?: string | null
          electricity_bill_value?: number | null
          email?: string | null
          error_message?: string | null
          id?: string
          igreen_link?: string | null
          name?: string | null
          nome_mae?: string | null
          nome_pai?: string | null
          numero_instalacao?: string | null
          ocr_confianca?: number | null
          otp_code?: string | null
          otp_received_at?: string | null
          phone_landline?: string | null
          phone_whatsapp?: string
          portal_submitted_at?: string | null
          possui_procurador?: boolean | null
          rg?: string | null
          senha_pdf?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          consultant_id: string
          content: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          consultant_id: string
          content: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          consultant_id?: string
          content?: string
          created_at?: string | null
          id?: string
          name?: string
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
        ]
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
      whatsapp_instances: {
        Row: {
          consultant_id: string
          created_at: string | null
          id: string
          instance_name: string
        }
        Insert: {
          consultant_id: string
          created_at?: string | null
          id?: string
          instance_name: string
        }
        Update: {
          consultant_id?: string
          created_at?: string | null
          id?: string
          instance_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
