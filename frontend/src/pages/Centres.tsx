'use client';

import * as React from 'react';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2, MapPin, Camera, Package, Users, Clock, X, GraduationCap } from 'lucide-react';
import { ClassSessionScheduleBanner } from '@/components/ClassSessionScheduleBanner';
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
import { centresApi, detectionApi, schemesApi } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import { cn, getInitials } from '@/lib/utils';
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
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const optionalNumber = (v: unknown) => (v === '' || v === null || v === undefined || Number.isNaN(v) ? undefined : Number(v));

const toolSchema = z.object({
  id: z.string().optional(),
  detectClass: z.string().min(1, 'Pick a tool'),
  name: z.string().optional(),
  quantity: z.number({ invalid_type_error: 'Required' }).int().positive('Must be at least 1'),
});

const slotSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name required'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Start time required'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'End time required'),
  daysOfWeek: z.array(z.number()).min(1, 'Pick at least one day'),
  expectedTrainees: z.number().int().nonnegative().optional(),
});

const centreSchema = z.object({
  code: z.string().min(3, 'Code must be at least 3 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  address: z.string().min(5, 'Address is required'),
  area: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  pincode: z.string().regex(/^\d{6}$/, 'Invalid pincode'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  sanctionedCapacity: z.number().int().positive(),
  totalTrainees: z.number({ invalid_type_error: 'Required' }).int().nonnegative(),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  schemeId: z.string().min(1, 'Select a scheme'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  tools: z.array(toolSchema),
  slots: z.array(slotSchema),
});

type CentreFormData = z.infer<typeof centreSchema>;

const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const emptyForm: CentreFormData = {
  code: '',
  name: '',
  address: '',
  area: '',
  city: '',
  state: '',
  pincode: '',
  latitude: 0,
  longitude: 0,
  sanctionedCapacity: 100,
  totalTrainees: 0,
  contactPerson: '',
  contactPhone: '',
  contactEmail: '',
  schemeId: '',
  status: 'ACTIVE',
  tools: [],
  slots: [{ name: 'Morning Batch', startTime: '09:00', endTime: '12:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }],
};

const centreToForm = (c: any): CentreFormData => ({
  code: c.code,
  name: c.name,
  address: c.address,
  area: c.area || '',
  city: c.city,
  state: c.state,
  pincode: c.pincode,
  latitude: c.latitude,
  longitude: c.longitude,
  sanctionedCapacity: c.sanctionedCapacity,
  totalTrainees: c.totalTrainees ?? 0,
  contactPerson: c.contactPerson || '',
  contactPhone: c.contactPhone || '',
  contactEmail: c.contactEmail || '',
  schemeId: c.schemeId || '',
  status: c.status || 'ACTIVE',
  tools: (c.inventory || [])
    .filter((i: any) => i.detectClass)
    .map((i: any) => ({ id: i.id, detectClass: i.detectClass, name: i.name, quantity: i.quantity })),
  slots: (c.classSlots || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    startTime: s.startTime,
    endTime: s.endTime,
    daysOfWeek: String(s.daysOfWeek).split(',').filter(Boolean).map(Number),
    expectedTrainees: s.expectedTrainees ?? undefined,
  })),
});

const statusColors: Record<string, string> = {
  ACTIVE: 'success',
  INACTIVE: 'secondary',
  SUSPENDED: 'destructive',
};

const nativeSelectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground border-b pb-1.5">{children}</h3>;
}

export function CentresPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCentre, setEditingCentre] = useState<any | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['centres', { page, search, status: statusFilter, centreId: user?.centreId }],
    queryFn: () => centresApi.list({ page, limit: 20, search, status: statusFilter as any }),
  });

  const { data: schemesData, isLoading: schemesLoading, isError: schemesError } = useQuery({
    queryKey: ['schemes', 'active'],
    queryFn: () => schemesApi.list({ limit: 100, isActive: true }),
    enabled: isAdmin,
  });
  const activeSchemes: any[] = schemesData?.data || [];
  // An inactive scheme already assigned to the centre being edited must stay selectable
  const schemes: any[] =
    editingCentre?.scheme && !activeSchemes.some((s) => s.id === editingCentre.scheme.id)
      ? [...activeSchemes, editingCentre.scheme]
      : activeSchemes;

  const { data: classOptions } = useQuery({
    queryKey: ['detection-classes'],
    queryFn: () => detectionApi.classes(),
    enabled: isAdmin,
    staleTime: Infinity,
  });
  const detectableClasses: { detectClass: string; label: string }[] = Array.isArray(classOptions) ? classOptions : [];

  const form = useForm<CentreFormData>({
    resolver: zodResolver(centreSchema),
    defaultValues: emptyForm,
  });
  const toolsField = useFieldArray({ control: form.control, name: 'tools' });
  const slotsField = useFieldArray({ control: form.control, name: 'slots' });

  const apiError = (err: any): string | null =>
    err ? err?.response?.data?.message || err?.message || 'Something went wrong' : null;

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => centresApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['centres'] });
      setDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => centresApi.update(id, payload),
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

  const handleSubmit = (formData: CentreFormData) => {
    const { code, contactEmail, contactPerson, contactPhone, area, ...rest } = formData;
    const payload: Record<string, unknown> = {
      ...rest,
      area: area || undefined,
      contactPerson: contactPerson || undefined,
      contactPhone: contactPhone || undefined,
      contactEmail: contactEmail || undefined,
    };
    if (editingCentre) {
      updateMutation.mutate({ id: editingCentre.id, payload });
    } else {
      createMutation.mutate({ ...payload, code });
    }
  };

  const openCreateDialog = () => {
    setEditingCentre(null);
    createMutation.reset();
    setDialogOpen(true);
  };

  const openEditDialog = (centre: any) => {
    setEditingCentre(centre);
    updateMutation.reset();
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this centre?')) {
      deleteMutation.mutate(id);
    }
  };

  React.useEffect(() => {
    form.reset(editingCentre ? centreToForm(editingCentre) : emptyForm);
  }, [editingCentre, dialogOpen, form]);

  const watchedSlots = form.watch('slots');
  const toggleDay = (index: number, day: number) => {
    const current = form.getValues(`slots.${index}.daysOfWeek`) || [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    form.setValue(`slots.${index}.daysOfWeek`, next, { shouldValidate: true, shouldDirty: true });
  };

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
  const saving = createMutation.isPending || updateMutation.isPending;
  const submitError = apiError(createMutation.error) || apiError(updateMutation.error);
  const errors = form.formState.errors;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Training Centres</h1>
            {!isAdmin && (
              <Badge variant="secondary" className="font-mono text-xs">
                {user?.centre?.code || 'Site Scope'}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {isAdmin
              ? 'Manage training centres, their schemes, tools and class timings'
              : `Assigned Centre: ${user?.centre?.name || 'Your Assigned Training Centre'}`}
          </p>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}><Plus className="h-4 w-4 mr-2" />Add Centre</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingCentre ? 'Edit Centre' : 'Create New Centre'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 py-2">
                {/* 1. Basic details & location */}
                <section className="space-y-3">
                  <SectionTitle>Centre &amp; location</SectionTitle>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input label="Centre Code" error={errors.code?.message} {...form.register('code')} disabled={!!editingCentre} />
                    <Input label="Centre Name" error={errors.name?.message} {...form.register('name')} />
                    <Input label="Address" error={errors.address?.message} {...form.register('address')} />
                    <Input label="Area / Locality" {...form.register('area')} />
                    <Input label="City" error={errors.city?.message} {...form.register('city')} />
                    <Input label="State" error={errors.state?.message} {...form.register('state')} />
                    <Input label="Pincode" error={errors.pincode?.message} {...form.register('pincode')} />
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Latitude" type="number" step="0.000001" error={errors.latitude?.message} {...form.register('latitude', { valueAsNumber: true })} />
                      <Input label="Longitude" type="number" step="0.000001" error={errors.longitude?.message} {...form.register('longitude', { valueAsNumber: true })} />
                    </div>
                  </div>
                </section>

                {/* 2. Centre admin contact */}
                <section className="space-y-3">
                  <SectionTitle>Centre admin contact</SectionTitle>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Input label="Admin Name" {...form.register('contactPerson')} />
                    <Input label="Admin Email" type="email" error={errors.contactEmail?.message} {...form.register('contactEmail')} />
                    <Input label="Admin Phone" {...form.register('contactPhone')} />
                  </div>
                </section>

                {/* 3. Scheme & trainees */}
                <section className="space-y-3">
                  <SectionTitle>Scheme &amp; trainees</SectionTitle>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="w-full">
                      <label htmlFor="schemeId" className="block text-sm font-medium mb-1.5">Scheme</label>
                      <select id="schemeId" className={cn(nativeSelectClass, errors.schemeId && 'border-destructive')} {...form.register('schemeId')}>
                        <option value="">{schemesLoading ? 'Loading schemes…' : schemesError ? 'Could not load schemes' : 'Select a scheme…'}</option>
                        {schemes.map((s) => (
                          <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                        ))}
                      </select>
                      {errors.schemeId && <p className="mt-1.5 text-sm text-destructive">{errors.schemeId.message}</p>}
                      {!schemesLoading && !schemesError && schemes.length === 0 && (
                        <p className="mt-1.5 text-xs text-muted-foreground">No active schemes yet. Add one on the Schemes page first.</p>
                      )}
                    </div>
                    <Input label="Total Trainees" type="number" error={errors.totalTrainees?.message} {...form.register('totalTrainees', { valueAsNumber: true })} />
                    <div className="w-full">
                      <label htmlFor="status" className="block text-sm font-medium mb-1.5">Centre status</label>
                      <select id="status" className={nativeSelectClass} {...form.register('status')}>
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                        <option value="SUSPENDED">Suspended</option>
                      </select>
                    </div>
                    <Input label="Sanctioned Capacity" type="number" error={errors.sanctionedCapacity?.message} {...form.register('sanctionedCapacity', { valueAsNumber: true })} />
                  </div>
                </section>

                {/* 4. Tools */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between border-b pb-1.5">
                    <h3 className="text-sm font-semibold">Tools &amp; equipment the camera counts</h3>
                    <Button type="button" size="sm" variant="outline" onClick={() => toolsField.append({ detectClass: '', quantity: 1 })}>
                      <Plus className="h-3.5 w-3.5 mr-1" />Add tool
                    </Button>
                  </div>
                  {toolsField.fields.length === 0 && (
                    <p className="text-sm text-muted-foreground">No tools added. Add the items that should be present during class.</p>
                  )}
                  {toolsField.fields.map((field, i) => (
                    <div key={field.id} className="grid grid-cols-[1fr_1fr_110px_auto] gap-3 items-start">
                      <div>
                        <select className={cn(nativeSelectClass, errors.tools?.[i]?.detectClass && 'border-destructive')} {...form.register(`tools.${i}.detectClass`)}>
                          <option value="">Select detectable tool…</option>
                          {detectableClasses.map((c) => (
                            <option key={c.detectClass} value={c.detectClass}>{c.label}</option>
                          ))}
                        </select>
                        {errors.tools?.[i]?.detectClass && <p className="mt-1 text-xs text-destructive">{errors.tools[i]?.detectClass?.message}</p>}
                      </div>
                      <Input placeholder="Display name (optional)" {...form.register(`tools.${i}.name`)} />
                      <Input type="number" placeholder="Qty" error={errors.tools?.[i]?.quantity?.message} {...form.register(`tools.${i}.quantity`, { valueAsNumber: true })} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => toolsField.remove(i)} title="Remove tool">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </section>

                {/* 5. Class timings */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between border-b pb-1.5">
                    <h3 className="text-sm font-semibold">Class timings</h3>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => slotsField.append({ name: `Batch ${slotsField.fields.length + 1}`, startTime: '', endTime: '', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />Add slot
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The camera records attendance and tools only inside these windows. Each slot becomes one attendance record per day.
                  </p>
                  {slotsField.fields.map((field, i) => (
                    <div key={field.id} className="rounded-md border p-3 space-y-3">
                      <div className="grid grid-cols-[1fr_130px_130px_130px_auto] gap-3 items-start">
                        <Input label="Slot name" error={errors.slots?.[i]?.name?.message} {...form.register(`slots.${i}.name`)} />
                        <Input label="Start" type="time" error={errors.slots?.[i]?.startTime?.message} {...form.register(`slots.${i}.startTime`)} />
                        <Input label="End" type="time" error={errors.slots?.[i]?.endTime?.message} {...form.register(`slots.${i}.endTime`)} />
                        <Input
                          label="Expected"
                          type="number"
                          placeholder="All"
                          {...form.register(`slots.${i}.expectedTrainees`, { setValueAs: optionalNumber })}
                        />
                        <Button type="button" variant="ghost" size="icon" className="mt-7" onClick={() => slotsField.remove(i)} title="Remove slot">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {DAYS.map((d) => {
                          const on = (watchedSlots?.[i]?.daysOfWeek || []).includes(d.value);
                          return (
                            <button
                              key={d.value}
                              type="button"
                              onClick={() => toggleDay(i, d.value)}
                              className={cn(
                                'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                                on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted'
                              )}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                        {errors.slots?.[i]?.daysOfWeek && <span className="text-xs text-destructive ml-2">{errors.slots[i]?.daysOfWeek?.message}</span>}
                        {!(watchedSlots?.[i]?.daysOfWeek || []).includes(new Date().getDay()) && (watchedSlots?.[i]?.daysOfWeek || []).length > 0 && (
                          <span className="text-xs text-amber-600 ml-2">Today ({DAYS.find((d) => d.value === new Date().getDay())?.label}) is not selected, so this slot will not run today.</span>
                        )}
                      </div>
                    </div>
                  ))}
                </section>

                {submitError && (
                  <p className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md px-3 py-2" role="alert">
                    {submitError}
                  </p>
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Class session timings for the signed-in centre */}
      {!isAdmin && user?.centreId && <ClassSessionScheduleBanner centreId={user.centreId} centreName={user?.centre?.name} />}

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
                <TableHead>Scheme</TableHead>
                <TableHead>Trainees</TableHead>
                <TableHead>Tools</TableHead>
                <TableHead>Class Timings</TableHead>
                <TableHead>Cameras</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {centres.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    No centres found
                  </TableCell>
                </TableRow>
              ) : (
                centres.map((centre: any) => (
                  <TableRow
                    key={centre.id}
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => navigate(`/centres/${centre.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-primary font-medium text-sm">{getInitials(centre.name)}</span>
                        </div>
                        <div>
                          <Link to={`/centres/${centre.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{centre.name}</Link>
                          <p className="text-xs text-muted-foreground">{centre.code}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span>{[centre.area, centre.city].filter(Boolean).join(', ')}, {centre.state}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <GraduationCap className="h-3.5 w-3.5 text-primary" />
                        <span>{centre.scheme?.code || centre.schemeName || '—'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm font-mono">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        <span className="font-semibold">{centre.totalTrainees ?? 0}</span>
                        <span className="text-muted-foreground text-xs">/ {centre.sanctionedCapacity} cap</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm font-mono">
                        <Package className="h-3.5 w-3.5 text-amber-500" />
                        <span className="font-semibold">{centre.inventory?.length ?? 0}</span>
                        <span className="text-muted-foreground text-xs">tracked</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {centre.classSlots?.length ? (
                        <div className="flex flex-col gap-0.5 text-xs">
                          {centre.classSlots.map((s: any) => (
                            <span key={s.id} className="flex items-center gap-1 text-foreground">
                              <Clock className="h-3 w-3 text-primary shrink-0" />
                              <span className="font-medium">{s.name}</span>
                              <span className="text-muted-foreground">{to12h(s.startTime)} – {to12h(s.endTime)}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No timings set</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Camera className="h-3 w-3 text-muted-foreground" />
                        <span>{centre._count?.cameras || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        <Badge variant={(statusColors[centre.status] as any) || 'secondary'}>
                          {centre.status.replace('_', ' ')}
                        </Badge>
                        {centre._count?.alerts > 0 && (
                          <Badge variant="destructive" className="text-[10px]">{centre._count.alerts} alerts</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {isAdmin ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(centre)} title="Edit">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(centre.id)} title="Delete">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Assigned Site
                        </Badge>
                      )}
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
