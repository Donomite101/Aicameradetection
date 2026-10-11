'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Clock, Wrench, Users, Building2, AlertTriangle, Camera, Target, GraduationCap, CalendarCheck2, Plus, Video, ArrowRight, Activity, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { dashboardApi } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import { ws } from '@/services/websocket';
import type { DashboardSummary, TodaySession } from '@/types';
import { cn, formatNumber } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { to12h } from '@/components/ClassSessionScheduleBanner';
import { CurrentClassPanel } from '@/components/CurrentClassPanel';

const AI_SERVICE_URL = import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:8000';

const statCards = [
  { key: 'totalCentres', label: 'Total Centres', icon: Building2, color: 'bg-blue-500', trend: '+2.1%' },
  { key: 'activeCentres', label: 'Active Centres', icon: Building2, color: 'bg-green-500', trend: '+1.5%' },
  { key: 'totalCameras', label: 'Total Cameras', icon: Camera, color: 'bg-purple-500', trend: '+0%' },
  { key: 'onlineCameras', label: 'Cameras Reporting', icon: Camera, color: 'bg-indigo-500', trend: '+3.2%' },
  { key: 'totalRecords', label: 'Attendance Records', icon: Users, color: 'bg-orange-500', trend: '+12.5%' },
  { key: 'openAlerts', label: 'Open Alerts', icon: AlertTriangle, color: 'bg-red-500', trend: '-5.3%' },
];

