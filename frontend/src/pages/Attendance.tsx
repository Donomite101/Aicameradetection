'use client';

import * as React from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Filter, Download, Calendar, Clock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { attendanceApi } from '@/services/api';
import type { AttendanceRecord, PaginatedResponse } from '@/types';
import { cn, formatPercent } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';

const statusConfig: Record<string, { variant: 'default' | 'success' | 'destructive' | 'warning' | 'secondary' | 'info'; icon: React.ComponentType<{ className?: string }> }> = {
  VERIFIED: { variant: 'success', icon: CheckCircle },
  DISCREPANT: { variant: 'destructive', icon: AlertTriangle },
  PENDING: { variant: 'warning', icon: Clock },
  UNDER_REVIEW: { variant: 'info', icon: Clock },
};

export function AttendancePage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sessionFilter, setSessionFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['attendance', { page, search, status: statusFilter, session: sessionFilter, startDate: dateRange.from?.toISOString().split('T')[0], endDate: dateRange.to?.toISOString().split('T')[0] }],
    queryFn: () => attendanceApi.list({
      page,
      limit: 20,
      search,
      status: statusFilter as any,
      session: sessionFilter as any,
      startDate: dateRange.from?.toISOString().split('T')[0],
      endDate: dateRange.to?.toISOString().split('T')[0],
    }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Attendance Records</h1>
          <Button variant="outline"><Download className="h-4 w-4 mr-2" />Export</Button>
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
          <h1 className="text-2xl font-bold">Attendance Records</h1>
          <p className="text-muted-foreground">Monitor and verify attendance across all centres</p>
        </div>
        <Button variant="outline"><Download className="h-4 w-4 mr-2" />Export</Button>
      </div>

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
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Sessions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Sessions</SelectItem>
                <SelectItem value="MORNING">Morning</SelectItem>
                <SelectItem value="AFTERNOON">Afternoon</SelectItem>
                <SelectItem value="EVENING">Evening</SelectItem>
                <SelectItem value="FULL_DAY">Full Day</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                type="date"
                value={dateRange.from?.toISOString().split('T')[0] || ''}
                onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value ? new Date(e.target.value) : undefined }))}
                placeholder="From"
                className="w-[140px]"
              />
              <Input
                type="date"
                value={dateRange.to?.toISOString().split('T')[0] || ''}
                onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value ? new Date(e.target.value) : undefined }))}
                placeholder="To"
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
                <TableHead>Session</TableHead>
                <TableHead className="text-right">Recorded</TableHead>
                <TableHead className="text-right">Detected</TableHead>
                <TableHead className="text-right">Discrepancy</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    No attendance records found
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => {
                  const config = statusConfig[record.status] || { variant: 'secondary', icon: Clock };
                  const Icon = config.icon;
                  const discrepancy = record.discrepancy ?? 0;
                  const hasDiscrepancy = discrepancy !== 0;
                  
                  return (
                    <TableRow key={record.id} className={hasDiscrepancy ? 'bg-destructive/5' : ''}>
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
                        <span className="capitalize text-sm">{record.session.toLowerCase().replace('_', ' ')}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono">{record.recordedCount}</TableCell>
                      <TableCell className="text-right font-mono">
                        {record.detectedCount !== undefined ? record.detectedCount : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {hasDiscrepancy ? (
                          <span className={cn('font-medium', discrepancy > 0 ? 'text-destructive' : 'text-blue-600')}>
                            {discrepancy > 0 ? '+' : ''}{discrepancy}
                          </span>
                        ) : (
                          <span className="text-green-600 font-medium">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={config.variant} className="gap-1">
                          <Icon className="h-3 w-3" />
                          {record.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {record.confidence !== undefined ? (
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all"
                                style={{ width: `${Math.min(record.confidence * 100, 100)}%` }}
                              />
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
    </div>
  );
}