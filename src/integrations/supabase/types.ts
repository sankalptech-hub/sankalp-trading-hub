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
      alerts: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      broker_accounts: {
        Row: {
          account_id: string
          account_type: string
          balance: number
          broker_id: string
          currency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string
          account_type?: string
          balance?: number
          broker_id: string
          currency?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          account_type?: string
          balance?: number
          broker_id?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_accounts_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_orders: {
        Row: {
          broker_id: string
          created_at: string
          external_order_id: string | null
          filled_price: number | null
          id: string
          order_type: string
          price: number
          qty: number
          side: string
          status: string
          symbol: string
          user_id: string
        }
        Insert: {
          broker_id: string
          created_at?: string
          external_order_id?: string | null
          filled_price?: number | null
          id?: string
          order_type?: string
          price?: number
          qty: number
          side: string
          status?: string
          symbol: string
          user_id: string
        }
        Update: {
          broker_id?: string
          created_at?: string
          external_order_id?: string | null
          filled_price?: number | null
          id?: string
          order_type?: string
          price?: number
          qty?: number
          side?: string
          status?: string
          symbol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_orders_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
        ]
      }
      brokers: {
        Row: {
          broker_name: string
          config_json: Json | null
          created_at: string
          credentials_reset_at: string | null
          currency: string
          display_name: string
          id: string
          is_default: boolean
          region: string
          static_ip: string | null
          status: string
          supported_markets: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          broker_name: string
          config_json?: Json | null
          created_at?: string
          credentials_reset_at?: string | null
          currency?: string
          display_name: string
          id?: string
          is_default?: boolean
          region?: string
          static_ip?: string | null
          status?: string
          supported_markets?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          broker_name?: string
          config_json?: Json | null
          created_at?: string
          credentials_reset_at?: string | null
          currency?: string
          display_name?: string
          id?: string
          is_default?: boolean
          region?: string
          static_ip?: string | null
          status?: string
          supported_markets?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      build_tasks: {
        Row: {
          id: string
          module: string
          notes: string | null
          priority: string
          status: string
          task_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          module: string
          notes?: string | null
          priority?: string
          status?: string
          task_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          module?: string
          notes?: string | null
          priority?: string
          status?: string
          task_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          config_json: Json | null
          id: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config_json?: Json | null
          id?: string
          provider?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config_json?: Json | null
          id?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          broker_id: string | null
          broker_name: string | null
          created_at: string
          id: string
          qty: number
          side: string
          status: string
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          broker_id?: string | null
          broker_name?: string | null
          created_at?: string
          id?: string
          qty: number
          side: string
          status?: string
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          broker_id?: string | null
          broker_name?: string | null
          created_at?: string
          id?: string
          qty?: number
          side?: string
          status?: string
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          avg_price: number
          base_currency_value: number
          currency: string
          exchange: string | null
          exchange_rate_to_inr: number
          id: string
          qty: number
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_price?: number
          base_currency_value?: number
          currency?: string
          exchange?: string | null
          exchange_rate_to_inr?: number
          id?: string
          qty?: number
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_price?: number
          base_currency_value?: number
          currency?: string
          exchange?: string | null
          exchange_rate_to_inr?: number
          id?: string
          qty?: number
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          preferred_currency: string
          preferred_exchange: string
          rank: string
          referral_code: string | null
          referred_by: string | null
          region: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          preferred_currency?: string
          preferred_exchange?: string
          rank?: string
          referral_code?: string | null
          referred_by?: string | null
          region?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          preferred_currency?: string
          preferred_exchange?: string
          rank?: string
          referral_code?: string | null
          referred_by?: string | null
          region?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      risk_config: {
        Row: {
          daily_loss_limit: number
          id: string
          max_concentration_pct: number
          max_position_pct: number
          max_positions: number
          updated_at: string
          user_id: string
        }
        Insert: {
          daily_loss_limit?: number
          id?: string
          max_concentration_pct?: number
          max_position_pct?: number
          max_positions?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          daily_loss_limit?: number
          id?: string
          max_concentration_pct?: number
          max_position_pct?: number
          max_positions?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      signals: {
        Row: {
          created_at: string
          id: string
          price: number
          signal_type: string
          symbol: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          price?: number
          signal_type: string
          symbol: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          price?: number
          signal_type?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      strategies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          user_id?: string
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
      watchlist_symbols: {
        Row: {
          added_at: string
          display_name: string | null
          id: string
          notes: string | null
          symbol: string
          user_id: string
          watchlist_id: string
        }
        Insert: {
          added_at?: string
          display_name?: string | null
          id?: string
          notes?: string | null
          symbol: string
          user_id: string
          watchlist_id: string
        }
        Update: {
          added_at?: string
          display_name?: string | null
          id?: string
          notes?: string | null
          symbol?: string
          user_id?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_symbols_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      update_user_role: {
        Args: { _new_role: string; _user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user" | "trader" | "associate"
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
      app_role: ["admin", "user", "trader", "associate"],
    },
  },
} as const
