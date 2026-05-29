export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type GenericRow = Record<string, unknown>;

export interface Database {
  public: {
    Tables: Record<
      string,
      {
        Row: GenericRow;
        Insert: GenericRow;
        Update: GenericRow;
        Relationships: [];
      }
    >;
    Views: Record<
      string,
      {
        Row: GenericRow;
        Relationships: [];
      }
    >;
    Functions: Record<string, never>;
    Enums: {
      pricing_method: 'price_per_kg' | 'price_per_product';
      deduction_policy:
        | 'allow_dead_chicken_deduction'
        | 'not_allow_dead_chicken_deduction'
        | 'allow_only_farm_problem_deduction';
      deduction_reason: 'dead_chicken' | 'farm_problem' | 'other';
      deduction_pricing_method: 'per_kg' | 'per_product' | 'manual_amount';
      payment_frequency: 'weekly_once' | 'weekly_twice' | 'monthly' | 'custom';
      payment_method: 'cash' | 'bank_transfer' | 'cheque' | 'other';
      payment_status: 'unpaid' | 'paid';
    };
    CompositeTypes: Record<string, never>;
  };
}
