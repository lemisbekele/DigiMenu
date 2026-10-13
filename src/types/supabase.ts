export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      announcements: {
        Row: {
          created_at: string | null
          id: string
          message: string
          priority: string
          target: string
          title: string
        }
        Insert: {
          created_at?: string | null
          id: string
          message?: string
          priority?: string
          target?: string
          title?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          priority?: string
          target?: string
          title?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor: string | null
          cafe_slug: string | null
          created_at: string | null
          created_at_ms: number | null
          details: Json | null
          id: string
        }
        Insert: {
          action?: string
          actor?: string | null
          cafe_slug?: string | null
          created_at?: string | null
          created_at_ms?: number | null
          details?: Json | null
          id?: string
        }
        Update: {
          action?: string
          actor?: string | null
          cafe_slug?: string | null
          created_at?: string | null
          created_at_ms?: number | null
          details?: Json | null
          id?: string
        }
        Relationships: []
      }
      cafes: {
        Row: {
          created_at: string | null
          currency: string
          id: string
          name: string
          owner_email: string | null
          slug: string
          status: string
          status_updated_at: string | null
          subscription_id: string | null
          time_zone: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string
          id: string
          name: string
          owner_email?: string | null
          slug: string
          status?: string
          status_updated_at?: string | null
          subscription_id?: string | null
          time_zone?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string
          id?: string
          name?: string
          owner_email?: string | null
          slug?: string
          status?: string
          status_updated_at?: string | null
          subscription_id?: string | null
          time_zone?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      features: {
        Row: {
          created_at: string | null
          description: string
          enabled: boolean
          key: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string
          enabled?: boolean
          key: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          enabled?: boolean
          key?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          cafe_slug: string | null
          category: string | null
          created_at: string | null
          id: string
          low_stock_threshold: number | null
          name: string
          quantity: number | null
          supplier_cost: number | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          cafe_slug?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          low_stock_threshold?: number | null
          name?: string
          quantity?: number | null
          supplier_cost?: number | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          cafe_slug?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          low_stock_threshold?: number | null
          name?: string
          quantity?: number | null
          supplier_cost?: number | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_cafe_fk"
            columns: ["cafe_slug"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["slug"]
          },
        ]
      }
      menu_items: {
        Row: {
          available: boolean | null
          cafe_slug: string | null
          calories: number
          category: string
          created_at: string | null
          description: string | null
          description_am: string | null
          description_om: string | null
          estimated_minutes: number | null
          id: string
          image_url: string | null
          ingredients: Json | null
          name: string
          name_am: string | null
          name_om: string | null
          options: Json | null
          price: number
          subcategory: string | null
          updated_at: string | null
        }
        Insert: {
          available?: boolean | null
          cafe_slug?: string | null
          calories?: number
          category?: string
          created_at?: string | null
          description?: string | null
          description_am?: string | null
          description_om?: string | null
          estimated_minutes?: number | null
          id?: string
          image_url?: string | null
          ingredients?: Json | null
          name: string
          name_am?: string | null
          name_om?: string | null
          options?: Json | null
          price?: number
          subcategory?: string | null
          updated_at?: string | null
        }
        Update: {
          available?: boolean | null
          cafe_slug?: string | null
          calories?: number
          category?: string
          created_at?: string | null
          description?: string | null
          description_am?: string | null
          description_om?: string | null
          estimated_minutes?: number | null
          id?: string
          image_url?: string | null
          ingredients?: Json | null
          name?: string
          name_am?: string | null
          name_om?: string | null
          options?: Json | null
          price?: number
          subcategory?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_cafe_fk"
            columns: ["cafe_slug"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["slug"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          cafe_slug: string
          created_at: string
          data: Json
          event: string
          id: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body: string
          cafe_slug: string
          created_at?: string
          data?: Json
          event: string
          id?: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string
          cafe_slug?: string
          created_at?: string
          data?: Json
          event?: string
          id?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_cafe_slug_fkey"
            columns: ["cafe_slug"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["slug"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          accepted_at_ms: number | null
          auto_ready_at: number | null
          auto_ready_enabled: boolean | null
          cafe_slug: string | null
          created_at: string | null
          created_at_ms: number | null
          currency: string
          customer: Json | null
          customer_name: string | null
          discount_amount: number | null
          estimated_ready_minutes: number | null
          id: string
          items: Json
          order_status: string | null
          paid_at: string | null
          payment_method: string | null
          payment_proof_url: string | null
          payment_status: string | null
          prepared_at: string | null
          prepared_at_ms: number | null
          ready_at: string | null
          ready_at_ms: number | null
          ready_push_delivered_count: number | null
          ready_push_sent_at: string | null
          rejection_reason: string | null
          subtotal_amount: number | null
          table_id: string
          table_number: string
          tax_amount: number | null
          tax_rate: number | null
          taxable_amount: number | null
          total_amount: number
        }
        Insert: {
          accepted_at?: string | null
          accepted_at_ms?: number | null
          auto_ready_at?: number | null
          auto_ready_enabled?: boolean | null
          cafe_slug?: string | null
          created_at?: string | null
          created_at_ms?: number | null
          currency?: string
          customer?: Json | null
          customer_name?: string | null
          discount_amount?: number | null
          estimated_ready_minutes?: number | null
          id?: string
          items?: Json
          order_status?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          payment_status?: string | null
          prepared_at?: string | null
          prepared_at_ms?: number | null
          ready_at?: string | null
          ready_at_ms?: number | null
          ready_push_delivered_count?: number | null
          ready_push_sent_at?: string | null
          rejection_reason?: string | null
          subtotal_amount?: number | null
          table_id?: string
          table_number?: string
          tax_amount?: number | null
          tax_rate?: number | null
          taxable_amount?: number | null
          total_amount?: number
        }
        Update: {
          accepted_at?: string | null
          accepted_at_ms?: number | null
          auto_ready_at?: number | null
          auto_ready_enabled?: boolean | null
          cafe_slug?: string | null
          created_at?: string | null
          created_at_ms?: number | null
          currency?: string
          customer?: Json | null
          customer_name?: string | null
          discount_amount?: number | null
          estimated_ready_minutes?: number | null
          id?: string
          items?: Json
          order_status?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          payment_status?: string | null
          prepared_at?: string | null
          prepared_at_ms?: number | null
          ready_at?: string | null
          ready_at_ms?: number | null
          ready_push_delivered_count?: number | null
          ready_push_sent_at?: string | null
          rejection_reason?: string | null
          subtotal_amount?: number | null
          table_id?: string
          table_number?: string
          tax_amount?: number | null
          tax_rate?: number | null
          taxable_amount?: number | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_cafe_fk"
            columns: ["cafe_slug"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["slug"]
          },
        ]
      }
      packages: {
        Row: {
          description: string | null
          features: Json | null
          id: string
          limits: Json | null
          name: string
          period: string
          price: string
          status: string
          updated_at: string | null
        }
        Insert: {
          description?: string | null
          features?: Json | null
          id: string
          limits?: Json | null
          name?: string
          period?: string
          price?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          description?: string | null
          features?: Json | null
          id?: string
          limits?: Json | null
          name?: string
          period?: string
          price?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      payment_options: {
        Row: {
          account_holder: string | null
          account_number: string | null
          active: boolean | null
          cafe_slug: string | null
          id: string
          instructions: string | null
          name: string
          type: string | null
        }
        Insert: {
          account_holder?: string | null
          account_number?: string | null
          active?: boolean | null
          cafe_slug?: string | null
          id: string
          instructions?: string | null
          name?: string
          type?: string | null
        }
        Update: {
          account_holder?: string | null
          account_number?: string | null
          active?: boolean | null
          cafe_slug?: string | null
          id?: string
          instructions?: string | null
          name?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_options_cafe_fk"
            columns: ["cafe_slug"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["slug"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          cafe_slug: string | null
          endpoint: string
          id: string
          order_id: string | null
          role: string | null
          subscription: Json
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          cafe_slug?: string | null
          endpoint?: string
          id: string
          order_id?: string | null
          role?: string | null
          subscription?: Json
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          cafe_slug?: string | null
          endpoint?: string
          id?: string
          order_id?: string | null
          role?: string | null
          subscription?: Json
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          cafe_slug: string | null
          id: string
          tax_label: string | null
          tax_rate: number | null
          updated_at: string | null
        }
        Insert: {
          cafe_slug?: string | null
          id: string
          tax_label?: string | null
          tax_rate?: number | null
          updated_at?: string | null
        }
        Update: {
          cafe_slug?: string | null
          id?: string
          tax_label?: string | null
          tax_rate?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settings_cafe_fk"
            columns: ["cafe_slug"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["slug"]
          },
        ]
      }
      subscription_requests: {
        Row: {
          activated_at: string | null
          approved_at: string | null
          cafe_id: string | null
          cafe_slug: string | null
          customer_admin_id: string | null
          customer_name: string
          email: string
          expired_at: string | null
          id: string
          notes: string | null
          phone: string | null
          plan_key: string
          rejected_at: string | null
          rejection_reason: string | null
          requested_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          activated_at?: string | null
          approved_at?: string | null
          cafe_id?: string | null
          cafe_slug?: string | null
          customer_admin_id?: string | null
          customer_name?: string
          email?: string
          expired_at?: string | null
          id: string
          notes?: string | null
          phone?: string | null
          plan_key?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          requested_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          activated_at?: string | null
          approved_at?: string | null
          cafe_id?: string | null
          cafe_slug?: string | null
          customer_admin_id?: string | null
          customer_name?: string
          email?: string
          expired_at?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          plan_key?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          requested_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_cafe_identity_fk"
            columns: ["cafe_id", "cafe_slug"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id", "slug"]
          },
        ]
      }
      tables: {
        Row: {
          cafe_slug: string
          id: string
          label: string
          print_note: string | null
          print_title: string | null
          table_number: number
        }
        Insert: {
          cafe_slug: string
          id: string
          label?: string
          print_note?: string | null
          print_title?: string | null
          table_number?: number
        }
        Update: {
          cafe_slug?: string
          id?: string
          label?: string
          print_note?: string | null
          print_title?: string | null
          table_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "tables_cafe_fk"
            columns: ["cafe_slug"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["slug"]
          },
        ]
      }
      user_roles: {
        Row: {
          cafe_id: string | null
          cafe_slug: string | null
          created_at: string | null
          disabled: boolean | null
          display_name: string | null
          email: string
          id: string
          language: string
          must_change_password: boolean | null
          role: string
          updated_at: string | null
        }
        Insert: {
          cafe_id?: string | null
          cafe_slug?: string | null
          created_at?: string | null
          disabled?: boolean | null
          display_name?: string | null
          email: string
          id: string
          language?: string
          must_change_password?: boolean | null
          role: string
          updated_at?: string | null
        }
        Update: {
          cafe_id?: string | null
          cafe_slug?: string | null
          created_at?: string | null
          disabled?: boolean | null
          display_name?: string | null
          email?: string
          id?: string
          language?: string
          must_change_password?: boolean | null
          role?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_cafe_identity_fk"
            columns: ["cafe_id", "cafe_slug"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id", "slug"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      billing_settings_for_cafe: {
        Args: { p_cafe_slug: string }
        Returns: {
          cafe_slug: string | null
          id: string
          tax_label: string | null
          tax_rate: number | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cafe_feature_enabled: {
        Args: { p_cafe_slug: string; p_feature: string }
        Returns: boolean
      }
      cafe_has_feature: { Args: { p_feature: string }; Returns: boolean }
      create_customer_order: {
        Args: {
          p_cafe_slug?: string
          p_estimated_ready_minutes?: number
          p_items: Json
          p_payment_method?: string
          p_table_number: string
          p_token?: string
        }
        Returns: string
      }
      create_staff_user: {
        Args: {
          p_display_name?: string
          p_email: string
          p_password: string
          p_role?: string
        }
        Returns: string
      }
      delete_cafe_tenant: { Args: { p_cafe_id: string }; Returns: Json }
      delete_staff_user: { Args: { p_uid: string }; Returns: undefined }
      get_active_cafe_plan: { Args: { p_cafe_slug: string }; Returns: string }
      get_cafe_inventory: { Args: { p_cafe_slug: string }; Returns: Json[] }
      get_cafe_region: {
        Args: { p_cafe_slug: string }
        Returns: {
          currency: string
          time_zone: string
        }[]
      }
      get_customer_push_event: { Args: { p_order_id: string }; Returns: Json }
      get_order_for_tracking: {
        Args: { p_cafe_slug?: string; p_order_id: string; p_token?: string }
        Returns: Json
      }
      get_order_push_subscriptions: {
        Args: { p_order_id: string }
        Returns: {
          cafe_slug: string | null
          endpoint: string
          id: string
          order_id: string | null
          role: string | null
          subscription: Json
          updated_at: string | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "push_subscriptions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_orders_by_ids: {
        Args: { p_cafe_slug?: string; p_ids: string[]; p_tokens?: Json }
        Returns: Json[]
      }
      get_popular_items: {
        Args: { p_cafe_slug?: string }
        Returns: {
          item_id: string
          quantity: number
        }[]
      }
      get_public_billing_settings: {
        Args: { p_cafe_slug: string }
        Returns: {
          tax_label: string
          tax_rate: number
        }[]
      }
      get_public_cafe: {
        Args: { p_cafe_slug: string }
        Returns: {
          id: string
          name: string
          slug: string
          status: string
        }[]
      }
      get_public_menu: {
        Args: { p_cafe_slug: string }
        Returns: {
          available: boolean | null
          cafe_slug: string | null
          calories: number
          category: string
          created_at: string | null
          description: string | null
          description_am: string | null
          description_om: string | null
          estimated_minutes: number | null
          id: string
          image_url: string | null
          ingredients: Json | null
          name: string
          name_am: string | null
          name_om: string | null
          options: Json | null
          price: number
          subcategory: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "menu_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_payment_options: {
        Args: { p_cafe_slug: string }
        Returns: {
          account_holder: string
          account_number: string
          active: boolean
          id: string
          instructions: string
          name: string
          type: string
        }[]
      }
      get_staff_orders: {
        Args: {
          p_cafe_slug: string
          p_limit?: number
          p_offset?: number
          p_scope?: string
        }
        Returns: Json[]
      }
      get_user_cafe_id: { Args: never; Returns: string }
      get_user_cafe_slug: { Args: never; Returns: string }
      get_user_email: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      provision_cafe_owner: {
        Args: { p_password: string; p_request_id: string }
        Returns: Json
      }
      record_client_audit: {
        Args: { p_action: string; p_details?: Json }
        Returns: undefined
      }
      save_customer_push_subscription: {
        Args: {
          p_cafe_slug?: string
          p_order_id: string
          p_subscription: Json
          p_token?: string
        }
        Returns: undefined
      }
      set_cafe_region: {
        Args: { p_cafe_slug: string; p_currency: string; p_time_zone: string }
        Returns: undefined
      }
      set_user_disabled: {
        Args: { p_disabled: boolean; p_uid: string }
        Returns: undefined
      }
      set_user_role: {
        Args: { p_role: string; p_uid: string }
        Returns: undefined
      }
      update_customer_order: {
        Args: {
          p_cafe_slug?: string
          p_clear_method?: boolean
          p_clear_proof?: boolean
          p_order_id: string
          p_payment_method?: string
          p_payment_proof_url?: string
          p_token?: string
        }
        Returns: undefined
      }
      update_staff_order: {
        Args: { p_changes: Json; p_order_id: string }
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
