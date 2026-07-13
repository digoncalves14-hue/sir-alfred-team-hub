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
      announcements: {
        Row: {
          author_id: string
          created_at: string
          id: string
          message: string
          type: string
          unit: string
          updated_at: string
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          message: string
          type?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          message?: string
          type?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      award_catalog_photos: {
        Row: {
          created_at: string
          item_key: string
          photo_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          item_key: string
          photo_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          item_key?: string
          photo_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      behavioral_profiles: {
        Row: {
          created_at: string
          data_teste: string | null
          id: string
          link: string | null
          observacoes: string | null
          perfil: string | null
          pontos_atencao: string | null
          pontos_fortes: string | null
          professional_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_teste?: string | null
          id?: string
          link?: string | null
          observacoes?: string | null
          perfil?: string | null
          pontos_atencao?: string | null
          pontos_fortes?: string | null
          professional_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_teste?: string | null
          id?: string
          link?: string | null
          observacoes?: string | null
          perfil?: string | null
          pontos_atencao?: string | null
          pontos_fortes?: string | null
          professional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "behavioral_profiles_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedbacks: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          message: string
          professional_id: string
          type: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          message: string
          professional_id: string
          type: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          message?: string
          professional_id?: string
          type?: string
        }
        Relationships: []
      }
      idea_votes: {
        Row: {
          created_at: string
          id: string
          idea_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idea_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idea_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idea_votes_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      ideas: {
        Row: {
          author_id: string
          category: string
          created_at: string
          description: string
          id: string
          manager_reply: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          category?: string
          created_at?: string
          description: string
          id?: string
          manager_reply?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          category?: string
          created_at?: string
          description?: string
          id?: string
          manager_reply?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      performance_snapshots: {
        Row: {
          comandas_count: number
          created_at: string
          created_by: string | null
          id: string
          period_label: string
          professional_name: string
          revenue_cents: number
          services_count: number
          top_service: string | null
          updated_at: string
        }
        Insert: {
          comandas_count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          period_label: string
          professional_name: string
          revenue_cents?: number
          services_count?: number
          top_service?: string | null
          updated_at?: string
        }
        Update: {
          comandas_count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          period_label?: string
          professional_name?: string
          revenue_cents?: number
          services_count?: number
          top_service?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      product_sales_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          period_label: string
          professional_name: string
          quantity: number
          revenue_cents: number
          top_product: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          period_label: string
          professional_name: string
          quantity?: number
          revenue_cents?: number
          top_product?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          period_label?: string
          professional_name?: string
          quantity?: number
          revenue_cents?: number
          top_product?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cargo: string | null
          categoria: Database["public"]["Enums"]["categoria"] | null
          created_at: string
          data_admissao: string | null
          data_aniversario: string | null
          email: string
          foto_url: string | null
          id: string
          nome: string
          telefone: string | null
          unidade: Database["public"]["Enums"]["unidade"] | null
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          categoria?: Database["public"]["Enums"]["categoria"] | null
          created_at?: string
          data_admissao?: string | null
          data_aniversario?: string | null
          email: string
          foto_url?: string | null
          id: string
          nome: string
          telefone?: string | null
          unidade?: Database["public"]["Enums"]["unidade"] | null
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          categoria?: Database["public"]["Enums"]["categoria"] | null
          created_at?: string
          data_admissao?: string | null
          data_aniversario?: string | null
          email?: string
          foto_url?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          unidade?: Database["public"]["Enums"]["unidade"] | null
          updated_at?: string
        }
        Relationships: []
      }
      pulses: {
        Row: {
          created_at: string
          day: string
          id: string
          mood: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day?: string
          id?: string
          mood: string
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          id?: string
          mood?: string
          user_id?: string
        }
        Relationships: []
      }
      social_posts_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          period_label: string
          posts_count: number
          professional_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          period_label: string
          posts_count?: number
          professional_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          period_label?: string
          posts_count?: number
          professional_name?: string
          updated_at?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_idea_vote_counts: {
        Args: never
        Returns: {
          idea_id: string
          votes: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "gestor" | "profissional"
      categoria: "barbeiro" | "recepcao"
      unidade: "Birigui" | "Aracatuba" | "Penapolis"
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
      app_role: ["gestor", "profissional"],
      categoria: ["barbeiro", "recepcao"],
      unidade: ["Birigui", "Aracatuba", "Penapolis"],
    },
  },
} as const
