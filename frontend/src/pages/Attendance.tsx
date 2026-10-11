'use client';

import * as React from 'react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Download, Calendar, Clock, AlertTriangle, CheckCircle, Wrench, Users } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { attendanceApi, centresApi } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import { cn, formatPercent } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ClassSessionScheduleBanner, to12h } from '@/components/ClassSessionScheduleBanner';

const statusConfig: Record<string, { variant: 'default' | 'success' | 'destructive' | 'warning' | 'secondary' | 'info'; icon: React.ComponentType<{ className?: string }> }> = {
  VERIFIED: { variant: 'success', icon: CheckCircle },
  DISCREPANT: { variant: 'destructive', icon: AlertTriangle },
  PENDING: { variant: 'warning', icon: Clock },
  UNDER_REVIEW: { variant: 'info', icon: Clock },
};

const MAX_CHART_POINTS = 300;

function percentColor(p: number | null | undefined) {
  if (p == null) return 'text-muted-foreground';
  if (p >= 90) return 'text-green-600';
  if (p >= 70) return 'text-amber-600';
  return 'text-destructive';
}

function slotLabel(record: any) {
  const slot = record.classSlot;
  return slot ? `${to12h(slot.startTime)} – ${to12h(slot.endTime)}` : null;
}

function csvEscape(v: unknown) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { variant: 'secondary' as const, icon: Clock };
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {status.replace('_', ' ')}
    </Badge>
  );
}

