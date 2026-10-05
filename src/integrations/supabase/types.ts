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
      addresses: {
        Row: {
          apartment: string | null
          area: string | null
          building: string | null
          city: string
          created_at: string
          floor: string | null
          id: string
          is_default: boolean
          label: string
          lat: number | null
          lng: number | null
          notes: string | null
          phone: string | null
          recipient_name: string | null
          street: string
          user_id: string
        }
        Insert: {
          apartment?: string | null
          area?: string | null
          building?: string | null
          city: string
          created_at?: string
          floor?: string | null
          id?: string
          is_default?: boolean
          label?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          phone?: string | null
          recipient_name?: string | null
          street: string
          user_id: string
        }
        Update: {
          apartment?: string | null
          area?: string | null
          building?: string | null
          city?: string
          created_at?: string
          floor?: string | null
          id?: string
          is_default?: boolean
          label?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          phone?: string | null
          recipient_name?: string | null
          street?: string
          user_id?: string
        }
        Relationships: []
      }
      banners: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_active: boolean
          link: string | null
          sort_order: number
          subtitle_ar: string | null
          subtitle_en: string | null
          title_ar: string | null
          title_en: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_active?: boolean
          link?: string | null
          sort_order?: number
          subtitle_ar?: string | null
          subtitle_en?: string | null
          title_ar?: string | null
          title_en?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_active?: boolean
          link?: string | null
          sort_order?: number
          subtitle_ar?: string | null
          subtitle_en?: string | null
          title_ar?: string | null
          title_en?: string | null
        }
        Relationships: []
      }
      branches: {
        Row: {
          address_ar: string | null
          address_en: string | null
          created_at: string
          id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          name_ar: string
          name_en: string
          phone: string | null
        }
        Insert: {
          address_ar?: string | null
          address_en?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name_ar: string
          name_en: string
          phone?: string | null
        }
        Update: {
          address_ar?: string | null
          address_en?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name_ar?: string
          name_en?: string
          phone?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          name_ar: string
          name_en: string
          parent_id: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name_ar: string
          name_en: string
          parent_id?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name_ar?: string
          name_en?: string
          parent_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          ends_at: string | null
          id: string
          is_active: boolean
          max_discount: number | null
          max_uses: number | null
          min_order: number
          starts_at: string | null
          used_count: number
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          discount_type: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          max_uses?: number | null
          min_order?: number
          starts_at?: string | null
          used_count?: number
          value: number
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          max_uses?: number | null
          min_order?: number
          starts_at?: string | null
          used_count?: number
          value?: number
        }
        Relationships: []
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          created_at: string
          driver_id: string
          heading: number | null
          id: string
          lat: number
          lng: number
          order_id: string
          speed: number | null
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          driver_id: string
          heading?: number | null
          id?: string
          lat: number
          lng: number
          order_id: string
          speed?: number | null
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          driver_id?: string
          heading?: number | null
          id?: string
          lat?: number
          lng?: number
          order_id?: string
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_profiles: {
        Row: {
          is_available: boolean
          updated_at: string
          user_id: string
          vehicle: string | null
        }
        Insert: {
          is_available?: boolean
          updated_at?: string
          user_id: string
          vehicle?: string | null
        }
        Update: {
          is_available?: boolean
          updated_at?: string
          user_id?: string
          vehicle?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          image_url: string | null
          line_total: number
          name_ar: string
          name_en: string
          notes: string | null
          order_id: string
          product_id: string | null
          quantity: number
          unit: string
          unit_price: number
          variant_id: string | null
          variant_name_ar: string | null
          variant_name_en: string | null
        }
        Insert: {
          id?: string
          image_url?: string | null
          line_total: number
          name_ar: string
          name_en: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          quantity: number
          unit: string
          unit_price: number
          variant_id?: string | null
          variant_name_ar?: string | null
          variant_name_en?: string | null
        }
        Update: {
          id?: string
          image_url?: string | null
          line_total?: number
          name_ar?: string
          name_en?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          quantity?: number
          unit?: string
          unit_price?: number
          variant_id?: string | null
          variant_name_ar?: string | null
          variant_name_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          note: string | null
          order_id: string
          status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address: Json
          branch_id: string | null
          coupon_code: string | null
          created_at: string
          delivery_fee: number
          delivery_slot: string
          discount: number
          driver_accepted_at: string | null
          driver_id: string | null
          id: string
          notes: string | null
          order_number: number
          payment_method: string
          payment_status: string
          status: string
          subtotal: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address: Json
          branch_id?: string | null
          coupon_code?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_slot?: string
          discount?: number
          driver_accepted_at?: string | null
          driver_id?: string | null
          id?: string
          notes?: string | null
          order_number?: never
          payment_method?: string
          payment_status?: string
          status?: string
          subtotal: number
          total: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: Json
          branch_id?: string | null
          coupon_code?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_slot?: string
          discount?: number
          driver_accepted_at?: string | null
          driver_id?: string | null
          id?: string
          notes?: string | null
          order_number?: never
          payment_method?: string
          payment_status?: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          attributes: Json
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          old_price: number | null
          price: number
          product_id: string
          sort_order: number
          stock: number
        }
        Insert: {
          attributes?: Json
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          old_price?: number | null
          price: number
          product_id: string
          sort_order?: number
          stock?: number
        }
        Update: {
          attributes?: Json
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          old_price?: number | null
          price?: number
          product_id?: string
          sort_order?: number
          stock?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category_id: string | null
          created_at: string
          description_ar: string | null
          description_en: string | null
          flash_ends_at: string | null
          flash_price: number | null
          id: string
          images: string[]
          is_active: boolean
          is_featured: boolean
          min_qty: number
          name_ar: string
          name_en: string
          old_price: number | null
          price: number
          rating_avg: number
          rating_count: number
          sku: string | null
          sold_count: number
          step: number
          stock: number
          unit: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          flash_ends_at?: string | null
          flash_price?: number | null
          id?: string
          images?: string[]
          is_active?: boolean
          is_featured?: boolean
          min_qty?: number
          name_ar: string
          name_en: string
          old_price?: number | null
          price: number
          rating_avg?: number
          rating_count?: number
          sku?: string | null
          sold_count?: number
          step?: number
          stock?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          flash_ends_at?: string | null
          flash_price?: number | null
          id?: string
          images?: string[]
          is_active?: boolean
          is_featured?: boolean
          min_qty?: number
          name_ar?: string
          name_en?: string
          old_price?: number | null
          price?: number
          rating_avg?: number
          rating_count?: number
          sku?: string | null
          sold_count?: number
          step?: number
          stock?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          author_name: string | null
          comment: string | null
          created_at: string
          id: string
          product_id: string
          rating: number
          user_id: string
        }
        Insert: {
          author_name?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          product_id: string
          rating: number
          user_id: string
        }
        Update: {
          author_name?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          product_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          contact_phone: string | null
          currency_code: string
          currency_symbol_ar: string
          currency_symbol_en: string
          default_language: string
          delivery_fee: number
          delivery_slots: Json
          email: string | null
          features: Json
          free_delivery_threshold: number | null
          id: number
          logo_url: string | null
          min_order_amount: number
          name_ar: string
          name_en: string
          primary_color: string
          secondary_color: string
          social_links: Json
          tagline_ar: string | null
          tagline_en: string | null
          updated_at: string
          whatsapp_number: string | null
          working_hours: Json
        }
        Insert: {
          contact_phone?: string | null
          currency_code?: string
          currency_symbol_ar?: string
          currency_symbol_en?: string
          default_language?: string
          delivery_fee?: number
          delivery_slots?: Json
          email?: string | null
          features?: Json
          free_delivery_threshold?: number | null
          id?: number
          logo_url?: string | null
          min_order_amount?: number
          name_ar?: string
          name_en?: string
          primary_color?: string
          secondary_color?: string
          social_links?: Json
          tagline_ar?: string | null
          tagline_en?: string | null
          updated_at?: string
          whatsapp_number?: string | null
          working_hours?: Json
        }
        Update: {
          contact_phone?: string | null
          currency_code?: string
          currency_symbol_ar?: string
          currency_symbol_en?: string
          default_language?: string
          delivery_fee?: number
          delivery_slots?: Json
          email?: string | null
          features?: Json
          free_delivery_threshold?: number | null
          id?: number
          logo_url?: string | null
          min_order_amount?: number
          name_ar?: string
          name_en?: string
          primary_color?: string
          secondary_color?: string
          social_links?: Json
          tagline_ar?: string | null
          tagline_en?: string | null
          updated_at?: string
          whatsapp_number?: string | null
          working_hours?: Json
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
      wishlist: {
        Row: {
          created_at: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_add_driver: { Args: { _email: string }; Returns: string }
      admin_remove_driver: { Args: { _user_id: string }; Returns: undefined }
      admin_stats: { Args: never; Returns: Json }
      cancel_my_order: { Args: { _order_id: string }; Returns: undefined }
      claim_first_admin: { Args: never; Returns: boolean }
      driver_accept_order: { Args: { _order_id: string }; Returns: undefined }
      driver_set_status: {
        Args: { _order_id: string; _status: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      order_driver_info: { Args: { _order_id: string }; Returns: Json }
      place_order: {
        Args: {
          _address_id: string
          _coupon: string
          _delivery_slot: string
          _items: Json
          _notes: string
          _payment_method: string
        }
        Returns: string
      }
      validate_coupon: {
        Args: { _code: string; _subtotal: number }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "staff" | "driver" | "customer"
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
      app_role: ["admin", "staff", "driver", "customer"],
    },
  },
} as const
