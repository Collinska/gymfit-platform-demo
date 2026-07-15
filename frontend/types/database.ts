export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      gym_members: {
        Row: {
          id: string;
          erp_customer_id: string | null;
          first_name: string | null;
          last_name: string | null;
          mobile: string | null;
          email: string | null;
          card_id: string | null;
          is_active: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Record<string, Json | undefined>;
        Update: Record<string, Json | undefined>;
        Relationships: [];
      };
      gym_memberships: {
        Row: {
          id: string;
          member_id: string;
          erp_sale_serial: string | null;
          plan_name: string | null;
          membership_start: string | null;
          membership_end: string | null;
          status: string | null;
        };
        Insert: Record<string, Json | undefined>;
        Update: Record<string, Json | undefined>;
        Relationships: [];
      };
      sync_log: {
        Row: {
          id: string;
          erp_sale_serial: string | null;
          action: string | null;
          status: string | null;
          message: string | null;
          created_at: string | null;
        };
        Insert: Record<string, Json | undefined>;
        Update: Record<string, Json | undefined>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
