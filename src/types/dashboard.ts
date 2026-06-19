export interface DashboardKPIs {
  total_slots: number;
  occupied_slots: number;
  occupancy_percent: number;
  total_divisions: number;
  today_checkins: number;
  yesterday_checkins: number;
  checkins_diff: number;
  today_revenue: number;
  yesterday_revenue: number;
  revenue_growth_percent: number;
}

export interface DivisionOccupancyItem {
  division_id: string;
  division_name: string;
  truck_type: string;
  total_slots: number;
  occupied_slots: number;
  occupancy_percent: number;
}

export interface SlotMapSlot {
  id: string;
  code: string;
  status: string;
}

export interface SlotMapDivision {
  division_id: string;
  division_name: string;
  truck_type: string;
  slots: SlotMapSlot[];
}

export interface LiveAlertItem {
  id: string;
  notice_type: string;
  message: string | null;
  truck_number: string | null;
  owner_name: string | null;
  owner_mobile: string | null;
  session_id: string | null;
  is_system: boolean;
  created_at: string | null;
}

export interface WeeklyRevenueItem {
  date: string;
  day: string;
  cash: number;
  card_upi: number;
  total: number;
}

export interface PaymentSplit {
  cash_percent: number;
  card_upi_percent: number;
  total_cash: number;
  total_card_upi: number;
}

export interface DashboardResponse {
  kpis: DashboardKPIs;
  division_occupancy: DivisionOccupancyItem[];
  slot_map: SlotMapDivision[];
  live_alerts: LiveAlertItem[];
  weekly_revenue: WeeklyRevenueItem[];
  payment_split: PaymentSplit;
}
