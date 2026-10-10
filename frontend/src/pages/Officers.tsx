'use client';

import * as React from 'react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Shield, Building, UserCheck, KeyRound, Trash2, Edit } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { officersApi, centresApi } from '@/services/api';
import type { Centre } from '@/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const officerSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  email: z.string().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional().or(z.literal('')),
  role: z.enum(['MONITORING_OFFICER', 'CENTRE_MANAGER', 'VIEWER', 'ADMIN']).default('MONITORING_OFFICER'),
  centreId: z.string().min(1, 'Please assign a training centre'),
});

type OfficerFormData = z.infer<typeof officerSchema>;

export function OfficersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState<any | null>(null);

  const { data: officersData, isLoading } = useQuery({
    queryKey: ['officers', { search }],
    queryFn: () => officersApi.list({ search }),
  });

  const { data: centresData } = useQuery({
    queryKey: ['centres-all'],
    queryFn: () => centresApi.list({ limit: 100 }),
  });

  const officers = Array.isArray(officersData)
    ? officersData
    : (officersData as any)?.data || [];

  const centres: Centre[] = Array.isArray(centresData)
    ? centresData
    : (centresData as any)?.data || [];

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<OfficerFormData>({
    resolver: zodResolver(officerSchema) as any,
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      role: 'MONITORING_OFFICER',
      centreId: '',
    },
  });

  const openCreateDialog = () => {
    setEditingOfficer(null);
    reset({
      fullName: '',
      email: '',
      password: '',
      role: 'MONITORING_OFFICER',
      centreId: centres[0]?.id || '',
    });
    setDialogOpen(true);
  };

  const openEditDialog = (officer: any) => {
    setEditingOfficer(officer);
    setValue('fullName', officer.fullName);
    setValue('email', officer.email);
    setValue('password', '');
    setValue('role', officer.role);
    setValue('centreId', officer.centreId || '');
    setDialogOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: (formData: OfficerFormData) => officersApi.create(formData as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officers'] });
      setDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: OfficerFormData }) =>
      officersApi.update(id, formData as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officers'] });
      setDialogOpen(false);
      setEditingOfficer(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => officersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officers'] });
    },
  });

  const onSubmit = (formData: OfficerFormData) => {
    if (editingOfficer) {
      updateMutation.mutate({ id: editingOfficer.id, formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monitoring Officers & Site Leads</h1>
          <p className="text-sm text-muted-foreground">
            Create site monitoring officers and assign them to specific training centres.
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Officer
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Officers</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{officers.length}</div>
            <p className="text-xs text-muted-foreground">Active monitoring staff</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assigned Centres</CardTitle>
            <Building className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(officers.map((o: any) => o.centreId).filter(Boolean)).size}
            </div>
            <p className="text-xs text-muted-foreground">Centres with active officers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Accounts</CardTitle>
            <UserCheck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {officers.filter((o: any) => o.isActive !== false).length}
            </div>
            <p className="text-xs text-muted-foreground">Authorized site logins</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Table Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search officer name, email, centre..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading officers...</div>
          ) : officers.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No officers found. Click "Create Officer" to add one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Officer Name</TableHead>
                    <TableHead>Email Address</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Assigned Centre</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {officers.map((officer: any) => (
                    <TableRow key={officer.id}>
                      <TableCell>
                        <div className="font-medium">{officer.fullName}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {officer.email}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {officer.role.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {officer.centre ? (
                          <div className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="font-mono text-xs">
                              {officer.centre.code}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {officer.centre.name} ({officer.centre.city})
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-500 font-medium">
                            Not Assigned
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {officer.isActive !== false ? (
                          <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(officer)}
                          title="Edit officer"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete officer ${officer.fullName}?`)) {
                              deleteMutation.mutate(officer.id);
                            }
                          }}
                          title="Delete officer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingOfficer ? 'Edit Monitoring Officer' : 'Create Monitoring Officer'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Full Name *</label>
              <Input placeholder="e.g. Ramesh Chandra" {...register('fullName')} />
              {errors.fullName && (
                <p className="text-xs text-destructive">{errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Email Address *</label>
              <Input
                type="email"
                placeholder="officer.site@sih.gov.in"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">
                {editingOfficer ? 'New Password (Leave blank to keep unchanged)' : 'Login Password *'}
              </label>
              <Input
                type="password"
                placeholder={editingOfficer ? '••••••••' : 'Minimum 6 characters'}
                {...register('password')}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Role *</label>
              <select
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                {...register('role')}
              >
                <option value="MONITORING_OFFICER">Monitoring Officer (Site Scoped)</option>
                <option value="CENTRE_MANAGER">Centre Manager</option>
                <option value="VIEWER">Viewer</option>
                <option value="ADMIN">System Administrator</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Assigned Training Centre *</label>
              <select
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                {...register('centreId')}
              >
                <option value="">-- Select Training Centre --</option>
                {centres.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name} ({c.city}, {c.state})
                  </option>
                ))}
              </select>
              {errors.centreId && (
                <p className="text-xs text-destructive">{errors.centreId.message}</p>
              )}
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingOfficer ? 'Save Changes' : 'Create Officer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