function StatCard({
  title,
  value,
  trend,
  trendPositive,
  color,
}: {
  title: string;
  value: string | number;
  trend?: string;
  trendPositive?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  color: string; // e.g. "bg-blue-500": the matching border colour is used for the left edge
}) {
  return (
    <div className={cn('flex min-w-0 flex-col border-l-[3px] pl-4', color.replace('bg-', 'border-'))}>
      <p className="text-sm font-medium leading-snug text-foreground">{title}</p>
      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        {trend && (
          <span className={cn('mb-1 flex shrink-0 items-center gap-0.5 text-xs font-semibold', trendPositive ? 'text-emerald-600' : 'text-red-500')}>
            {trend}
            {trendPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          </span>
        )}
      </div>
    </div>
  );
}

const stateStyles: Record<string, { label: string; className: string }> = {
  LIVE: { label: 'Live now', className: 'bg-green-500/10 text-green-600 border-green-500/30' },
  UPCOMING: { label: 'Upcoming', className: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  COMPLETED: { label: 'Completed', className: 'bg-muted text-muted-foreground' },
  MISSED: { label: 'No detection', className: 'bg-red-500/10 text-red-600 border-red-500/30' },
};

export function TodaySessionsCard({ sessions, showCentre }: { sessions: TodaySession[]; showCentre: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" />Today's Class Sessions</CardTitle>
        <Button asChild variant="ghost" size="sm"><Link to="/attendance">Attendance details</Link></Button>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">No classes are scheduled today.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sessions.map((s) => {
              const style = stateStyles[s.state];
              const toolsBad = s.toolsTotal > 0 && s.toolsOk < s.toolsTotal;
              return (
                <div key={`${s.centreId}-${s.classSlotId}`} className={cn('rounded-lg border p-4 space-y-3', s.state === 'LIVE' && 'border-green-500/40 bg-green-500/5')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{to12h(s.startTime)} – {to12h(s.endTime)}</p>
                      {showCentre && <p className="text-xs text-muted-foreground truncate mt-0.5">{s.centreName}</p>}
                    </div>
                    <Badge variant="outline" className={cn('text-[10px] shrink-0', style.className)}>{style.label}</Badge>
                  </div>

                  {s.state === 'UPCOMING' ? (
                    <p className="text-xs text-muted-foreground">Expecting {s.expected} trainees</p>
                  ) : (
                    <>
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-2xl font-bold font-mono leading-none">
                            {(s.state === 'LIVE' && s.liveCount != null ? s.liveCount : s.detected) ?? 0}<span className="text-sm text-muted-foreground font-normal"> / {s.expected}</span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {s.isFinal ? 'final count' : s.state === 'COMPLETED' ? 'finalising…' : s.state === 'LIVE' ? `now · avg ${s.detected ?? 0}` : 'avg so far'} · peak {s.peak ?? 0}
                          </p>
                        </div>
                        {s.attendancePercent != null && (
                          <span className={cn('text-lg font-bold font-mono', s.attendancePercent >= 90 ? 'text-green-600' : s.attendancePercent >= 70 ? 'text-amber-600' : 'text-red-600')}>
                            {s.attendancePercent}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className={cn('flex items-center gap-1', toolsBad ? 'text-red-600' : 'text-muted-foreground')}>
                          <Wrench className="h-3 w-3" />
                          {s.toolsTotal > 0 ? `${s.toolsOk}/${s.toolsTotal} tools ok` : 'No tools tracked'}
                        </span>
                        {s.recordId && (
                          <Link to="/attendance" className="text-primary hover:underline">Details</Link>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LiveCameraWidget() {
  const [status, setStatus] = React.useState<{ active: boolean; currentCount: number; online: boolean } | null>(null);

  React.useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const res = await fetch(`${AI_SERVICE_URL}/status`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const data = await res.json();
          if (mounted) setStatus({ active: data.sourceMode === 'phone' ? !!data.phoneActive : data.active, currentCount: data.currentCount, online: true });
        } else {
          if (mounted) setStatus({ active: false, currentCount: 0, online: false });
        }
      } catch {
        if (mounted) setStatus({ active: false, currentCount: 0, online: false });
      }
    };
    check();
    const timer = setInterval(check, 3000);

    const unsubDetection = ws.on('detection:live', (d: any) => {
      setStatus({ active: true, currentCount: d.detectedCount ?? 0, online: true });
    });

    return () => {
      mounted = false;
      clearInterval(timer);
      unsubDetection();
    };
  }, []);

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-card via-card to-primary/5 hover:border-primary/40 transition-all overflow-hidden relative shadow-sm">
      <CardContent className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className={cn(
              "h-12 w-12 rounded-xl flex items-center justify-center transition-all",
              status?.active 
                ? "bg-red-500/10 text-red-500 ring-2 ring-red-500/30" 
                : status?.online 
                  ? "bg-emerald-500/10 text-emerald-500" 
                  : "bg-muted text-muted-foreground"
            )}>
              <Video className="h-6 w-6" />
            </div>
            {status?.active && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base">Live AI Camera Feed</h3>
              {status?.active ? (
                <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 text-xs gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  Streaming Live
                </Badge>
              ) : status?.online ? (
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs">
                  AI Ready • Camera In Standby
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  AI Offline
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {status?.active
                ? `Currently detecting ${status.currentCount} ${status.currentCount === 1 ? 'person' : 'persons'} in frame. Full screen viewer available.`
                : 'The camera starts automatically when a class slot begins and stops when it ends. Open the live viewer for a manual run.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          {status?.active && (
            <div className="bg-background/80 border rounded-lg px-3 py-1.5 text-center">
              <div className="text-xs text-muted-foreground font-medium">In Camera</div>
              <div className="text-xl font-bold text-foreground leading-tight">{status.currentCount}</div>
            </div>
          )}
          <Button asChild className="gap-2 shrink-0">
            <Link to="/live">
              <Video className="h-4 w-4" />
              <span>Open Live Camera</span>
              <ArrowRight className="h-4 w-4 ml-0.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard', 'summary', { role: user?.role, centreId: user?.centreId }],
    queryFn: () => dashboardApi.summary({ days: 30 }),
    refetchInterval: 30000,
  });

  React.useEffect(() => {
    ws.connect();
    const unsubAtt = ws.on('attendance:update', () => {
      refetch();
    });
    const unsubAlert = ws.on('alert:new', () => {
      refetch();
    });
    return () => {
      unsubAtt();
      unsubAlert();
    };
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statCards.map((_, i) => (
          <Card key={i}><CardContent className="p-6 animate-pulse"><div className="h-4 bg-muted rounded w-3/4 mb-2"/><div className="h-8 bg-muted rounded w-1/2"/></CardContent></Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Failed to load dashboard data</p>
        <Button onClick={() => refetch()} className="mt-4">Retry</Button>
      </div>
    );
  }

  const raw: any = data;
  const summary: DashboardSummary & { centre?: any } = (raw?.data && raw.data.overview ? raw.data : raw) || {};

  if (isLoading || !summary?.overview) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statCards.map((_, i) => (
          <Card key={i}><CardContent className="p-6 animate-pulse"><div className="h-4 bg-muted rounded w-3/4 mb-2"/><div className="h-8 bg-muted rounded w-1/2"/></CardContent></Card>
        ))}
      </div>
    );
  }

  const recentAttendance = summary.recentAttendance || [];
  const todaySessions: TodaySession[] = (summary as any).todaySessions || [];
  const recentAlerts = summary.recentAlerts || [];
  const discrepancyBreakdown = summary.attendance?.discrepancyBreakdown || {};

  return (
    <div className="space-y-6">
      {/* Officer Site Banner */}
      {!isAdmin && (
        <div className="bg-gradient-to-r from-blue-50 via-card to-card dark:from-blue-500/10 border rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                Site Officer Portal
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {user?.centre?.code || summary.centre?.code || 'Assigned Site'}
              </span>
            </div>
            <h1 className="text-xl font-bold mt-1">
              Welcome back, {user?.fullName || 'Officer'}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Centre: {user?.centre?.name || summary.centre?.name || 'Monitoring Site'} ({user?.centre?.city || summary.centre?.city || 'HQ'})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/trainees">
                <Plus className="h-4 w-4" />
                Add Trainee
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10">
              <Link to="/trainees">
                <CalendarCheck2 className="h-4 w-4" />
                Mark Attendance
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Performance summary */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Summary</CardTitle>
          <p className="text-sm text-muted-foreground">Key numbers {isAdmin ? 'across your training centres' : 'for your centre'}, from the AI video analytics.</p>
        </CardHeader>
        <CardContent>
      <div className="grid grid-cols-2 gap-x-6 gap-y-7 lg:grid-cols-3 2xl:grid-cols-6">
        {isAdmin ? (
          <>
            <StatCard
              title="Total Centres"
              value={formatNumber(summary.overview?.totalCentres ?? 0)}
              icon={Building2}
              color="bg-emerald-500"
            />
            <StatCard
              title="Active Centres"
              value={formatNumber(summary.overview?.activeCentres ?? 0)}
              icon={Building2}
              color="bg-red-400"
            />
          </>
        ) : (
          <>
            <StatCard
              title="Enrolled Trainees"
              value={formatNumber(summary.overview?.totalTrainees ?? 0)}
              icon={GraduationCap}
              color="bg-blue-500"
            />
            <StatCard
              title="Centre Status"
              value={(summary.centre?.status || 'UNKNOWN').replace('_', ' ')}
              icon={Building2}
              color="bg-green-500"
            />
          </>
        )}
        <StatCard
          title="Total Cameras"
          value={formatNumber(summary.overview?.totalCameras ?? 0)}
          icon={Camera}
          color="bg-violet-500"
        />
        <StatCard
          title="Cameras Reporting"
          value={formatNumber(summary.overview?.onlineCameras ?? 0)}
          trend={`${summary.overview?.cameraUptime ?? 0}% uptime`}
          trendPositive={(summary.overview?.cameraUptime ?? 0) > 80}
          icon={Camera}
          color="bg-blue-500"
        />
        <StatCard
          title="Attendance Records"
          value={formatNumber(summary.attendance?.totalRecords ?? 0)}
          icon={Users}
          color="bg-orange-400"
        />
        <StatCard
          title="Open Alerts"
          value={formatNumber(summary.alerts?.open ?? 0)}
          trend={(summary.alerts?.critical ?? 0) > 0 ? `${summary.alerts.critical} critical` : undefined}
          trendPositive={(summary.alerts?.critical ?? 0) === 0}
          icon={AlertTriangle}
          color="bg-indigo-500"
        />
      </div>
        </CardContent>
      </Card>

      {/* The class running right now: people in the room against expected */}
      <CurrentClassPanel sessions={todaySessions} showCentre={isAdmin} />

      {/* 🔴 Live AI Detection Preview Widget */}
      <LiveCameraWidget />

      {/* Today's class sessions: expected vs detected people and tools per slot */}
      <TodaySessionsCard sessions={todaySessions} showCentre={isAdmin} />

      {/* Recent Activity & Alerts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Recent Attendance */}
        <Card className="md:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Class Attendance</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link to="/attendance">View All</Link></Button>
          </CardHeader>
          <CardContent>
            <div className="max-h-[26rem] space-y-2.5 overflow-y-auto pr-1">
              {recentAttendance.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No recent attendance records</p>
              ) : (
                recentAttendance.map((record) => (
                  <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/30 p-3.5 transition-colors hover:bg-muted/60">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card shadow-card">
                        <Users className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{record.centre?.name || 'Unknown Centre'}</p>
                        <p className="text-xs text-muted-foreground">
                          {record.session}{record.classSlot ? ` (${to12h(record.classSlot.startTime)} – ${to12h(record.classSlot.endTime)})` : ''} • {new Date(record.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">
                        {record.presentCount ?? record.detectedCount ?? 0}/{record.expectedCount || record.recordedCount} {record.isFinal ? 'final' : 'so far'}
                      </span>
                      {record.attendancePercent != null && (
                        <span className="text-sm text-muted-foreground">{record.attendancePercent}%</span>
                      )}
                      {(record.toolsTotal ?? 0) > 0 && (record.toolsOk ?? 0) < (record.toolsTotal ?? 0) && (
                        <Badge variant="destructive" className="text-xs">
                          {(record.toolsTotal ?? 0) - (record.toolsOk ?? 0)} tools missing
                        </Badge>
                      )}
                      <Badge variant={record.status === 'VERIFIED' ? 'success' : record.status === 'DISCREPANT' ? 'destructive' : 'secondary'}>
                        {record.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Alerts */}
        <Card className="md:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle>Recent Alerts</CardTitle>
                {(summary.alerts?.open ?? 0) > 0 && (
                  <span className="rounded-lg bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-500/15 dark:text-red-300">
                    {summary.alerts.open} open
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Live alerts and system updates</p>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/alerts">View All</Link></Button>
          </CardHeader>
          <CardContent>
            <div className="max-h-[26rem] space-y-2.5 overflow-y-auto pr-1">
              {recentAlerts.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No recent alerts</p>
              ) : (
                recentAlerts.map((alert) => (
                  <div key={alert.id} className="rounded-2xl border bg-muted/30 p-4 transition-colors hover:bg-muted/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span
                          className={cn(
                            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                            alert.severity === 'CRITICAL' ? 'bg-red-500' : alert.severity === 'HIGH' ? 'bg-orange-500' : alert.severity === 'MEDIUM' ? 'bg-amber-500' : 'bg-blue-500'
                          )}
                          title={alert.severity}
                        />
                        <p className="text-sm font-semibold leading-snug">{alert.title}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}</span>
                    </div>
                    {alert.message && <p className="mt-1.5 line-clamp-2 pl-[18px] text-sm text-muted-foreground">{alert.message}</p>}
                    <div className="mt-3 flex items-center justify-between gap-2 pl-[18px]">
                      <span className="truncate text-xs text-muted-foreground">{alert.centre?.name || 'Unknown Centre'}</span>
                      <Link to="/alerts" className="shrink-0 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">View Details →</Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attendance Discrepancy Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Attendance Status Breakdown (30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {Object.entries(discrepancyBreakdown).map(([status, count]) => (
              <div
                key={status}
                className={cn(
                  'border-l-[3px] pl-4',
                  status === 'VERIFIED' ? 'border-emerald-500' : status === 'DISCREPANT' ? 'border-red-400' : status === 'UNDER_REVIEW' ? 'border-sky-500' : 'border-amber-400'
                )}
              >
                <p className="text-sm font-medium capitalize">{status.toLowerCase().replace('_', ' ')}</p>
                <p className="mt-2 text-3xl font-bold tracking-tight">{count as number}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}