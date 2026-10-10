'use client';

import * as React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Building2,
  Users,
  HardHat,
  AlertTriangle,
  MapPin,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Centres', href: '/centres', icon: Building2 },
  { name: 'Attendance', href: '/attendance', icon: Users },
  { name: 'Infrastructure', href: '/infrastructure', icon: HardHat },
  { name: 'Alerts', href: '/alerts', icon: AlertTriangle },
  { name: 'Map View', href: '/map', icon: MapPin },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();
  const { user, clearAuth } = useAuthStore();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const handleLogout = () => {
    clearAuth();
    window.location.href = '/login';
  };

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen bg-card border-r transition-all duration-300 lg:sticky lg:top-0 shrink-0 flex flex-col',
          collapsed ? 'w-16' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div className={cn('flex h-16 items-center justify-between border-b px-4', collapsed && 'justify-center')}>
          {!collapsed && (
            <NavLink to="/" className="flex items-center gap-2 font-semibold text-lg text-primary">
              <Building2 className="h-6 w-6" />
              <span>SIH26245</span>
            </NavLink>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className={cn('h-8 w-8', collapsed && 'ml-auto')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2" role="navigation" aria-label="Main">
          <ul className="space-y-1" role="list">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href || 
                (item.href !== '/' && location.pathname.startsWith(item.href));
              return (
                <li key={item.name}>
                  <NavLink
                    to={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                      collapsed && 'justify-center'
                    )}
                    title={collapsed ? item.name : undefined}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                    {!collapsed && <span>{item.name}</span>}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User section */}
        <div className={cn('border-t p-4', collapsed && 'items-center justify-center')}>
          {!collapsed && user && (
            <div className="flex items-center gap-3 mb-3">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium">
                {user.fullName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.fullName}</p>
                <p className="text-xs text-muted-foreground truncate capitalize">{user.role.replace('_', ' ').toLowerCase()}</p>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            className={cn('w-full justify-start gap-2', collapsed && 'justify-center')}
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span>Logout</span>}
          </Button>
        </div>
      </aside>

      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-6 w-6" />
      </Button>
    </>
  );
}