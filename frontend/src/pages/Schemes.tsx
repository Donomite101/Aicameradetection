'use client';

import * as React from 'react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2, Award, Landmark, Users2, CheckCircle2, XCircle } from 'lucide-react';
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
import { schemesApi } from '@/services/api';
import type { Scheme } from '@/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schemeSchema = z.object({
  code: z.string().min(2, 'Code is required (e.g. PMKVY-4.0)'),
  name: z.string().min(3, 'Scheme name is required'),
  description: z.string().optional(),
  ministry: z.string().optional(),
  fundingType: z.string().optional(),
  targetBeneficiaries: z.coerce.number().int().nonnegative().optional(),
  isActive: z.boolean().default(true),
});

type SchemeFormData = z.infer<typeof schemeSchema>;

export function SchemesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingScheme, setEditingScheme] = useState<Scheme | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['schemes', { search }],
    queryFn: () => schemesApi.list({ search }),
  });

  const schemes: Scheme[] = Array.isArray(data) ? data : (data as any)?.data || [];

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<SchemeFormData>({
    resolver: zodResolver(schemeSchema) as any,
    defaultValues: {
      code: '',
      name: '',
      description: '',
      ministry: '',
      fundingType: 'CENTRAL',
      targetBeneficiaries: 0,
      isActive: true,
    },
  });

  const openCreateDialog = () => {
    setEditingScheme(null);
    reset({
      code: '',
      name: '',
      description: '',
      ministry: '',
      fundingType: 'CENTRAL',
      targetBeneficiaries: 0,
      isActive: true,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (scheme: Scheme) => {
    setEditingScheme(scheme);
    setValue('code', scheme.code);
    setValue('name', scheme.name);
    setValue('description', scheme.description || '');
    setValue('ministry', scheme.ministry || '');
    setValue('fundingType', scheme.fundingType || 'CENTRAL');
    setValue('targetBeneficiaries', scheme.targetBeneficiaries || 0);
    setValue('isActive', scheme.isActive);
    setDialogOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: (formData: SchemeFormData) => schemesApi.create(formData as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schemes'] });
      setDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: SchemeFormData }) =>
      schemesApi.update(id, formData as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schemes'] });
      setDialogOpen(false);
      setEditingScheme(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => schemesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schemes'] });
    },
  });

  const onSubmit = (formData: SchemeFormData) => {
    if (editingScheme) {
      updateMutation.mutate({ id: editingScheme.id, formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const totalBeneficiaries = schemes.reduce(
    (acc, s) => acc + (s.targetBeneficiaries || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Government Schemes</h1>
          <p className="text-sm text-muted-foreground">
            Manage skill development missions, central and state schemes, and funding quotas.
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Scheme
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Schemes</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{schemes.length}</div>
            <p className="text-xs text-muted-foreground">Active national skill missions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Schemes</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {schemes.filter((s) => s.isActive).length}
            </div>
            <p className="text-xs text-muted-foreground">Eligible for centre allocation</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Target Beneficiaries</CardTitle>
            <Users2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalBeneficiaries.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Target youth to be trained</p>
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
                placeholder="Search scheme name, code or ministry..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading schemes...</div>
          ) : error ? (
            <div className="py-12 text-center text-destructive">Failed to load schemes</div>
          ) : schemes.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No government schemes found. Click "Add Scheme" to add one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scheme Code</TableHead>
                    <TableHead>Name & Description</TableHead>
                    <TableHead>Nodal Ministry</TableHead>
                    <TableHead>Funding Model</TableHead>
                    <TableHead>Target Beneficiaries</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schemes.map((scheme) => (
                    <TableRow key={scheme.id}>
                      <TableCell className="font-semibold text-primary">
                        {scheme.code}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{scheme.name}</div>
                        {scheme.description && (
                          <div className="text-xs text-muted-foreground max-w-md truncate">
                            {scheme.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Landmark className="h-3.5 w-3.5 shrink-0" />
                          <span>{scheme.ministry || 'N/A'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {scheme.fundingType || 'CENTRAL'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {scheme.targetBeneficiaries
                          ? scheme.targetBeneficiaries.toLocaleString()
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {scheme.isActive ? (
                          <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(scheme)}
                          title="Edit scheme"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete ${scheme.code}?`)) {
                              deleteMutation.mutate(scheme.id);
                            }
                          }}
                          title="Delete scheme"
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingScheme ? 'Edit Government Scheme' : 'Add New Government Scheme'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Scheme Code *</label>
                <Input
                  placeholder="e.g. PMKVY-4.0"
                  {...register('code')}
                  disabled={!!editingScheme}
                />
                {errors.code && (
                  <p className="text-xs text-destructive">{errors.code.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Funding Model</label>
                <Input placeholder="e.g. CENTRAL, STATE, PPP" {...register('fundingType')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Scheme Name *</label>
              <Input
                placeholder="e.g. Pradhan Mantri Kaushal Vikas Yojana 4.0"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Nodal Ministry</label>
              <Input
                placeholder="e.g. Ministry of Skill Development and Entrepreneurship"
                {...register('ministry')}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Target Beneficiaries</label>
              <Input
                type="number"
                placeholder="e.g. 1000000"
                {...register('targetBeneficiaries')}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Description</label>
              <textarea
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={3}
                placeholder="Scheme guidelines, objectives, and eligibility..."
                {...register('description')}
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="scheme-active"
                className="h-4 w-4 rounded border-gray-300"
                {...register('isActive')}
              />
              <label htmlFor="scheme-active" className="text-sm font-medium">
                Active Scheme (Enabled for Centre Allocation)
              </label>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingScheme ? 'Save Changes' : 'Create Scheme'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
