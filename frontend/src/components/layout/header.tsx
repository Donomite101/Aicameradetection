'use client';

import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Bell, Sun, Moon, Search, User, ChevronDown, LogOut, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { alertsApi } from '@/services/api';
import { ws } from '@/services/websocket';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/centres': 'Training Centres',
  '/schemes': 'Government Schemes',
  '/officers': 'Officers',
  '/trainees': 'Trainees',
  '/live': 'Live Camera',
  '/attendance': 'Attendance Records',
  '/infrastructure': 'Infrastructure Compliance',
  '/alerts': 'Alerts & Notifications',
  '/map': 'Centre Map View',
  '/analytics': 'Analytics & Reports',
  '/settings': 'Settings',
};

export function Header() {
  const location = useLocation();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: alertsData } = useQuery({
    queryKey: ['header-alerts', user?.centreId],
    queryFn: () => alertsApi.list({ status: 'OPEN', limit: 5 }),
    refetchInterval: 60_000,
    enabled: !!user,
  });
  const openAlerts: any[] = (alertsData as any)?.data || [];
  const openAlertTotal: number = (alertsData as any)?.pagination?.total ?? openAlerts.length;

  React.useEffect(() => {
    const unsub = ws.on('alert:new', () => queryClient.invalidateQueries({ queryKey: ['header-alerts'] }));
    return () => unsub();
  }, [queryClient]);

  const [darkMode, setDarkMode] = React.useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  React.useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  const getPageTitle = () => {
    for (const [path, title] of Object.entries(pageTitles)) {
      if (location.pathname === path || (path !== '/' && location.pathname.startsWith(path))) {
        return title;
      }
    }
    return 'Dashboard';
  };

  const handleLogout = () => {
    useAuthStore.getState().clearAuth();
    window.location.href = '/login';
  };

  return (
    <header className="sticky top-0 z-30 h-[72px] border-b bg-background/80 backdrop-blur-md">
      <div className="flex h-full items-center justify-between px-4 lg:px-8">
        <div className="flex items-center gap-4 pl-12 lg:pl-0">
          <h1 className="max-w-[320px] truncate text-xl font-bold tracking-tight">{getPageTitle()}</h1>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl text-muted-foreground hover:text-foreground"
            onClick={() => setDarkMode(!darkMode)}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative rounded-xl text-muted-foreground hover:text-foreground">
                <Bell className="h-5 w-5" />
                {openAlertTotal > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-background">
                    {openAlertTotal > 99 ? '99+' : openAlertTotal}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {openAlerts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No open alerts</p>
              ) : (
                openAlerts.map((alert) => (
                  <DropdownMenuItem key={alert.id} className="text-sm py-2 flex-col items-start" onClick={() => navigate('/alerts')}>
                    <p className="font-medium">{alert.title}</p>
                    <p className="text-xs text-muted-foreground">{alert.centre?.name || alert.message}</p>
                    <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}</p>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-sm py-2 text-center text-primary justify-center" onClick={() => navigate('/alerts')}>
                View all alerts
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative ml-1 h-10 w-10 rounded-xl p-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-semibold text-white">
                  {user?.fullName?.charAt(0).toUpperCase() || 'U'}
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user?.fullName || 'User'}</p>
                  <p className="text-xs text-muted-foreground">{user?.email || ''}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}