function SessionDetailDialog({ recordId, onClose }: { recordId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data: record, isLoading } = useQuery<any>({
    queryKey: ['attendance-detail', recordId],
    queryFn: () => attendanceApi.get(recordId as string),
    enabled: !!recordId,
    refetchInterval: (query) => (query.state.data && !(query.state.data as any).finalizedAt ? 15_000 : false),
  });

  const review = useMutation({
    mutationFn: (status: string) => attendanceApi.update(recordId as string, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-detail', recordId] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });

  const chartData = React.useMemo(() => {
    const snaps: any[] = record?.snapshots || [];
    const stride = Math.max(1, Math.ceil(snaps.length / MAX_CHART_POINTS));
    return snaps
      .filter((_, i) => i % stride === 0)
      .map((s) => ({ time: format(new Date(s.timestamp), 'HH:mm:ss'), people: s.peopleCount }));
  }, [record]);

  const tools: any[] = record?.tools || [];
  const expected = record?.expectedCount || 0;

  return (
    <Dialog open={!!recordId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {record ? `${record.centre?.name} · ${record.session}` : 'Session details'}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !record ? (
          <div className="animate-pulse h-40 bg-muted rounded" />
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{format(new Date(record.date), 'EEE, MMM dd yyyy')}</span>
              {slotLabel(record) && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Class window {slotLabel(record)}</span>}
              <StatusBadge status={record.status} />
              {!record.finalizedAt && record.sampleCount > 0 && <Badge variant="outline" className="gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />In progress</Badge>}
            </div>

            {record.sampleCount === 0 ? (
              <p className="text-sm text-muted-foreground border rounded-md p-4">
                The camera did not report during this class window, so no headcount was captured.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: 'Expected', value: expected },
                    { label: record.isFinal ? 'Final count' : 'Count so far (avg)', value: record.presentCount ?? '-' },
                    { label: 'Peak', value: record.peakCount ?? '-' },
                    { label: 'Lowest', value: record.minCount ?? '-' },
                    { label: 'Attendance', value: record.attendancePercent != null ? `${record.attendancePercent}%` : '-', color: percentColor(record.attendancePercent) },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                      <p className={cn('text-xl font-bold font-mono', (s as any).color)}>{s.value}</p>
                    </div>
                  ))}
                </div>

                <div className="text-xs text-muted-foreground flex flex-wrap gap-x-6 gap-y-1">
                  <span>First detection: {record.firstSeenAt ? format(new Date(record.firstSeenAt), 'HH:mm:ss') : '-'}</span>
                  <span>Last detection: {record.lastSeenAt ? format(new Date(record.lastSeenAt), 'HH:mm:ss') : '-'}</span>
                  <span>Samples: {record.sampleCount}</span>
                  {record.isFinal && <span>Final count = headcount at the end of the class (median of the last 5 readings)</span>}
                  <span>Avg confidence: {record.confidence != null ? formatPercent(record.confidence * 100, 0) : '-'}</span>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Users className="h-4 w-4" />Headcount during class</h4>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={40} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} domain={[0, (max: number) => Math.max(max, expected)]} />
                        <Tooltip />
                        {expected > 0 && <ReferenceLine y={expected} stroke="#888" strokeDasharray="5 5" label={{ value: `Expected ${expected}`, fontSize: 11, position: 'insideTopRight' }} />}
                        <Line type="monotone" dataKey="people" name="People detected" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}

            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Wrench className="h-4 w-4" />Tools &amp; equipment</h4>
              {tools.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tools are registered for this centre.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tool</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Max detected</TableHead>
                      <TableHead className="text-right">Last seen</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tools.map((t) => {
                      const ok = t.maxDetected >= t.expected;
                      return (
                        <TableRow key={t.itemId}>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell className="text-right font-mono">{t.expected}</TableCell>
                          <TableCell className="text-right font-mono">{t.maxDetected}</TableCell>
                          <TableCell className="text-right font-mono">{t.lastDetected}</TableCell>
                          <TableCell>
                            <Badge variant={ok ? 'success' : 'destructive'}>{ok ? 'All present' : `${t.expected - t.maxDetected} missing`}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>

            {user && record.status !== 'VERIFIED' && (
              <div className="flex justify-end gap-2 border-t pt-4">
                {record.status !== 'UNDER_REVIEW' && (
                  <Button variant="outline" disabled={review.isPending} onClick={() => review.mutate('UNDER_REVIEW')}>Mark under review</Button>
                )}
                <Button disabled={review.isPending} onClick={() => review.mutate('VERIFIED')}>Verify session</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AttendancePage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sessionFilter, setSessionFilter] = useState<string>('');
  const [slotFilter, setSlotFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({});
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('record'));
  const [exporting, setExporting] = useState(false);

  const filters = {
    search,
    status: statusFilter,
    session: sessionFilter,
    classSlotId: slotFilter,
    startDate: dateRange.from,
    endDate: dateRange.to,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['attendance', { page, ...filters, centreId: user?.centreId }],
    queryFn: () => attendanceApi.list({ page, limit: 20, ...filters }),
    refetchInterval: 30_000,
  });

  // Distinct slot names across the centres in scope, used for the session filter
  const { data: centresData } = useQuery({
    queryKey: ['centres', 'slot-names', user?.centreId],
    queryFn: () => centresApi.list({ limit: 100 }),
  });
  const slotNames: string[] = Array.from(
    new Set(((centresData as any)?.data || []).flatMap((c: any) => (c.classSlots || []).map((s: any) => s.name)))
  ) as string[];

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: any[] = [];
      for (let p = 1; p <= 50; p++) {
        const res: any = await attendanceApi.list({ page: p, limit: 100, ...filters });
        rows.push(...(res.data || []));
        if (p >= (res.pagination?.totalPages || 1)) break;
      }
      const header = ['Centre', 'Centre code', 'Date', 'Class slot', 'Slot start', 'Slot end', 'Expected', 'Present', 'Count type', 'Peak', 'Lowest', 'Attendance %', 'Tools OK', 'Tools total', 'Status', 'Samples', 'Confidence %'];
      const lines = rows.map((r) => [
        r.centre?.name, r.centre?.code, format(new Date(r.date), 'yyyy-MM-dd'), r.session,
        r.classSlot?.startTime, r.classSlot?.endTime, r.expectedCount, r.presentCount, r.isFinal ? 'final' : 'in progress', r.peakCount, r.minCount,
        r.attendancePercent, r.toolsOk, r.toolsTotal, r.status, r.sampleCount,
        r.confidence != null ? Math.round(r.confidence * 100) : '',
      ].map(csvEscape).join(','));
      const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Attendance Records</h1>
          <Button variant="outline" disabled><Download className="h-4 w-4 mr-2" />Export</Button>
        </div>
        <Card><CardContent className="p-6"><div className="animate-pulse space-y-4"><div className="h-12 bg-muted rounded"/></div></CardContent></Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Failed to load attendance records</p>
      </div>
    );
  }

  const records: any[] = (data as any)?.data || [];
  const pagination = (data as any)?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Attendance Records</h1>
            {!isAdmin && (
              <Badge variant="secondary" className="font-mono text-xs">
                {user?.centre?.code || 'Site Scope'}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {isAdmin
              ? 'Actual camera-verified attendance and tools for every class session'
              : `Class-by-class attendance for ${user?.centre?.name || 'your assigned training centre'}`}
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={exporting}>
          <Download className="h-4 w-4 mr-2" />{exporting ? 'Exporting...' : 'Export CSV'}
        </Button>
      </div>

      {/* Class timings of the signed-in centre; clicking a slot filters by it */}
      {!isAdmin && user?.centreId && (
        <ClassSessionScheduleBanner
          centreId={user.centreId}
          centreName={user?.centre?.name}
          selectedSlotId={slotFilter}
          onSelectSlot={(id) => { setSlotFilter(id); setPage(1); }}
        />
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by centre..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Statuses</SelectItem>
                <SelectItem value="VERIFIED">Verified</SelectItem>
                <SelectItem value="DISCREPANT">Discrepant</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sessionFilter} onValueChange={(v) => { setSessionFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Class Slots" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Class Slots</SelectItem>
                {slotNames.map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                type="date"
                value={dateRange.from || ''}
                onChange={(e) => { setDateRange(prev => ({ ...prev, from: e.target.value || undefined })); setPage(1); }}
                className="w-[140px]"
              />
              <Input
                type="date"
                value={dateRange.to || ''}
                onChange={(e) => { setDateRange(prev => ({ ...prev, to: e.target.value || undefined })); setPage(1); }}
                className="w-[140px]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Table */}
      <Card>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Centre</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Class slot</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Count (peak / low)</TableHead>
                <TableHead className="text-right">Attendance</TableHead>
                <TableHead>Tools</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    No attendance records found
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => {
                  const noDetection = record.sampleCount === 0;
                  const toolsBad = record.toolsTotal > 0 && record.toolsOk < record.toolsTotal;
                  return (
                    <TableRow
                      key={record.id}
                      onClick={() => setSelectedId(record.id)}
                      className={cn('cursor-pointer hover:bg-accent/50', record.status === 'DISCREPANT' && 'bg-destructive/5')}
                    >
                      <TableCell>
                        <p className="font-medium">{record.centre?.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{record.centre?.code}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span>{format(new Date(record.date), 'MMM dd, yyyy')}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{record.session}</p>
                        {slotLabel(record) && <p className="text-xs text-muted-foreground font-mono">{slotLabel(record)}</p>}
                      </TableCell>
                      <TableCell className="text-right font-mono">{record.expectedCount || record.recordedCount || '-'}</TableCell>
                      <TableCell className="text-right font-mono">
                        {noDetection ? (
                          <span className="text-muted-foreground">No detection</span>
                        ) : (
                          <>
                            <span className="font-semibold">{record.presentCount}</span>
                            <Badge variant={record.isFinal ? 'success' : 'outline'} className="ml-1.5 text-[10px] px-1.5 py-0">{record.isFinal ? 'Final' : 'Live'}</Badge>
                            <span className="text-muted-foreground text-xs"> / {record.peakCount} / {record.minCount}</span>
                          </>
                        )}
                      </TableCell>
                      <TableCell className={cn('text-right font-mono font-semibold', percentColor(record.attendancePercent))}>
                        {record.attendancePercent != null ? `${record.attendancePercent}%` : '-'}
                      </TableCell>
                      <TableCell>
                        {record.toolsTotal > 0 ? (
                          <Badge variant={toolsBad ? 'destructive' : 'success'} className="font-mono">
                            {record.toolsOk}/{record.toolsTotal} ok
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell><StatusBadge status={record.status} /></TableCell>
                      <TableCell>
                        {record.confidence != null && !noDetection ? (
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-16 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(record.confidence * 100, 100)}%` }} />
                            </div>
                            <span className="text-sm text-muted-foreground">{formatPercent(record.confidence * 100, 0)}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * pagination.limit + 1} to {Math.min(page * pagination.limit, pagination.total)} of {pagination.total}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <SessionDetailDialog
        recordId={selectedId}
        onClose={() => {
          setSelectedId(null);
          if (searchParams.has('record')) {
            const next = new URLSearchParams(searchParams);
            next.delete('record');
            setSearchParams(next, { replace: true });
          }
        }}
      />
    </div>
  );
}
