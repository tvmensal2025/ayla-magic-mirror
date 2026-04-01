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
          approved: boolean | null
          cadastro_url: string
          created_at: string | null
          facebook_pixel_id: string | null
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
          created_at?: string | null
          facebook_pixel_id?: string | null
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
          created_at?: string | null
          facebook_pixel_id?: string | null
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
      crm_deals: {
        Row: {
          approved_at: string | null
          consultant_id: string
          created_at: string
          customer_id: string | null
          id: string
          notes: string | null
          remote_jid: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          consultant_id: string
          created_at?: string
          customer_id?: string | null
          id?: string
          notes?: string | null
          remote_jid?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          consultant_id?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          notes?: string | null
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
          andamento_igreen: string | null
          assinatura_cliente: string | null
          assinatura_igreen: string | null
          cashback: string | null
          cep: string | null
          consultant_id: string | null
          conta_pdf_protegida: boolean | null
          conversation_step: string | null
          cpf: string | null
          created_at: string
          data_ativo: string | null
          data_cadastro: string | null
          data_nascimento: string | null
          data_validado: string | null
          debitos_aberto: boolean | null
          desconto_cliente: number | null
          devolutiva: string | null
          distribuidora: string | null
          document_back_url: string | null
          document_front_url: string | null
          document_type: string | null
          electricity_bill_photo_url: string | null
          electricity_bill_value: number | null
          email: string | null
          error_message: string | null
          id: string
          igreen_code: string | null
          igreen_link: string | null
          link_assinatura: string | null
          media_consumo: number | null
          name: string | null
          nivel_licenciado: string | null
          nome_mae: string | null
          nome_pai: string | null
          numero_instalacao: string | null
          observacao: string | null
          ocr_confianca: number | null
          otp_code: string | null
          otp_received_at: string | null
          phone_landline: string | null
          phone_whatsapp: string
          portal_submitted_at: string | null
          possui_procurador: boolean | null
          registered_by_igreen_id: string | null
          registered_by_name: string | null
          rg: string | null
          senha_pdf: string | null
          status: string
          status_financeiro: string | null
          updated_at: string
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          andamento_igreen?: string | null
          assinatura_cliente?: string | null
          assinatura_igreen?: string | null
          cashback?: string | null
          cep?: string | null
          consultant_id?: string | null
          conta_pdf_protegida?: boolean | null
          conversation_step?: string | null
          cpf?: string | null
          created_at?: string
          data_ativo?: string | null
          data_cadastro?: string | null
          data_nascimento?: string | null
          data_validado?: string | null
          debitos_aberto?: boolean | null
          desconto_cliente?: number | null
          devolutiva?: string | null
          distribuidora?: string | null
          document_back_url?: string | null
          document_front_url?: string | null
          document_type?: string | null
          electricity_bill_photo_url?: string | null
          electricity_bill_value?: number | null
          email?: string | null
          error_message?: string | null
          id?: string
          igreen_code?: string | null
          igreen_link?: string | null
          link_assinatura?: string | null
          media_consumo?: number | null
          name?: string | null
          nivel_licenciado?: string | null
          nome_mae?: string | null
          nome_pai?: string | null
          numero_instalacao?: string | null
          observacao?: string | null
          ocr_confianca?: number | null
          otp_code?: string | null
          otp_received_at?: string | null
          phone_landline?: string | null
          phone_whatsapp: string
          portal_submitted_at?: string | null
          possui_procurador?: boolean | null
          registered_by_igreen_id?: string | null
          registered_by_name?: string | null
          rg?: string | null
          senha_pdf?: string | null
          status?: string
          status_financeiro?: string | null
          updated_at?: string
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          andamento_igreen?: string | null
          assinatura_cliente?: string | null
          assinatura_igreen?: string | null
          cashback?: string | null
          cep?: string | null
          consultant_id?: string | null
          conta_pdf_protegida?: boolean | null
          conversation_step?: string | null
          cpf?: string | null
          created_at?: string
          data_ativo?: string | null
          data_cadastro?: string | null
          data_nascimento?: string | null
          data_validado?: string | null
          debitos_aberto?: boolean | null
          desconto_cliente?: number | null
          devolutiva?: string | null
          distribuidora?: string | null
          document_back_url?: string | null
          document_front_url?: string | null
          document_type?: string | null
          electricity_bill_photo_url?: string | null
          electricity_bill_value?: number | null
          email?: string | null
          error_message?: string | null
          id?: string
          igreen_code?: string | null
          igreen_link?: string | null
          link_assinatura?: string | null
          media_consumo?: number | null
          name?: string | null
          nivel_licenciado?: string | null
          nome_mae?: string | null
          nome_pai?: string | null
          numero_instalacao?: string | null
          observacao?: string | null
          ocr_confianca?: number | null
          otp_code?: string | null
          otp_received_at?: string | null
          phone_landline?: string | null
          phone_whatsapp?: string
          portal_submitted_at?: string | null
          possui_procurador?: boolean | null
          registered_by_igreen_id?: string | null
          registered_by_name?: string | null
          rg?: string | null
          senha_pdf?: string | null
          status?: string
          status_financeiro?: string | null
          updated_at?: string
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
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
