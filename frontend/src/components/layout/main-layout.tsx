'use client';

import * as React from 'react';
import { Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { cn } from '@/lib/utils';

export function MainLayout() {
  // The signed-in user (and their centre) is saved in the browser at login. Without a refresh, a centre you create,
  // rename or re-assign later keeps showing the OLD details until you sign out and in again.
  const updateUser = useAuthStore((state) => state.updateUser);
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => authApi.me(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
  React.useEffect(() => {
    const fresh = (me as any)?.user;
    if (fresh) {
      updateUser({ fullName: fresh.fullName, email: fresh.email, role: fresh.role, centreId: fresh.centreId ?? undefined, centre: fresh.centre ?? undefined } as any);
    }
  }, [me, updateUser]);

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}