'use client';

import * as React from 'react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Filter, Bell, AlertTriangle, CheckCircle, XCircle, Clock, Loader2, MoreHorizontal, Monitor } from 'lucide-react';
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
import { alertsApi } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import type { Alert, PaginatedResponse } from '@/types';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const severityConfig: Record<string, { variant: 'default' | 'success' | 'destructive' | 'warning' | 'secondary' | 'info'; color: string }> = {
  CRITICAL: { variant: 'destructive', color: 'text-red-600 bg-red-50 border-red-200' },
  HIGH: { variant: 'destructive', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  MEDIUM: { variant: 'warning', color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  LOW: { variant: 'secondary', color: 'text-blue-600 bg-blue-50 border-blue-200' },
};

const statusConfig: Record<string, { variant: 'default' | 'success' | 'destructive' | 'warning' | 'secondary' | 'info'; icon: React.ComponentType<{ className?: string }> }> = {
  OPEN: { variant: 'destructive', icon: AlertTriangle },
  ACKNOWLEDGED: { variant: 'warning', icon: Clock },
  IN_PROGRESS: { variant: 'info', icon: Loader2 },
  RESOLVED: { variant: 'success', icon: CheckCircle },
  FALSE_POSITIVE: { variant: 'secondary', icon: XCircle },
  DISMISSED: { variant: 'secondary', icon: XCircle },
};

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  ATTENDANCE_DISCREPANCY: AlertTriangle,
  EQUIPMENT_MISSING: Bell,
  EQUIPMENT_NON_FUNCTIONAL: AlertTriangle,
  CAMERA_OFFLINE: Monitor,
  LOW_CONFIDENCE: Clock,
};


export function AlertsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['alerts', { page, search, type: typeFilter, severity: severityFilter, status: statusFilter }],
    queryFn: () => alertsApi.list({
      page,
      limit: 20,
      search,
      type: typeFilter as any,
      severity: severityFilter as any,
      status: statusFilter as any,
    }),
    refetchInterval: 30000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => alertsApi.acknowledge(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => alertsApi.resolve(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status: string } }) => alertsApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Alerts & Notifications</h1>
        <Card><CardContent className="p-6"><div className="animate-pulse space-y-4"><div className="h-12 bg-muted rounded"/></div></CardContent></Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Failed to load alerts</p>
      </div>
    );
  }

  const alerts: any[] = (data as any)?.data || [];
  const pagination = (data as any)?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Alerts & Notifications</h1>
            {!isAdmin && (
              <Badge variant="secondary" className="font-mono text-xs">
                {user?.centre?.code || 'Site Scope'}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {isAdmin
              ? 'Monitor and manage system alerts across all centres'
              : `Active AI detection alerts for ${user?.centre?.name || 'Assigned Training Centre'}`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search alerts..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Types</SelectItem>
                <SelectItem value="ATTENDANCE_DISCREPANCY">Attendance Discrepancy</SelectItem>
                <SelectItem value="EQUIPMENT_MISSING">Equipment Missing</SelectItem>
                <SelectItem value="EQUIPMENT_NON_FUNCTIONAL">Equipment Non-Functional</SelectItem>
                <SelectItem value="CAMERA_OFFLINE">Camera Offline</SelectItem>
                <SelectItem value="LOW_CONFIDENCE">Low Confidence</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="CRITICAL">Critical</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Statuses</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
                <SelectItem value="FALSE_POSITIVE">False Positive</SelectItem>
                <SelectItem value="DISMISSED">Dismissed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Alerts Table */}
      <Card>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Alert</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No alerts found
                  </TableCell>
                </TableRow>
              ) : (
                alerts.map((alert) => {
                  const severity = severityConfig[alert.severity] || severityConfig.MEDIUM;
                  const status = statusConfig[alert.status] || statusConfig.OPEN;
                  const TypeIcon = typeIcons[alert.type] || Bell;
                  const StatusIcon = status.icon;
                  
                  return (
                    <TableRow key={alert.id} className={alert.severity === 'CRITICAL' ? 'bg-red-50' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className={cn('h-8 w-8 rounded-full flex items-center justify-center', severity.color)}>
                            <TypeIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium">{alert.title}</p>
                            <p className="text-xs text-muted-foreground max-w-xs truncate">{alert.message}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{alert.centre?.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{alert.centre?.code}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={severity.variant} className={severity.color}>
                          {alert.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {alert.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(new Date(alert.createdAt), 'MMM dd, yyyy HH:mm')}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {alert.status === 'OPEN' && (
                              <>
                                <DropdownMenuItem onClick={() => acknowledgeMutation.mutate(alert.id)} disabled={acknowledgeMutation.isPending}>
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Acknowledge
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => updateMutation.mutate({ id: alert.id, data: { status: 'IN_PROGRESS' } })}>
                                  <Loader2 className="mr-2 h-4 w-4" />
                                  Mark In Progress
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            {alert.status === 'ACKNOWLEDGED' && (
                              <>
                                <DropdownMenuItem onClick={() => updateMutation.mutate({ id: alert.id, data: { status: 'IN_PROGRESS' } })}>
                                  <Loader2 className="mr-2 h-4 w-4" />
                                  Mark In Progress
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => resolveMutation.mutate(alert.id)} disabled={resolveMutation.isPending}>
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Resolve
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            {alert.status === 'IN_PROGRESS' && (
                              <>
                                <DropdownMenuItem onClick={() => resolveMutation.mutate(alert.id)} disabled={resolveMutation.isPending}>
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Resolve
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            {(alert.status === 'OPEN' || alert.status === 'ACKNOWLEDGED' || alert.status === 'IN_PROGRESS') && (
                              <>
                                <DropdownMenuItem onClick={() => updateMutation.mutate({ id: alert.id, data: { status: 'FALSE_POSITIVE' } })}>
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Mark False Positive
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => updateMutation.mutate({ id: alert.id, data: { status: 'DISMISSED' } })}>
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Dismiss
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
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