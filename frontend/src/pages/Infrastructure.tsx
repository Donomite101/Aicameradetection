'use client';

import * as React from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Filter, Package, HardHat, Shield, Monitor, Wrench, AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
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
import { infrastructureApi } from '@/services/api';
import type { InfrastructureCheck, PaginatedResponse } from '@/types';
import { cn, formatPercent } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const operabilityConfig: Record<string, { variant: 'default' | 'success' | 'destructive' | 'warning' | 'secondary' | 'info'; icon: React.ComponentType<{ className?: string }> }> = {
  FUNCTIONAL: { variant: 'success', icon: CheckCircle },
  NON_FUNCTIONAL: { variant: 'destructive', icon: AlertTriangle },
  UNKNOWN: { variant: 'secondary', icon: Monitor },
  MAINTENANCE: { variant: 'warning', icon: Wrench },
};

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  MACHINERY: HardHat,
  FURNITURE: Package,
  SAFETY: Shield,
  TOOLS: Wrench,
  COMPUTERS: Monitor,
  OTHER: Package,
};

export function InfrastructurePage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [detectedFilter, setDetectedFilter] = useState<string>('');
  const [operabilityFilter, setOperabilityFilter] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'checks' | 'compliance'>('checks');

  const { data: checksData, isLoading: checksLoading } = useQuery({
    queryKey: ['infrastructure', 'checks', { page, search, detected: detectedFilter, operability: operabilityFilter }],
    queryFn: () => infrastructureApi.checks({
      page,
      limit: 20,
      search,
      detected: detectedFilter === '' ? undefined : detectedFilter === 'true',
      operability: operabilityFilter as any,
    }),
  });

  const { data: complianceData, isLoading: complianceLoading } = useQuery({
    queryKey: ['infrastructure', 'compliance'],
    queryFn: () => infrastructureApi.compliance(''),
  });

  if (checksLoading && activeTab === 'checks') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Infrastructure Compliance</h1>
          <Button variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
        </div>
        <Card><CardContent className="p-6"><div className="animate-pulse space-y-4"><div className="h-12 bg-muted rounded"/></div></CardContent></Card>
      </div>
    );
  }

  const checks = checksData?.data || [];
  const pagination = checksData?.pagination;
  const compliance = complianceData;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Infrastructure Compliance</h1>
          <p className="text-muted-foreground">Monitor equipment and facility compliance across centres</p>
        </div>
        <Button variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
      </div>

      {/* Compliance Summary */}
      {compliance?.summary && (
        <Card>
          <CardHeader>
            <CardTitle>Overall Compliance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-5">
              <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                <p className="text-3xl font-bold text-green-600">{compliance.summary.functional}</p>
                <p className="text-sm text-green-700">Functional</p>
              </div>
              <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                <p className="text-3xl font-bold text-red-600">{compliance.summary.nonFunctional}</p>
                <p className="text-sm text-red-700">Non-Functional</p>
              </div>
              <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200">
                <p className="text-3xl font-bold text-yellow-600">{compliance.summary.missing}</p>
                <p className="text-sm text-yellow-700">Missing</p>
              </div>
              <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                <p className="text-3xl font-bold text-gray-600">{compliance.summary.unknown}</p>
                <p className="text-sm text-gray-700">Unknown</p>
              </div>
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-3xl font-bold text-blue-600">{compliance.summary.complianceRate}%</p>
                <p className="text-sm text-blue-700">Compliance Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="checks">Recent Checks</TabsTrigger>
          <TabsTrigger value="compliance">Compliance by Category</TabsTrigger>
        </TabsList>

        {/* Checks Tab */}
        <TabsContent value="checks">
          {/* Filters */}
          <Card className="mt-4">
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search items..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="pl-10"
                  />
                </div>
                <Select value={detectedFilter} onValueChange={(v) => { setDetectedFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Detection Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    <SelectItem value="true">Detected</SelectItem>
                    <SelectItem value="false">Not Detected</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={operabilityFilter} onValueChange={(v) => { setOperabilityFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Operability" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    <SelectItem value="FUNCTIONAL">Functional</SelectItem>
                    <SelectItem value="NON_FUNCTIONAL">Non-Functional</SelectItem>
                    <SelectItem value="UNKNOWN">Unknown</SelectItem>
                    <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Checks Table */}
          <Card>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Centre</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead>Operability</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        No infrastructure checks found
                      </TableCell>
                    </TableRow>
                  ) : (
                    checks.map((check) => {
                      const config = operabilityConfig[check.operability] || { variant: 'secondary', icon: Monitor };
                      const Icon = config.icon;
                      const CategoryIcon = categoryIcons[check.item?.category || 'OTHER'] || Package;
                      
                      return (
                        <TableRow key={check.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{check.item?.name || 'Unknown'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{check.centre?.name || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground">{check.centre?.code}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{check.item?.category || 'OTHER'}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={check.detected ? 'success' : 'destructive'} className="gap-1">
                              {check.detected ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                              {check.detected ? 'Yes' : 'No'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={config.variant} className="gap-1">
                              <Icon className="h-3 w-3" />
                              {check.operability.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-20 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary transition-all"
                                  style={{ width: `${Math.min(check.confidence * 100, 100)}%` }}
                                />
                              </div>
                              <span className="text-sm text-muted-foreground">{formatPercent(check.confidence * 100, 0)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {new Date(check.timestamp).toLocaleString()}
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
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance">
          {compliance?.byCategory && (
            <Card>
              <CardHeader>
                <CardTitle>Compliance by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(compliance.byCategory).map(([category, stats]) => {
                    const CategoryIcon = categoryIcons[category] || Package;
                    const rate = stats.total > 0 ? Math.round((stats.functional / stats.total) * 100) : 0;
                    return (
                      <div key={category} className="p-4 rounded-lg border bg-muted/30">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <CategoryIcon className="h-5 w-5 text-muted-foreground" />
                            <span className="font-medium capitalize">{category.toLowerCase()}</span>
                          </div>
                          <Badge variant={rate >= 80 ? 'success' : rate >= 50 ? 'warning' : 'destructive'}>
                            {rate}% compliant
                          </Badge>
                        </div>
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div className="text-center p-2 rounded bg-green-50">
                            <p className="font-bold text-green-600">{stats.functional}</p>
                            <p className="text-xs text-green-700">Functional</p>
                          </div>
                          <div className="text-center p-2 rounded bg-red-50">
                            <p className="font-bold text-red-600">{stats.nonFunctional}</p>
                            <p className="text-xs text-red-700">Non-Functional</p>
                          </div>
                          <div className="text-center p-2 rounded bg-yellow-50">
                            <p className="font-bold text-yellow-600">{stats.missing}</p>
                            <p className="text-xs text-yellow-700">Missing</p>
                          </div>
                          <div className="text-center p-2 rounded bg-gray-50">
                            <p className="font-bold text-gray-600">{stats.total - stats.functional - stats.nonFunctional - stats.missing}</p>
                            <p className="text-xs text-gray-700">Unknown</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}