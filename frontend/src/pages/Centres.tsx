'use client';

import * as React from 'react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Filter, MoreHorizontal, Edit, Trash2, Eye, MapPin, Camera, Package, AlertTriangle } from 'lucide-react';
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
import { centresApi } from '@/services/api';
import type { Centre, PaginatedResponse } from '@/types';
import { cn, formatNumber, getInitials } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const centreSchema = z.object({
  code: z.string().min(3, 'Code must be at least 3 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  address: z.string().min(5, 'Address is required'),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  pincode: z.string().regex(/^\d{6}$/, 'Invalid pincode'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  sanctionedCapacity: z.number().int().positive(),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  schemeId: z.string().optional(),
  schemeName: z.string().optional(),
});

type CentreFormData = z.infer<typeof centreSchema>;

const statusColors: Record<string, string> = {
  ACTIVE: 'success',
  INACTIVE: 'secondary',
  SUSPENDED: 'destructive',
  PENDING_VERIFICATION: 'warning',
};

export function CentresPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCentre, setEditingCentre] = useState<Centre | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['centres', { page, search, status: statusFilter }],
    queryFn: () => centresApi.list({ page, limit: 20, search, status: statusFilter as any }),
  });

  const createMutation = useMutation({
    mutationFn: (data: CentreFormData) => centresApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['centres'] });
      setDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CentreFormData> }) => centresApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['centres'] });
      setDialogOpen(false);
      setEditingCentre(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => centresApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['centres'] }),
  });

  const handleSubmit = (data: CentreFormData) => {
    if (editingCentre) {
      updateMutation.mutate({ id: editingCentre.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openCreateDialog = () => {
    setEditingCentre(null);
    setDialogOpen(true);
  };

  const openEditDialog = (centre: Centre) => {
    setEditingCentre(centre);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this centre?')) {
      deleteMutation.mutate(id);
    }
  };

  const form = useForm<CentreFormData>({
    resolver: zodResolver(centreSchema),
    defaultValues: {
      code: '',
      name: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      latitude: 0,
      longitude: 0,
      sanctionedCapacity: 100,
      contactPerson: '',
      contactPhone: '',
      contactEmail: '',
      schemeId: '',
      schemeName: '',
    },
  });

  React.useEffect(() => {
    if (editingCentre) {
      form.reset({
        code: editingCentre.code,
        name: editingCentre.name,
        address: editingCentre.address,
        city: editingCentre.city,
        state: editingCentre.state,
        pincode: editingCentre.pincode,
        latitude: editingCentre.latitude,
        longitude: editingCentre.longitude,
        sanctionedCapacity: editingCentre.sanctionedCapacity,
        contactPerson: editingCentre.contactPerson || '',
        contactPhone: editingCentre.contactPhone || '',
        contactEmail: editingCentre.contactEmail || '',
        schemeId: editingCentre.schemeId || '',
        schemeName: editingCentre.schemeName || '',
      });
    } else {
      form.reset({
        code: '',
        name: '',
        address: '',
        city: '',
        state: '',
        pincode: '',
        latitude: 0,
        longitude: 0,
        sanctionedCapacity: 100,
        contactPerson: '',
        contactPhone: '',
        contactEmail: '',
        schemeId: '',
        schemeName: '',
      });
    }
  }, [editingCentre, form]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Training Centres</h1>
          <Button variant="outline" disabled><Plus className="h-4 w-4 mr-2" />Add Centre</Button>
        </div>
        <Card><CardContent className="p-6"><div className="animate-pulse space-y-4"><div className="h-12 bg-muted rounded"/></div></CardContent></Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Failed to load centres</p>
        <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['centres'] })} className="mt-4">Retry</Button>
      </div>
    );
  }

  const centres = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Training Centres</h1>
          <p className="text-muted-foreground">Manage training centres and their configurations</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}><Plus className="h-4 w-4 mr-2" />Add Centre</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCentre ? 'Edit Centre' : 'Create New Centre'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Centre Code"
                  error={form.formState.errors.code?.message}
                  {...form.register('code')}
                  disabled={!!editingCentre}
                />
                <Input
                  label="Name"
                  error={form.formState.errors.name?.message}
                  {...form.register('name')}
                />
                <Input
                  label="Address"
                  error={form.formState.errors.address?.message}
                  {...form.register('address')}
                />
                <Input
                  label="City"
                  error={form.formState.errors.city?.message}
                  {...form.register('city')}
                />
                <Input
                  label="State"
                  error={form.formState.errors.state?.message}
                  {...form.register('state')}
                />
                <Input
                  label="Pincode"
                  type="text"
                  error={form.formState.errors.pincode?.message}
                  {...form.register('pincode', { valueAsString: true })}
                />
                <Input
                  label="Latitude"
                  type="number"
                  step="0.000001"
                  error={form.formState.errors.latitude?.message}
                  {...form.register('latitude', { valueAsNumber: true })}
                />
                <Input
                  label="Longitude"
                  type="number"
                  step="0.000001"
                  error={form.formState.errors.longitude?.message}
                  {...form.register('longitude', { valueAsNumber: true })}
                />
                <Input
                  label="Sanctioned Capacity"
                  type="number"
                  error={form.formState.errors.sanctionedCapacity?.message}
                  {...form.register('sanctionedCapacity', { valueAsNumber: true })}
                />
                <Input
                  label="Contact Person"
                  {...form.register('contactPerson')}
                />
                <Input
                  label="Contact Phone"
                  {...form.register('contactPhone')}
                />
                <Input
                  label="Contact Email"
                  type="email"
                  error={form.formState.errors.contactEmail?.message}
                  {...form.register('contactEmail')}
                />
                <Input
                  label="Scheme ID"
                  {...form.register('schemeId')}
                />
                <Input
                  label="Scheme Name"
                  {...form.register('schemeName')}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search centres..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
                <SelectItem value="PENDING_VERIFICATION">Pending Verification</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Centres Table */}
      <Card>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Centre</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Cameras</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Alerts</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {centres.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No centres found
                  </TableCell>
                </TableRow>
              ) : (
                centres.map((centre) => (
                  <TableRow key={centre.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-primary font-medium text-sm">{getInitials(centre.name)}</span>
                        </div>
                        <div>
                          <p className="font-medium">{centre.name}</p>
                          <p className="text-xs text-muted-foreground">{centre.code}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span>{centre.city}, {centre.state}</span>
                      </div>
                    </TableCell>
                    <TableCell>{centre.sanctionedCapacity}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Camera className="h-3 w-3 text-muted-foreground" />
                        <span>{centre._count?.cameras || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColors[centre.status] || 'secondary'}>
                        {centre.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={centre._count?.alerts && centre._count.alerts > 0 ? 'destructive' : 'secondary'}>
                        {centre._count?.alerts || 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(centre)} title="Edit">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(centre.id)} title="Delete">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
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