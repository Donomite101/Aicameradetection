'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Users, Building2, AlertTriangle, Camera, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { dashboardApi } from '@/services/api';
import type { DashboardSummary } from '@/types';
import { cn, formatNumber, formatPercent } from '@/lib/utils';

const statCards = [
  { key: 'totalCentres', label: 'Total Centres', icon: Building2, color: 'bg-blue-500', trend: '+2.1%' },
  { key: 'activeCentres', label: 'Active Centres', icon: Building2, color: 'bg-green-500', trend: '+1.5%' },
  { key: 'totalCameras', label: 'Total Cameras', icon: Camera, color: 'bg-purple-500', trend: '+0%' },
  { key: 'onlineCameras', label: 'Online Cameras', icon: Camera, color: 'bg-indigo-500', trend: '+3.2%' },
  { key: 'totalRecords', label: 'Attendance Records', icon: Users, color: 'bg-orange-500', trend: '+12.5%' },
  { key: 'openAlerts', label: 'Open Alerts', icon: AlertTriangle, color: 'bg-red-500', trend: '-5.3%' },
];

function StatCard({ 
  title, 
  value, 
  trend, 
  trendPositive, 
  icon: Icon, 
  color 
}: { 
  title: string; 
  value: string | number; 
  trend?: string; 
  trendPositive?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {trend && (
              <p className={cn('text-xs mt-1 flex items-center gap-1', trendPositive ? 'text-green-600' : 'text-red-600')}>
                <TrendingUp className="h-3 w-3" />
                {trend}
              </p>
            )}
          </div>
          <div className={cn('h-12 w-12 rounded-lg flex items-center justify-center', color)}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => dashboardApi.summary({ days: 30 }),
    refetchInterval: 30000,
  });

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
  const summary: DashboardSummary = (raw?.data && raw.data.overview ? raw.data : raw) || {};

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
  const recentAlerts = summary.recentAlerts || [];
  const discrepancyBreakdown = summary.attendance?.discrepancyBreakdown || {};

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Total Centres"
          value={formatNumber(summary.overview?.totalCentres ?? 0)}
          icon={Building2}
          color="bg-blue-500"
        />
        <StatCard
          title="Active Centres"
          value={formatNumber(summary.overview?.activeCentres ?? 0)}
          icon={Building2}
          color="bg-green-500"
        />
        <StatCard
          title="Total Cameras"
          value={formatNumber(summary.overview?.totalCameras ?? 0)}
          icon={Camera}
          color="bg-purple-500"
        />
        <StatCard
          title="Online Cameras"
          value={formatNumber(summary.overview?.onlineCameras ?? 0)}
          trend={`${summary.overview?.cameraUptime ?? 0}% uptime`}
          trendPositive={(summary.overview?.cameraUptime ?? 0) > 80}
          icon={Camera}
          color="bg-indigo-500"
        />
        <StatCard
          title="Attendance Records (30d)"
          value={formatNumber(summary.attendance?.totalRecords ?? 0)}
          icon={Users}
          color="bg-orange-500"
        />
        <StatCard
          title="Open Alerts"
          value={formatNumber(summary.alerts?.open ?? 0)}
          trend={(summary.alerts?.critical ?? 0) > 0 ? `${summary.alerts.critical} critical` : undefined}
          trendPositive={(summary.alerts?.critical ?? 0) === 0}
          icon={AlertTriangle}
          color="bg-red-500"
        />
      </div>

      {/* Recent Activity & Alerts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Recent Attendance */}
        <Card className="md:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Attendance Records</CardTitle>
            <Button variant="ghost" size="sm">View All</Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {recentAttendance.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No recent attendance records</p>
              ) : (
                recentAttendance.map((record) => (
                  <div key={record.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{record.centre?.name || 'Unknown Centre'}</p>
                        <p className="text-xs text-muted-foreground">{record.session} • {new Date(record.date).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{record.recordedCount} recorded</span>
                      {record.detectedCount !== undefined && (
                        <span className="text-sm text-muted-foreground">{record.detectedCount} detected</span>
                      )}
                      {record.discrepancy !== undefined && record.discrepancy !== 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {Math.abs(record.discrepancy)} diff
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Alerts</CardTitle>
            <Button variant="ghost" size="sm">View All</Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {recentAlerts.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No recent alerts</p>
              ) : (
                recentAlerts.map((alert) => (
                  <div key={alert.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors">
                    <div className={cn('h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0', 
                      alert.severity === 'CRITICAL' ? 'bg-red-100 text-red-600' :
                      alert.severity === 'HIGH' ? 'bg-orange-100 text-orange-600' :
                      alert.severity === 'MEDIUM' ? 'bg-yellow-100 text-yellow-600' :
                      'bg-blue-100 text-blue-600'
                    )}>
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{alert.title}</p>
                      <p className="text-xs text-muted-foreground">{alert.centre?.name || 'Unknown Centre'}</p>
                      <p className="text-xs text-muted-foreground">{new Date(alert.createdAt).toLocaleString()}</p>
                    </div>
                    <Badge variant={alert.severity === 'CRITICAL' ? 'destructive' : alert.severity === 'HIGH' ? 'warning' : 'secondary'}>
                      {alert.severity}
                    </Badge>
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
          <div className="grid gap-4 md:grid-cols-4">
            {Object.entries(discrepancyBreakdown).map(([status, count]) => (
              <div key={status} className="p-4 rounded-lg bg-muted/50 text-center">
                <p className="text-3xl font-bold">{count}</p>
                <p className="text-sm text-muted-foreground capitalize">{status.toLowerCase()}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}