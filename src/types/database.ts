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
      app_settings: {
        Row: {
          currency_code: string
          id: number
          locale: string
          onboarded_at: string | null
          store_name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          currency_code?: string
          id?: number
          locale?: string
          onboarded_at?: string | null
          store_name?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          currency_code?: string
          id?: number
          locale?: string
          onboarded_at?: string | null
          store_name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_user: {
        Row: {
          active: boolean
          created_at: string
          label: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          label: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          label?: string
          user_id?: string
        }
        Relationships: []
      }
      article_category: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          actor: string | null
          after: Json | null
          at: string
          before: Json | null
          id: number
          operation: string
          row_id: string
          table_name: string
        }
        Insert: {
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: number
          operation: string
          row_id: string
          table_name: string
        }
        Update: {
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: number
          operation?: string
          row_id?: string
          table_name?: string
        }
        Relationships: []
      }
      charge: {
        Row: {
          amount: number
          charge_category_id: string
          created_at: string
          id: string
          note: string | null
          occurred_on: string
        }
        Insert: {
          amount: number
          charge_category_id: string
          created_at?: string
          id?: string
          note?: string | null
          occurred_on: string
        }
        Update: {
          amount?: number
          charge_category_id?: string
          created_at?: string
          id?: string
          note?: string | null
          occurred_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_charge_category_id_fkey"
            columns: ["charge_category_id"]
            isOneToOne: false
            referencedRelation: "charge_category"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_category: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_system: boolean
          name: string
          nature: Database["public"]["Enums"]["charge_nature"]
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          nature?: Database["public"]["Enums"]["charge_nature"]
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          nature?: Database["public"]["Enums"]["charge_nature"]
          sort_order?: number
        }
        Relationships: []
      }
      markup_rate: {
        Row: {
          category_id: string
          created_at: string
          effective_from: string
          id: string
          markup_pct: number
        }
        Insert: {
          category_id: string
          created_at?: string
          effective_from: string
          id?: string
          markup_pct: number
        }
        Update: {
          category_id?: string
          created_at?: string
          effective_from?: string
          id?: string
          markup_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "markup_rate_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "article_category"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase: {
        Row: {
          amount_at_cost: number
          category_id: string
          created_at: string
          id: string
          note: string | null
          occurred_on: string
          prior_count_id: string | null
        }
        Insert: {
          amount_at_cost: number
          category_id: string
          created_at?: string
          id?: string
          note?: string | null
          occurred_on: string
          prior_count_id?: string | null
        }
        Update: {
          amount_at_cost?: number
          category_id?: string
          created_at?: string
          id?: string
          note?: string | null
          occurred_on?: string
          prior_count_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "article_category"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_prior_count_id_fkey"
            columns: ["prior_count_id"]
            isOneToOne: true
            referencedRelation: "stock_count"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count: {
        Row: {
          category_id: string
          created_at: string
          id: string
          note: string | null
          occurred_on: string
          source: Database["public"]["Enums"]["count_source"]
          value_at_cost: number
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          note?: string | null
          occurred_on: string
          source: Database["public"]["Enums"]["count_source"]
          value_at_cost: number
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          note?: string | null
          occurred_on?: string
          source?: Database["public"]["Enums"]["count_source"]
          value_at_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "article_category"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_loss: {
        Row: {
          amount_at_cost: number
          category_id: string
          created_at: string
          id: string
          note: string | null
          occurred_on: string
          reason: Database["public"]["Enums"]["loss_reason"]
        }
        Insert: {
          amount_at_cost: number
          category_id: string
          created_at?: string
          id?: string
          note?: string | null
          occurred_on: string
          reason?: Database["public"]["Enums"]["loss_reason"]
        }
        Update: {
          amount_at_cost?: number
          category_id?: string
          created_at?: string
          id?: string
          note?: string | null
          occurred_on?: string
          reason?: Database["public"]["Enums"]["loss_reason"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_loss_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "article_category"
            referencedColumns: ["id"]
          },
        ]
      }
      takings: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          occurred_on: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          occurred_on: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          occurred_on?: string
        }
        Relationships: []
      }
      write_request: {
        Row: {
          at: string
          request_id: string
          result: Json
          rpc: string
        }
        Insert: {
          at?: string
          request_id: string
          result: Json
          rpc: string
        }
        Update: {
          at?: string
          request_id?: string
          result?: Json
          rpc?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_count_window: {
        Row: {
          anomaly: string | null
          category_id: string | null
          close_on: string | null
          close_rank: number | null
          close_value: number | null
          goods_sold_at_cost: number | null
          inflow: number | null
          losses: number | null
          open_on: string | null
          open_rank: number | null
          open_value: number | null
          outflow: number | null
          window_days: number | null
        }
        Relationships: []
      }
      v_stock_event: {
        Row: {
          amount: number | null
          category_id: string | null
          kind: string | null
          occurred_on: string | null
          ord_anchor: string | null
          ord_group: number | null
          ord_sub: number | null
          src_id: string | null
        }
        Relationships: []
      }
      v_stock_event_ranked: {
        Row: {
          amount: number | null
          category_id: string | null
          evt_rank: number | null
          kind: string | null
          occurred_on: string | null
          ord_anchor: string | null
          ord_group: number | null
          ord_sub: number | null
          src_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_count_plausibility: {
        Args: { p_as_of: string; p_category: string; p_value: number }
        Returns: Json
      }
      edit_purchase: {
        Args: {
          p_amount: number
          p_category: string
          p_date: string
          p_id: string
          p_note?: string
          p_prior_stock: number
        }
        Returns: Json
      }
      expected_on_hand: {
        Args: { p_as_of: string; p_category: string }
        Returns: number
      }
      is_app_user: { Args: never; Returns: boolean }
      loss_nature: {
        Args: { r: Database["public"]["Enums"]["loss_reason"] }
        Returns: Database["public"]["Enums"]["loss_nature_t"]
      }
      markup_at: {
        Args: { p_category: string; p_date: string }
        Returns: number
      }
      record_count_sweep: {
        Args: { p_counts: Json; p_date: string; p_request_id: string }
        Returns: Json
      }
      record_purchase: {
        Args: {
          p_amount: number
          p_category: string
          p_date: string
          p_note?: string
          p_prior_stock: number
          p_request_id: string
        }
        Returns: Json
      }
      report_period: { Args: { p_from: string; p_to: string }; Returns: Json }
      report_trend: { Args: { p_months?: number }; Returns: Json }
      store_today: { Args: never; Returns: string }
      window_overlap_days: {
        Args: { p_a: string; p_b_eff: string; p_close: string; p_open: string }
        Returns: number
      }
    }
    Enums: {
      charge_nature: "operating" | "owner_draw"
      count_source: "standalone" | "purchase"
      loss_nature_t: "shrinkage" | "owner_draw"
      loss_reason:
        | "spoiled"
        | "broken"
        | "stolen"
        | "given_away"
        | "family_taken"
        | "personal_use"
        | "other"
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
      charge_nature: ["operating", "owner_draw"],
      count_source: ["standalone", "purchase"],
      loss_nature_t: ["shrinkage", "owner_draw"],
      loss_reason: [
        "spoiled",
        "broken",
        "stolen",
        "given_away",
        "family_taken",
        "personal_use",
        "other",
      ],
    },
  },
} as const

