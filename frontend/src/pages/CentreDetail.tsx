'use client';

import * as React from 'react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  UserRound,
  GraduationCap,
  Users,
  Clock,
  Wrench,
  AlertTriangle,
  Camera,
  CalendarCheck2,
  Video,
  Activity,
  TrendingUp,
  Plus,
  Trash2,
  Laptop,
  Smartphone,
  Cctv,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { format, formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { centresApi } from '@/services/api';
import { ws } from '@/services/websocket';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { to12h } from '@/components/ClassSessionScheduleBanner';
import { TodaySessionsCard } from '@/pages/Dashboard';

const statusVariant: Record<string, any> = {
  ACTIVE: 'success',
  INACTIVE: 'secondary',
  SUSPENDED: 'destructive',
};

const sessionStatusVariant: Record<string, any> = {
  VERIFIED: 'success',
  DISCREPANT: 'destructive',
  PENDING: 'warning',
  UNDER_REVIEW: 'info',
};

const severityClass: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-600',
  HIGH: 'bg-orange-100 text-orange-600',
  MEDIUM: 'bg-yellow-100 text-yellow-600',
  LOW: 'bg-blue-100 text-blue-600',
};

const percentTone = (p: number | null | undefined) =>
  p == null ? 'text-muted-foreground' : p >= 90 ? 'text-green-600' : p >= 70 ? 'text-amber-600' : 'text-red-600';

const percentBar = (p: number | null | undefined) =>
  p == null ? 'bg-muted' : p >= 90 ? 'bg-green-500' : p >= 70 ? 'bg-amber-500' : 'bg-red-500';

const kpiAccents = ['border-emerald-500', 'border-blue-500', 'border-violet-500', 'border-red-400', 'border-orange-400', 'border-indigo-500'];

function Kpi({
  label,
  value,
  sub,
  tone,
  index = 0,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: string;
  index?: number;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col border-l-[3px] pl-4', kpiAccents[index % kpiAccents.length])}>
      <p className="text-sm font-medium leading-snug">{label}</p>
      <p className={cn('mt-auto pt-3 font-bold tracking-tight', typeof value === 'string' || typeof value === 'number' ? 'text-3xl' : '', tone)}>{value}</p>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ProgressCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="h-2 flex-1 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', percentBar(value))} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className={cn('text-xs font-mono font-semibold w-9 text-right', percentTone(value))}>{value}%</span>
    </div>
  );
}

const cameraTypeInfo: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  WEBCAM: { label: 'Laptop webcam', icon: Laptop },
  PHONE: { label: 'Phone app', icon: Smartphone },
  IP: { label: 'IP camera', icon: Cctv },
};

const REPORTING_WINDOW_MS = 5 * 60 * 1000;

