'use client';

import * as React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Building2,
  HardHat,
  AlertTriangle,
  MapPin,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  Award,
  ShieldCheck,
  GraduationCap,
  Users,
  Video,
  Search,
  PanelLeftClose,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { alertsApi } from '@/services/api';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: 'alerts';
}

/** Links are grouped; groups are separated by a dashed line. The links themselves are unchanged. */
function buildNavigation(isAdmin: boolean, centreId?: string | null): NavItem[][] {
  if (isAdmin) {
    return [
      [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Centres', href: '/centres', icon: Building2 },
        { name: 'Schemes', href: '/schemes', icon: Award },
        { name: 'Officers', href: '/officers', icon: ShieldCheck },
        { name: 'Trainees', href: '/trainees', icon: GraduationCap },
        { name: 'Attendance', href: '/attendance', icon: Users },
      ],
      [
        { name: 'Live Camera', href: '/live', icon: Video },
        { name: 'Infrastructure', href: '/infrastructure', icon: HardHat },
        { name: 'Alerts', href: '/alerts', icon: AlertTriangle, badge: 'alerts' },
        { name: 'Map View', href: '/map', icon: MapPin },
        { name: 'Analytics', href: '/analytics', icon: BarChart3 },
      ],
      [{ name: 'Settings', href: '/settings', icon: Settings }],
    ];
  }

  // Site / Monitoring Officer
  return [
    [
      { name: 'My Centre', href: '/', icon: LayoutDashboard },
      ...(centreId ? [{ name: 'Centre Analysis', href: `/centres/${centreId}`, icon: Building2 }] : []),
      { name: 'Trainees', href: '/trainees', icon: GraduationCap },
      { name: 'Track Attendance', href: '/attendance', icon: Users },
    ],
    [
      { name: 'Live Camera', href: '/live', icon: Video },
      { name: 'Infrastructure', href: '/infrastructure', icon: HardHat },
      { name: 'Alerts', href: '/alerts', icon: AlertTriangle, badge: 'alerts' },
    ],
    [{ name: 'Settings', href: '/settings', icon: Settings }],
  ];
}

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();
  const [collapsed, setCollapsed] = React.useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const searchRef = React.useRef<HTMLInputElement>(null);

  const isAdmin = user?.role === 'ADMIN';
  const groups = React.useMemo(() => buildNavigation(isAdmin, user?.centreId), [isAdmin, user?.centreId]);

  // Same query the header bell uses, so the count is shared and not fetched twice
  const { data: alertsData } = useQuery({
    queryKey: ['header-alerts', user?.centreId],
    queryFn: () => alertsApi.list({ status: 'OPEN', limit: 5 }),
    refetchInterval: 60_000,
    enabled: !!user,
  });
  const openAlerts: number = (alertsData as any)?.pagination?.total ?? ((alertsData as any)?.data?.length || 0);

  const toggleCollapsed = (value: boolean) => {
    setCollapsed(value);
    try {
      localStorage.setItem('sidebar-collapsed', String(value));
    } catch {
      /* private mode: just do not remember it */
    }
  };

  // Ctrl+K (or Cmd+K) jumps to the search box
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (collapsed) toggleCollapsed(false);
        setMobileOpen(true);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [collapsed]);

  // Close the mobile drawer after moving to another page
  React.useEffect(() => setMobileOpen(false), [location.pathname]);

  const filtered = query.trim()
    ? [groups.flat().filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()))]
    : groups;

  const handleLogout = () => {
    clearAuth();
    window.location.href = '/login';
  };

  const compact = collapsed && !mobileOpen;

  const isActive = (href: string) => location.pathname === href || (href !== '/' && location.pathname.startsWith(href));

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-[1px] lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 shrink-0 p-3 transition-all duration-300 lg:sticky lg:top-0 lg:h-screen',
          compact ? 'w-[88px]' : 'w-[288px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-full flex-col rounded-3xl border bg-card shadow-float">
          {/* Logo + collapse */}
          <div className={cn('flex items-center px-4 pb-3 pt-5', compact ? 'justify-center' : 'justify-between')}>
            {compact ? (
              <button
                type="button"
                onClick={() => toggleCollapsed(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform hover:scale-105"
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <Building2 className="h-5 w-5" />
              </button>
            ) : (
              <>
                <NavLink to="/" className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <span className="truncate text-lg font-bold tracking-tight">Geopulse</span>
                </NavLink>
                <button
                  type="button"
                  onClick={() => toggleCollapsed(true)}
                  className="hidden h-9 w-9 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          {/* Search */}
          <div className="px-3 pb-3">
            {compact ? (
              <button
                type="button"
                onClick={() => {
                  toggleCollapsed(false);
                  setTimeout(() => searchRef.current?.focus(), 320);
                }}
                className="flex h-11 w-full items-center justify-center rounded-xl border bg-card text-muted-foreground transition-colors hover:bg-muted"
                aria-label="Search pages"
                title="Search pages"
              >
                <Search className="h-4 w-4" />
              </button>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setQuery('');
                    if (e.key === 'Enter' && filtered[0]?.[0]) {
                      navigate(filtered[0][0].href);
                      setQuery('');
                    }
                  }}
                  placeholder="Search"
                  aria-label="Search pages"
                  className="h-11 w-full rounded-xl border bg-card pl-10 pr-12 text-sm shadow-card outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/30"
                />
                <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Ctrl K
                </kbd>
              </div>
            )}
          </div>

          {/* Links */}
          <nav className="flex-1 overflow-y-auto px-3 pb-2" role="navigation" aria-label="Main">
            {filtered.map((group, gi) => (
              <div key={gi}>
                {gi > 0 && <div className="mx-1 my-3 border-t border-dashed" aria-hidden="true" />}
                <ul className="space-y-1" role="list">
                  {group.map((item) => {
                    const active = isActive(item.href);
                    const badge = item.badge === 'alerts' && openAlerts > 0 ? (openAlerts > 99 ? '99+' : String(openAlerts)) : null;
                    return (
                      <li key={item.name}>
                        <NavLink
                          to={item.href}
                          className={cn(
                            'group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                            active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            compact && 'justify-center px-0'
                          )}
                          title={compact ? item.name : undefined}
                          aria-current={active ? 'page' : undefined}
                        >
                          <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                          {!compact && <span className="flex-1 truncate">{item.name}</span>}
                          {!compact && badge && (
                            <span className="rounded-lg bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-500/15 dark:text-red-300">{badge}</span>
                          )}
                          {compact && badge && <span className="absolute right-3 top-2.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-card" />}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {query.trim() && filtered[0]?.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No page matches "{query}"</p>}
          </nav>

          {/* Signed-in user */}
          <div className="border-t border-dashed p-3">
            {compact ? (
              <div className="flex flex-col items-center gap-2">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-semibold text-white"
                  title={user?.fullName}
                >
                  {user?.fullName?.charAt(0).toUpperCase() || 'U'}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Logout"
                  title="Logout"
                >
                  <LogOut className="h-[18px] w-[18px]" />
                </button>
              </div>
            ) : (
              user && (
                <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-semibold text-white">
                    {user.fullName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{user.fullName}</p>
                    <p className="truncate text-xs capitalize text-muted-foreground">
                      {user.role.replace('_', ' ').toLowerCase()}
                      {(user.centre?.code || user.centreId) && <span className="font-mono"> · {user.centre?.code || 'Assigned Site'}</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                    aria-label="Logout"
                    title="Logout"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </aside>

      {/* Mobile menu button */}
      <button
        type="button"
        className="fixed left-4 top-[18px] z-40 flex h-10 w-10 items-center justify-center rounded-xl border bg-card shadow-card lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
    </>
  );
}
