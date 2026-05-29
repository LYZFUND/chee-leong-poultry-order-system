import {
  BarChart3,
  Boxes,
  Building2,
  CreditCard,
  Factory,
  Home,
  MapPinned,
  ReceiptText,
  Settings,
  ShoppingCart,
  Tags,
  Truck,
  Users,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';

const navItems = [
  { label: 'Dashboard', to: '/', icon: Home },
  { label: 'Orders', to: '/orders', icon: ShoppingCart },
  { label: 'Daily Order Views', to: '/daily-orders', icon: ShoppingCart },
  { label: 'Customers', to: '/customers', icon: Users },
  { label: 'Areas', to: '/areas', icon: MapPinned },
  { label: 'Farms', to: '/farms', icon: Factory },
  { label: 'Products', to: '/products', icon: Boxes },
  { label: 'Farm Prices', to: '/farm-prices', icon: Tags },
  { label: 'Sales Prices', to: '/sales-prices', icon: ReceiptText },
  { label: 'Cost / Sales / Profit', to: '/cost-sales-profit', icon: BarChart3 },
  { label: 'Farm Payments', to: '/farm-payments', icon: CreditCard },
  { label: 'Reports', to: '/reports', icon: Building2 },
  { label: 'Settings', to: '/settings', icon: Settings },
];

export function Sidebar(): JSX.Element {
  return (
    <aside className="flex h-screen w-72 flex-col border-r border-stone-200 bg-white">
      <div className="border-b border-stone-200 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-600 text-white">
            <Truck size={22} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-bold leading-5 text-ink-900">CHEE LEONG</p>
            <p className="text-xs text-ink-500">Poultry Trading</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition',
                isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-stone-100',
              )
            }
          >
            <item.icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-stone-200 px-5 py-4 text-xs leading-5 text-ink-500">
        <p>Copyright (c) 2026 Lee Wan Wu.</p>
        <p>All rights reserved.</p>
      </div>
    </aside>
  );
}
