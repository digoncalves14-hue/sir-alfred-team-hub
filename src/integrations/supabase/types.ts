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
      appbarber_config: {
        Row: {
          base_url: string
          endpoints: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          base_url?: string
          endpoints?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          base_url?: string
          endpoints?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      appbarber_credentials: {
        Row: {
          api_key: string
          created_at: string
          id: string
          key_hint: string
          updated_at: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          key_hint?: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          key_hint?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      best_practice_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          post_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          post_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "best_practice_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "best_practice_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      best_practice_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "best_practice_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "best_practice_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      best_practice_posts: {
        Row: {
          author_id: string
          category: string
          content: string
          created_at: string
          id: string
          title: string
          unit: string
          updated_at: string
        }
        Insert: {
          author_id: string
          category: string
          content: string
          created_at?: string
          id?: string
          title: string
          unit: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          category?: string
          content?: string
          created_at?: string
          id?: string
          title?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: string | null
          city: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          phone: string | null
          slug: string
          state: string | null
          status: string
          timezone: string | null
          updated_at: string
          whatsapp: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          phone?: string | null
          slug: string
          state?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
          whatsapp?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          phone?: string | null
          slug?: string
          state?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
          whatsapp?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_reviews: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          professional_name: string
          review_date: string
          stars: number
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          professional_name: string
          review_date?: string
          stars: number
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          professional_name?: string
          review_date?: string
          stars?: number
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          cnpj: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          phone: string | null
          plan: Database["public"]["Enums"]["company_plan"]
          primary_color: string | null
          status: Database["public"]["Enums"]["company_status"]
          timezone: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          plan?: Database["public"]["Enums"]["company_plan"]
          primary_color?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          timezone?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          plan?: Database["public"]["Enums"]["company_plan"]
          primary_color?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          timezone?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          birthdate: string | null
          company_id: string
          cpf: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          gender: string | null
          id: string
          name: string
          notes: string | null
          origin_branch_id: string | null
          phone: string | null
          preferred_professional_id: string | null
          tags: string[]
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          birthdate?: string | null
          company_id: string
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          gender?: string | null
          id?: string
          name: string
          notes?: string | null
          origin_branch_id?: string | null
          phone?: string | null
          preferred_professional_id?: string | null
          tags?: string[]
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          birthdate?: string | null
          company_id?: string
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          gender?: string | null
          id?: string
          name?: string
          notes?: string | null
          origin_branch_id?: string | null
          phone?: string | null
          preferred_professional_id?: string | null
          tags?: string[]
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_origin_branch_id_fkey"
            columns: ["origin_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_preferred_professional_id_fkey"
            columns: ["preferred_professional_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
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
          photo_paths: string[]
          professional_id: string
          type: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          message: string
          photo_paths?: string[]
          professional_id: string
          type: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          message?: string
          photo_paths?: string[]
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
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          read_at: string | null
          tab: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          tab?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          tab?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_receipts: {
        Row: {
          amount_cents: number | null
          created_at: string
          created_by: string | null
          file_path: string
          id: string
          note: string | null
          period_label: string
          professional_id: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          created_by?: string | null
          file_path: string
          id?: string
          note?: string | null
          period_label: string
          professional_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          created_by?: string | null
          file_path?: string
          id?: string
          note?: string | null
          period_label?: string
          professional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      permissions: {
        Row: {
          code: string
          description: string
          id: string
          module: string
        }
        Insert: {
          code: string
          description: string
          id?: string
          module: string
        }
        Update: {
          code?: string
          description?: string
          id?: string
          module?: string
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
      professional_services: {
        Row: {
          professional_id: string
          service_id: string
        }
        Insert: {
          professional_id: string
          service_id: string
        }
        Update: {
          professional_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_services_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
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
          company_id: string
          created_at: string
          id: string
          is_system: boolean
          name: string
          slug: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          slug: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          branch_id: string | null
          buffer_minutes: number
          category: string | null
          commission_type: string | null
          commission_value: number | null
          company_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          duration_minutes: number
          id: string
          name: string
          price: number
          promo_price: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          branch_id?: string | null
          buffer_minutes?: number
          category?: string | null
          commission_type?: string | null
          commission_value?: number | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_minutes: number
          id?: string
          name: string
          price: number
          promo_price?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          branch_id?: string | null
          buffer_minutes?: number
          category?: string | null
          commission_type?: string | null
          commission_value?: number | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          name?: string
          price?: number
          promo_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          company_id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          company_id: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          company_id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          id: string
          role_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          role_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          role_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_members_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
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
      timeline_events: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          event_date: string
          event_type: string
          id: string
          professional_name: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          event_type?: string
          id?: string
          professional_name: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          event_type?: string
          id?: string
          professional_name?: string
          title?: string
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
      get_idea_replies: {
        Args: never
        Returns: {
          idea_id: string
          manager_reply: string
        }[]
      }
      get_idea_vote_counts: {
        Args: never
        Returns: {
          idea_id: string
          votes: number
        }[]
      }
      has_permission: {
        Args: {
          _code: string
          _company_id: string
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_member: {
        Args: {
          _company_id: string
          _user_id: string
        }
        Returns: boolean
      }
      notify_all: {
        Args: {
          _body: string
          _except: string
          _kind: string
          _tab: string
          _title: string
        }
        Returns: undefined
      }
      notify_one: {
        Args: {
          _body: string
          _kind: string
          _tab: string
          _title: string
          _user: string
        }
        Returns: undefined
      }
      user_company_ids: {
        Args: {
          _user_id: string
        }
        Returns: string[]
      }
    }
    Enums: {
      app_role: "gestor" | "profissional"
      categoria: "barbeiro" | "recepcao"
      company_plan: "starter" | "pro" | "business" | "enterprise"
      company_status: "trial" | "active" | "suspended" | "cancelled"
      unidade: "Birigui" | "Aracatuba" | "Penapolis" | "Kids"
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
      company_plan: ["starter", "pro", "business", "enterprise"],
      company_status: ["trial", "active", "suspended", "cancelled"],
      unidade: ["Birigui", "Aracatuba", "Penapolis", "Kids"],
    },
  },
} as const
