'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area
} from 'recharts';
import { Calendar, Users, Building2, AlertTriangle, TrendingUp, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { dashboardApi, attendanceApi, infrastructureApi } from '@/services/api';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export function AnalyticsPage() {
  const [days, setDays] = React.useState(30);
  const [centreId, setCentreId] = React.useState<string>('');

  const { data: summary } = useQuery({
    queryKey: ['dashboard', 'summary', { days }],
    queryFn: () => dashboardApi.summary({ days }),
  });

  const { data: attendanceTrends } = useQuery({
    queryKey: ['dashboard', 'attendance', 'trends', { days, centreId }],
    queryFn: () => dashboardApi.attendanceTrends({ days, centreId: centreId || undefined }),
  });

  const { data: infraCompliance } = useQuery({
    queryKey: ['dashboard', 'infrastructure', 'compliance', { days, centreId }],
    queryFn: () => dashboardApi.infrastructureCompliance({ days, centreId: centreId || undefined }),
  });

  const { data: centres } = useQuery({
    queryKey: ['centres', 'list', { limit: 100 }],
    queryFn: () => dashboardApi.centresMap({}),
  });

  if (!summary || !attendanceTrends || !infraCompliance) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Analytics & Reports</h1>
        <Card><CardContent className="p-6 h-[400px]"><div className="animate-pulse h-full bg-muted rounded"/></CardContent></Card>
      </div>
    );
  }

  const s: any = summary;
  const ic: any = infraCompliance;
  const safeCentres: any[] = (Array.isArray(centres) ? centres : (centres as any)?.data) || [];

  // Process attendance trends for charts
  const safeTrends: any[] = (attendanceTrends as any)?.trends || (Array.isArray(attendanceTrends) ? attendanceTrends : []);
  const attendanceData = safeTrends.map((d: any) => ({
    date: format(new Date(d.date), 'MMM dd'),
    recorded: d.recorded,
    detected: d.detected,
    discrepancy: d.discrepancy,
  }));

  // Process compliance by category
  const safeByCategory = (infraCompliance as any)?.byCategory || {};
  const complianceByCategory = Object.entries(safeByCategory).map(([category, stats]: [string, any], i) => ({
    name: category,
    functional: stats?.functional ?? 0,
    nonFunctional: stats?.nonFunctional ?? 0,
    missing: stats?.missing ?? 0,
    total: stats?.total ?? 0,
    color: COLORS[i % COLORS.length],
  }));

  // Attendance status breakdown
  const safeBreakdown = (summary as any)?.attendance?.discrepancyBreakdown || {};
  const statusData = Object.entries(safeBreakdown).map(([status, count]: [string, any], i) => ({
    name: status.charAt(0) + status.slice(1).toLowerCase(),
    value: count,
    color: COLORS[i % COLORS.length],
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics & Reports</h1>
          <p className="text-muted-foreground">Insights and trends across all training centres</p>
        </div>
        <div className="flex gap-2">
          <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="180">Last 180 days</SelectItem>
              <SelectItem value="365">Last Year</SelectItem>
            </SelectContent>
          </Select>
          <Select value={centreId} onValueChange={setCentreId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Centres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Centres</SelectItem>
              {safeCentres?.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline"><Download className="h-4 w-4 mr-2" />Export Report</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Attendance Compliance</p>
                <p className="text-3xl font-bold">
                  {(s?.attendance?.totalRecords ?? 0) > 0
                    ? Math.round((((s.attendance.totalRecords) - Object.values((s.attendance.discrepancyBreakdown as Record<string, number>) || {}).reduce((a, b) => a + (b || 0), 0)) / s.attendance.totalRecords) * 100)
                    : 0}%
                </p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Infrastructure Compliance</p>
                <p className="text-3xl font-bold">{ic?.summary?.complianceRate ?? 0}%</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Discrepancies</p>
                <p className="text-3xl font-bold text-destructive">
                  {Object.entries((s?.attendance?.discrepancyBreakdown as Record<string, number>) || {})
                    .filter(([k]) => k === 'DISCREPANT')
                    .reduce((sum, [, v]) => sum + (v || 0), 0)}
                </p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Alerts</p>
                <p className="text-3xl font-bold">{s?.alerts?.open ?? 0}</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-yellow-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Attendance Trends */}
        <Card>
          <CardHeader>
            <CardTitle>Attendance Trends ({days} days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={attendanceData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRecorded" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorDetected" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: number) => [value, 'persons']}
                    labelFormatter={(date) => `Date: ${date}`}
                  />
                  <Area type="monotone" dataKey="recorded" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRecorded)" name="Recorded" />
                  <Area type="monotone" dataKey="detected" stroke="#22c55e" fillOpacity={1} fill="url(#colorDetected)" name="Detected" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Discrepancy Trends */}
        <Card>
          <CardHeader>
            <CardTitle>Discrepancy Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attendanceData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => [value, 'persons']} />
                  <Bar dataKey="discrepancy" fill="#ef4444" name="Discrepancy" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Attendance Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Attendance Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [value, 'records']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Infrastructure Compliance by Category */}
        <Card>
          <CardHeader>
            <CardTitle>Infrastructure Compliance by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={complianceByCategory} layout="vertical" margin={{ top: 10, right: 30, left: 80, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: number, name: string) => [value, name.charAt(0).toUpperCase() + name.slice(1)]}
                    labelFormatter={(name) => name}
                  />
                  <Bar dataKey="functional" fill="#22c55e" name="Functional" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="nonFunctional" fill="#ef4444" name="Non-Functional" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="missing" fill="#f59e0b" name="Missing" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Attendance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries((s?.attendance?.discrepancyBreakdown as Record<string, any>) || {}).map(([status, count]: [string, any]) => (
                <div key={status} className="flex justify-between">
                  <span className="capitalize">{status.toLowerCase()}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
              <div className="border-t pt-3 flex justify-between font-bold">
                <span>Total Records</span>
                <span>{s?.attendance?.totalRecords ?? 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Infrastructure Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between"><span>Functional</span><span className="font-medium text-green-600">{ic?.summary?.functional ?? 0}</span></div>
              <div className="flex justify-between"><span>Non-Functional</span><span className="font-medium text-red-600">{ic?.summary?.nonFunctional ?? 0}</span></div>
              <div className="flex justify-between"><span>Missing</span><span className="font-medium text-yellow-600">{ic?.summary?.missing ?? 0}</span></div>
              <div className="flex justify-between"><span>Unknown</span><span className="font-medium text-gray-600">{ic?.summary?.unknown ?? 0}</span></div>
              <div className="border-t pt-3 flex justify-between font-bold">
                <span>Compliance Rate</span>
                <span className="text-blue-600">{ic?.summary?.complianceRate ?? 0}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alert Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between"><span>Open</span><span className="font-medium text-red-600">{s?.alerts?.open ?? 0}</span></div>
              <div className="flex justify-between"><span>Critical</span><span className="font-medium text-red-600">{s?.alerts?.critical ?? 0}</span></div>
              <div className="flex justify-between"><span>Total (30d)</span><span className="font-medium">{s?.alerts?.total ?? 0}</span></div>
              <div className="border-t pt-3 flex justify-between font-bold">
                <span>Camera Uptime</span>
                <span className="text-green-600">{s?.overview?.cameraUptime ?? 0}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}