function CamerasCard({ centreId, cameras, isAdmin }: { centreId: string; cameras: any[]; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'IP', rtspUrl: '' });
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['centre-analytics', centreId] });

  const addMutation = useMutation({
    mutationFn: () =>
      centresApi.cameras.add(centreId, {
        name: form.name.trim(),
        type: form.type,
        ...(form.type === 'IP' ? { rtspUrl: form.rtspUrl.trim() } : {}),
      }),
    onSuccess: () => {
      refresh();
      setAdding(false);
      setForm({ name: '', type: 'IP', rtspUrl: '' });
      setFormError(null);
    },
    onError: (err: any) => setFormError(err?.response?.data?.error || err?.response?.data?.message || 'Could not add camera'),
  });

  const removeMutation = useMutation({
    mutationFn: (cameraId: string) => centresApi.cameras.delete(centreId, cameraId),
    onSuccess: refresh,
  });

  const submit = () => {
    if (!form.name.trim()) return setFormError('Give the camera a name');
    if (form.type === 'IP' && !form.rtspUrl.trim()) return setFormError('An IP camera needs its RTSP URL');
    setFormError(null);
    addMutation.mutate();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><Camera className="h-4 w-4 text-primary" />Cameras</CardTitle>
        {isAdmin && !adding && (
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" />Add</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {cameras.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground">
            No cameras yet. A laptop webcam or phone appears here automatically the first time it reports for this centre.
          </p>
        )}

        {cameras.map((c) => {
          const info = cameraTypeInfo[c.type] || cameraTypeInfo.IP;
          const Icon = info.icon;
          const seen = c.lastSeenAt ? new Date(c.lastSeenAt) : null;
          const reporting = !!seen && Date.now() - seen.getTime() < REPORTING_WINDOW_MS;
          return (
            <div key={c.id} className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {info.label} · {seen ? `last seen ${formatDistanceToNow(seen, { addSuffix: true })}` : 'never connected'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant={!c.isActive ? 'secondary' : reporting ? 'success' : 'outline'}>
                  {!c.isActive ? 'Disabled' : reporting ? 'Receiving' : 'Idle'}
                </Badge>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Remove camera"
                    onClick={() => confirm(`Remove ${c.name}?`) && removeMutation.mutate(c.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {adding && (
          <div className="space-y-2 border rounded-md p-3">
            <Input placeholder="Camera name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="IP">IP camera (RTSP)</option>
              <option value="WEBCAM">Laptop webcam</option>
              <option value="PHONE">Phone app</option>
            </select>
            {form.type === 'IP' && (
              <Input placeholder="rtsp://user:pass@host:554/stream" value={form.rtspUrl} onChange={(e) => setForm({ ...form, rtspUrl: e.target.value })} />
            )}
            {formError && <p className="text-xs text-destructive">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setFormError(null); }}>Cancel</Button>
              <Button size="sm" onClick={submit} disabled={addMutation.isPending}>{addMutation.isPending ? 'Adding...' : 'Add camera'}</Button>
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground border-t pt-2">
          To connect a phone: sign in to the mobile app with this centre&apos;s officer account. It registers itself here.
        </p>
      </CardContent>
    </Card>
  );
}

export function CentreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  const [days, setDays] = useState(30);

  const { data, isLoading, error, refetch } = useQuery<any>({
    queryKey: ['centre-analytics', id, days],
    queryFn: () => centresApi.analytics(id as string, { days }),
    enabled: !!id,
    refetchInterval: 30_000,
  });

  // Refresh as soon as the camera reports for this centre
  React.useEffect(() => {
    ws.connect();
    const unsub = ws.on('attendance:update', (d: any) => {
      if (!d?.centreId || d.centreId === id) refetch();
    });
    return () => unsub();
  }, [id, refetch]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-muted rounded animate-pulse" />
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6 animate-pulse"><div className="h-4 bg-muted rounded w-3/4 mb-2" /><div className="h-8 bg-muted rounded w-1/2" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data?.centre) {
    const status = (error as any)?.response?.status;
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-destructive">
          {status === 403 ? 'You can only view your assigned training centre.' : status === 404 ? 'Centre not found.' : 'Failed to load centre analysis.'}
        </p>
        <Button variant="outline" onClick={() => navigate(isAdmin ? '/centres' : '/')}>Back</Button>
      </div>
    );
  }

  const { centre, kpis, trend, bySlot, tools, classSlots, recentSessions, recentAlerts, cameras, trainees, todaySessions } = data;
  const location = [centre.area, centre.city, centre.state].filter(Boolean).join(', ');
  const trendData = (trend as any[]).map((d) => ({ ...d, label: format(new Date(`${d.date}T00:00:00`), 'MMM dd') }));
  const noSessions = kpis.sessionsHeld === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        {isAdmin && (
          <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground">
            <Link to="/centres"><ArrowLeft className="h-4 w-4" />All centres</Link>
          </Button>
        )}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{centre.name}</h1>
              <Badge variant={statusVariant[centre.status] || 'secondary'}>{centre.status.replace('_', ' ')}</Badge>
              <Badge variant="outline" className="font-mono text-xs">{centre.code}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{location}{centre.pincode ? ` - ${centre.pincode}` : ''}</span>
              {centre.scheme && (
                <span className="flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5" />{centre.scheme.name} ({centre.scheme.code})</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
              {centre.contactPerson && <span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{centre.contactPerson}</span>}
              {centre.contactEmail && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{centre.contactEmail}</span>}
              {centre.contactPhone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{centre.contactPhone}</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v, 10))}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to={`/attendance?search=${encodeURIComponent(centre.code)}`}><CalendarCheck2 className="h-4 w-4" />Attendance records</Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/live"><Video className="h-4 w-4" />Live camera</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <Card>
        <CardContent className="p-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-3 2xl:grid-cols-6">
        <Kpi
          index={0}          label="Avg attendance"
          value={kpis.avgAttendancePercent != null ? `${kpis.avgAttendancePercent}%` : '-'}
          sub={kpis.avgPeakPercent != null ? `Peak ${kpis.avgPeakPercent}%` : 'No sessions yet'}
          icon={TrendingUp}
          tone={percentTone(kpis.avgAttendancePercent)}
        />
        <Kpi
          index={1}          label="Sessions held"
          value={kpis.sessionsHeld}
          sub={kpis.sessionsMissed > 0 ? `${kpis.sessionsMissed} with no detection` : `${kpis.discrepantSessions} flagged`}
          icon={Clock}
        />
        <Kpi
          index={2}          label="Tool compliance"
          value={kpis.toolCompliancePercent != null ? `${kpis.toolCompliancePercent}%` : '-'}
          sub={`${tools.length} tools tracked`}
          icon={Wrench}
          tone={percentTone(kpis.toolCompliancePercent)}
        />
        <Kpi
          index={3}          label="Open alerts"
          value={kpis.openAlerts}
          sub={`${kpis.totalAlerts} total`}
          icon={AlertTriangle}
          tone={kpis.openAlerts > 0 ? 'text-red-600' : undefined}
        />
        <Kpi
          index={4}          label="Trainees"
          value={trainees.declaredTotal}
          sub={`${trainees.enrolled} enrolled · cap ${trainees.capacity}`}
          icon={Users}
        />
        <Kpi
          index={5}          label="Last AI detection"
          value={<span className="text-base">{kpis.lastDetectionAt ? formatDistanceToNow(new Date(kpis.lastDetectionAt), { addSuffix: true }) : 'Never'}</span>}
          sub={kpis.lastDetectionAt ? format(new Date(kpis.lastDetectionAt), 'MMM dd, HH:mm') : 'Camera has not reported'}
          icon={Activity}
        />
      </div>
        </CardContent>
      </Card>

      <TodaySessionsCard sessions={todaySessions} showCentre={false} />

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Headcount per day</CardTitle></CardHeader>
          <CardContent>
            {trendData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-16">No camera-verified sessions in this period.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="expected" name="Expected" stroke="#888" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="present" name="Present (avg)" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="peak" name="Peak" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">Daily totals across all class slots held that day.</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Attendance by class slot</CardTitle></CardHeader>
          <CardContent>
            {bySlot.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-16">No sessions yet.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bySlot} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => [`${v}%`, 'Avg attendance']} />
                    <Bar dataKey="avgAttendancePercent" radius={[4, 4, 0, 0]}>
                      {bySlot.map((s: any) => (
                        <Cell key={s.name} fill={s.avgAttendancePercent >= 90 ? '#22c55e' : s.avgAttendancePercent >= 70 ? '#f59e0b' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-slot table + tools */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" />Class slots</CardTitle></CardHeader>
          <CardContent>
            {classSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No class timings configured. Edit the centre to add them.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Slot</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                    <TableHead className="text-right">Avg count</TableHead>
                    <TableHead>Attendance</TableHead>
                    <TableHead>Tools</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classSlots.map((slot: any) => {
                    const stats = bySlot.find((s: any) => s.name === slot.name);
                    return (
                      <TableRow key={slot.id}>
                        <TableCell>
                          <p className="font-medium text-sm">{slot.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{to12h(slot.startTime)} – {to12h(slot.endTime)}</p>
                        </TableCell>
                        <TableCell className="text-right font-mono">{stats?.sessions ?? 0}</TableCell>
                        <TableCell className="text-right font-mono">
                          {stats ? <>{stats.avgPresent}<span className="text-muted-foreground text-xs"> / {stats.avgExpected}</span></> : '-'}
                        </TableCell>
                        <TableCell><ProgressCell value={stats?.avgAttendancePercent} /></TableCell>
                        <TableCell><ProgressCell value={stats?.toolsOkPercent} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4 text-primary" />Tool compliance</CardTitle></CardHeader>
          <CardContent>
            {tools.length === 0 ? (
              <p className="text-sm text-muted-foreground">No camera-tracked tools. Edit the centre to add tools.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tool</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Avg seen</TableHead>
                    <TableHead>Sessions fully present</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tools.map((t: any) => (
                    <TableRow key={t.itemId}>
                      <TableCell>
                        <p className="font-medium text-sm">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.detectClass}</p>
                      </TableCell>
                      <TableCell className="text-right font-mono">{t.expected}</TableCell>
                      <TableCell className="text-right font-mono">{t.avgMaxDetected ?? '-'}</TableCell>
                      <TableCell>
                        <ProgressCell value={t.compliancePercent} />
                        <p className="text-[10px] text-muted-foreground mt-0.5">{t.fullSessions}/{t.sessions} sessions</p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent sessions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent sessions</CardTitle>
          <Button asChild variant="ghost" size="sm"><Link to={`/attendance?search=${encodeURIComponent(centre.code)}`}>View all</Link></Button>
        </CardHeader>
        <CardContent>
          {recentSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {noSessions ? 'No sessions recorded yet. Attendance appears here once the camera runs during a class slot.' : 'No recent sessions.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Class slot</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Count (peak / low)</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead>Tools</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSessions.map((r: any) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-accent/50" onClick={() => navigate(`/attendance?record=${r.id}`)}>
                    <TableCell>{format(new Date(r.date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{r.session}</p>
                      {r.classSlot && <p className="text-xs text-muted-foreground font-mono">{to12h(r.classSlot.startTime)} – {to12h(r.classSlot.endTime)}</p>}
                    </TableCell>
                    <TableCell className="text-right font-mono">{r.expectedCount || '-'}</TableCell>
                    <TableCell className="text-right font-mono">
                      {r.sampleCount === 0 ? (
                        <span className="text-muted-foreground">No detection</span>
                      ) : (
                        <><span className="font-semibold">{r.presentCount}</span><Badge variant={r.isFinal ? 'success' : 'outline'} className="ml-1.5 text-[10px] px-1.5 py-0">{r.isFinal ? 'Final' : 'Live'}</Badge><span className="text-muted-foreground text-xs"> / {r.peakCount} / {r.minCount}</span></>
                      )}
                    </TableCell>
                    <TableCell><ProgressCell value={r.attendancePercent} /></TableCell>
                    <TableCell>
                      {r.toolsTotal > 0 ? (
                        <Badge variant={r.toolsOk < r.toolsTotal ? 'destructive' : 'success'} className="font-mono">{r.toolsOk}/{r.toolsTotal}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell><Badge variant={sessionStatusVariant[r.status] || 'secondary'}>{r.status.replace('_', ' ')}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Alerts */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" />Recent alerts</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link to="/alerts">All alerts</Link></Button>
          </CardHeader>
          <CardContent>
            {recentAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No alerts for this centre.</p>
            ) : (
              <div className="space-y-2">
                {recentAlerts.map((a: any) => (
                  <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors">
                    <div className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0', severityClass[a.severity] || severityClass.LOW)}>
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</p>
                    </div>
                    <Badge variant={a.status === 'OPEN' ? 'destructive' : 'secondary'} className="shrink-0">{a.status.replace('_', ' ')}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Trainees */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><GraduationCap className="h-4 w-4 text-primary" />Trainees</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Declared total</span><span className="font-mono font-semibold">{trainees.declaredTotal}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Enrolled records</span><span className="font-mono font-semibold">{trainees.enrolled}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Sanctioned capacity</span><span className="font-mono font-semibold">{trainees.capacity}</span></div>
              {Object.keys(trainees.byStatus).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {Object.entries(trainees.byStatus).map(([status, count]) => (
                    <Badge key={status} variant="outline" className="text-xs">{status.toLowerCase()}: {count as number}</Badge>
                  ))}
                </div>
              )}
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Officer-marked attendance ({days}d)</p>
                {trainees.manualMarks.presentRate == null ? (
                  <p className="text-xs text-muted-foreground">Nothing marked yet.</p>
                ) : (
                  <>
                    <ProgressCell value={trainees.manualMarks.presentRate} />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {trainees.manualMarks.present} present · {trainees.manualMarks.absent} absent · {trainees.manualMarks.leave} leave
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Cameras */}
          <CamerasCard centreId={centre.id} cameras={cameras} isAdmin={isAdmin} />
        </div>
      </div>
    </div>
  );
}
