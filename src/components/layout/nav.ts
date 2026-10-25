import {
  LayoutDashboard,
  Users,
  MapPin,
  Clock,
  CalendarCheck,
  CalendarDays,
  BarChart3,
  BarChart2,
  ScrollText,
  Settings,
  User,
  MessageSquare,
  Zap,
  TrendingUp,
  Package,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/database.types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const OWNER_NAV: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/employees', label: 'Employees', icon: Users },
  { to: '/app/live-hours', label: 'Live Hours', icon: Zap },
  { to: '/app/job-sites', label: 'Job Sites', icon: MapPin },
  { to: '/app/time-entries', label: 'Time Entries', icon: Clock },
  { to: '/app/timesheets', label: 'Timesheets', icon: CalendarCheck },
  { to: '/app/materials', label: 'Materials', icon: Package },
  { to: '/app/reports', label: 'Reports', icon: BarChart3 },
  { to: '/app/analysis', label: 'Analysis', icon: TrendingUp },
  { to: '/app/audit', label: 'Activity', icon: ScrollText },
  { to: '/app/chat', label: 'Chat', icon: MessageSquare },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

const EMPLOYEE_NAV: NavItem[] = [
  { to: '/me', label: 'Home', icon: LayoutDashboard, end: true },      // [0]
  { to: '/me/time-entries', label: 'Logs', icon: Clock },              // [1]
  { to: '/me/timesheets', label: 'Timesheets', icon: CalendarCheck },  // [2]
  { to: '/me/calendar', label: 'Calendar', icon: CalendarDays },       // [3]
  { to: '/me/job-sites', label: 'Job Sites', icon: MapPin },           // [4]
  { to: '/me/chat', label: 'Chat', icon: MessageSquare },              // [5]
  { to: '/me/materials', label: 'Materials', icon: Package },          // [6]
  { to: '/me/stats', label: 'Stats', icon: BarChart2 },                // [7]
  { to: '/me/profile', label: 'Profile', icon: User },                 // [8]
];

export function navFor(role: Role): NavItem[] {
  return role === 'owner' ? OWNER_NAV : EMPLOYEE_NAV;
}

/** Bottom-nav items for employees (Clock action is rendered separately). */
export function mobileNavFor(role: Role): NavItem[] {
  return navFor(role);
}
