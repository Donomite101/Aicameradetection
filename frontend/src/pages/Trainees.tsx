'use client';

import * as React from 'react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Users,
  UserCheck,
  UserX,
  CalendarCheck2,
  CheckCircle,
  XCircle,
  Clock,
  Edit,
  Trash2,
  Building,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
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
import { traineesApi, schemesApi, centresApi } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import type { Trainee, Scheme, Centre } from '@/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const traineeSchema = z.object({
  fullName: z.string().min(2, 'Full Name is required'),
  registrationNo: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  dateOfBirth: z.string().optional(),
  aadhaarLast4: z.string().max(4).optional(),
  courseName: z.string().min(2, 'Course name is required'),
  batchName: z.string().min(2, 'Batch name is required'),
  schemeCode: z.string().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'DROPOUT', 'SUSPENDED']).default('ACTIVE'),
  photoUrl: z.string().optional(),
  centreId: z.string().optional(),
});

type TraineeFormData = z.infer<typeof traineeSchema>;

export function TraineesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const [search, setSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [attendanceDialogOpen, setAttendanceDialogOpen] = useState(false);
  const [editingTrainee, setEditingTrainee] = useState<Trainee | null>(null);

  // Attendance state
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [attendanceSession, setAttendanceSession] = useState<string>('FULL_DAY');
  const [attendanceStatuses, setAttendanceStatuses] = useState<Record<string, 'PRESENT' | 'ABSENT' | 'LEAVE'>>({});

  // The centre's class slots are the sessions trainees can be marked for
  const { data: scheduleData } = useQuery<any>({
    queryKey: ['centre-schedule', user?.centreId],
    queryFn: () => centresApi.schedule(user?.centreId as string),
    enabled: !!user?.centreId,
  });
  const classSlots: any[] = scheduleData?.slots || [];

  // Queries
  const { data: traineesData, isLoading } = useQuery({
    queryKey: ['trainees', { search, batchName: batchFilter }],
    queryFn: () => traineesApi.list({ search, batchName: batchFilter, limit: 100 }),
  });

  const { data: schemesData } = useQuery({
    queryKey: ['schemes-all'],
    queryFn: () => schemesApi.list(),
  });

  const { data: centresData } = useQuery({
    queryKey: ['centres-for-trainees'],
    queryFn: () => centresApi.list({ limit: 100 }),
    enabled: isAdmin,
  });

  const trainees: Trainee[] = Array.isArray(traineesData)
    ? traineesData
    : (traineesData as any)?.data || [];

  const schemes: Scheme[] = Array.isArray(schemesData)
    ? schemesData
    : (schemesData as any)?.data || [];

  const centres: Centre[] = Array.isArray(centresData)
    ? centresData
    : (centresData as any)?.data || [];

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<TraineeFormData>({
    resolver: zodResolver(traineeSchema) as any,
    defaultValues: {
      fullName: '',
      registrationNo: '',
      phone: '',
      email: '',
      gender: 'MALE',
      dateOfBirth: '',
      aadhaarLast4: '',
      courseName: 'Solar Panel Installation Technician',
      batchName: 'Batch 2026-A',
      schemeCode: 'PMKVY-4.0',
      status: 'ACTIVE',
      photoUrl: '',
    },
  });

  const openCreateDialog = () => {
    setEditingTrainee(null);
    reset({
      fullName: '',
      registrationNo: `TRN-${Date.now().toString().slice(-6)}`,
      phone: '',
      email: '',
      gender: 'MALE',
      dateOfBirth: '',
      aadhaarLast4: '',
      courseName: 'Solar Panel Installation Technician',
      batchName: 'Batch 2026-A',
      schemeCode: schemes[0]?.code || 'PMKVY-4.0',
      status: 'ACTIVE',
      photoUrl: '',
      centreId: isAdmin ? (centres[0]?.id || '') : (user?.centreId || ''),
    });
    setDialogOpen(true);
  };

  const openEditDialog = (t: Trainee) => {
    setEditingTrainee(t);
    setValue('fullName', t.fullName);
    setValue('registrationNo', t.registrationNo);
    setValue('phone', t.phone || '');
    setValue('email', t.email || '');
    setValue('gender', t.gender || 'MALE');
    setValue('dateOfBirth', t.dateOfBirth ? t.dateOfBirth.split('T')[0] : '');
    setValue('aadhaarLast4', t.aadhaarLast4 || '');
    setValue('courseName', t.courseName || '');
    setValue('batchName', t.batchName || '');
    setValue('schemeCode', t.schemeCode || '');
    setValue('status', t.status || 'ACTIVE');
    setValue('photoUrl', t.photoUrl || '');
    if (isAdmin) setValue('centreId', t.centreId);
    setDialogOpen(true);
  };

  const openAttendanceModal = () => {
    // Initialize all trainees to PRESENT by default
    const initial: Record<string, 'PRESENT' | 'ABSENT' | 'LEAVE'> = {};
    trainees.forEach((t) => {
      initial[t.id] = 'PRESENT';
    });
    setAttendanceStatuses(initial);
    setAttendanceDialogOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: (formData: TraineeFormData) => traineesApi.create(formData as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
      setDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: TraineeFormData }) =>
      traineesApi.update(id, formData as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
      setDialogOpen(false);
      setEditingTrainee(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => traineesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
    },
  });

  const markAttendanceMutation = useMutation({
    mutationFn: (payload: any) => traineesApi.markAttendance(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setAttendanceDialogOpen(false);
    },
  });

  const onSubmit = (formData: TraineeFormData) => {
    if (editingTrainee) {
      updateMutation.mutate({ id: editingTrainee.id, formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleSaveAttendance = () => {
    const records = Object.entries(attendanceStatuses).map(([traineeId, status]) => ({
      traineeId,
      status,
    }));

    markAttendanceMutation.mutate({
      date: attendanceDate,
      session: attendanceSession,
      records,
    });
  };

  const markAll = (status: 'PRESENT' | 'ABSENT' | 'LEAVE') => {
    const updated: Record<string, 'PRESENT' | 'ABSENT' | 'LEAVE'> = {};
    trainees.forEach((t) => {
      updated[t.id] = status;
    });
    setAttendanceStatuses(updated);
  };

  const activeCount = trainees.filter((t) => t.status === 'ACTIVE').length;
  const batches = Array.from(new Set(trainees.map((t) => t.batchName).filter(Boolean)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Trainee Management & Attendance</h1>
            {!isAdmin && (
              <Badge variant="secondary" className="text-xs">
                Site Scoped
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? 'Manage enrolled candidates and verify attendance across all training sites.'
              : 'Add trainees, manage batches, and track daily biometric & camera attendance for your centre.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={openAttendanceModal}
            className="gap-2 border-primary/50 text-primary hover:bg-primary/10"
            disabled={trainees.length === 0}
          >
            <CalendarCheck2 className="h-4 w-4" />
            Mark Today's Attendance
          </Button>
          <Button onClick={openCreateDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Trainee
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Trainees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{trainees.length}</div>
            <p className="text-xs text-muted-foreground">Enrolled candidates</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Candidates</CardTitle>
            <UserCheck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
            <p className="text-xs text-muted-foreground">Currently attending batches</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Batches</CardTitle>
            <GraduationCap className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{batches.length}</div>
            <p className="text-xs text-muted-foreground">Class cohorts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed / Certified</CardTitle>
            <Sparkles className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {trainees.filter((t) => t.status === 'COMPLETED').length}
            </div>
            <p className="text-xs text-muted-foreground">Passed assessment</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Table Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-3">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search candidate name, reg no, phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {batches.length > 0 && (
                <select
                  value={batchFilter}
                  onChange={(e) => setBatchFilter(e.target.value)}
                  className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">All Batches</option>
                  {batches.map((b) => (
                    <option key={b} value={b as string}>
                      {b}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading trainees...</div>
          ) : trainees.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-3">
              <p>No trainees found for this centre.</p>
              <Button onClick={openCreateDialog} size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add First Trainee
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Registration No</TableHead>
                    <TableHead>Course & Batch</TableHead>
                    <TableHead>Scheme</TableHead>
                    <TableHead>Contact & Aadhaar</TableHead>
                    {isAdmin && <TableHead>Centre</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trainees.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                            {t.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold">{t.fullName}</div>
                            <div className="text-xs text-muted-foreground capitalize">
                              {t.gender?.toLowerCase() || 'Unspecified'}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {t.registrationNo}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{t.courseName || 'General Trade'}</div>
                        <div className="text-xs text-muted-foreground">{t.batchName || 'Default Batch'}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {t.schemeCode || 'PMKVY'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          {t.phone ? `Ph: ${t.phone}` : 'No phone'}
                        </div>
                        {t.aadhaarLast4 && (
                          <div className="text-xs font-mono text-muted-foreground">
                            Aadhaar: •••• {t.aadhaarLast4}
                          </div>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="text-xs font-medium">{t.centre?.code}</div>
                          <div className="text-xs text-muted-foreground">{t.centre?.city}</div>
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge variant={t.status === 'ACTIVE' ? 'success' : t.status === 'COMPLETED' ? 'info' : 'secondary'}>
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(t)}
                          title="Edit trainee"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Delete candidate record for ${t.fullName}?`)) {
                              deleteMutation.mutate(t.id);
                            }
                          }}
                          title="Delete trainee"
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

      {/* Add / Edit Trainee Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTrainee ? 'Edit Candidate Profile' : 'Enroll New Trainee'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {isAdmin && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Training Centre *</label>
                <select
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                  {...register('centreId')}
                >
                  {centres.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} - {c.name} ({c.city})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Full Name *</label>
                <Input placeholder="Candidate's full legal name" {...register('fullName')} />
                {errors.fullName && (
                  <p className="text-xs text-destructive">{errors.fullName.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Registration Number</label>
                <Input placeholder="TRN-XXXXXX" {...register('registrationNo')} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Phone Number</label>
                <Input placeholder="10-digit mobile" {...register('phone')} />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Email</label>
                <Input type="email" placeholder="candidate@email.com" {...register('email')} />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Gender</label>
                <select
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                  {...register('gender')}
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Date of Birth</label>
                <Input type="date" {...register('dateOfBirth')} />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Aadhaar (Last 4 Digits)</label>
                <Input maxLength={4} placeholder="e.g. 4123" {...register('aadhaarLast4')} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Trade / Course *</label>
                <Input placeholder="e.g. Solar Technician" {...register('courseName')} />
                {errors.courseName && (
                  <p className="text-xs text-destructive">{errors.courseName.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Batch Name *</label>
                <Input placeholder="e.g. Batch 2026-A" {...register('batchName')} />
                {errors.batchName && (
                  <p className="text-xs text-destructive">{errors.batchName.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Scheme Code</label>
                <select
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                  {...register('schemeCode')}
                >
                  {schemes.map((s) => (
                    <option key={s.id} value={s.code}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                  {schemes.length === 0 && <option value="PMKVY-4.0">PMKVY-4.0</option>}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Enrollment Status</label>
                <select
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                  {...register('status')}
                >
                  <option value="ACTIVE">ACTIVE (Currently enrolled)</option>
                  <option value="COMPLETED">COMPLETED (Passed examination)</option>
                  <option value="DROPOUT">DROPOUT</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Photo URL (Optional)</label>
                <Input placeholder="https://..." {...register('photoUrl')} />
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingTrainee ? 'Save Changes' : 'Enroll Trainee'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Mark Batch Attendance Modal */}
      <Dialog open={attendanceDialogOpen} onOpenChange={setAttendanceDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCheck2 className="h-5 w-5 text-primary" />
              Mark Attendance for Candidates
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-muted/40 rounded-lg">
              <div className="flex items-center gap-3">
                <div>
                  <label className="text-xs font-semibold block text-muted-foreground">Date</label>
                  <Input
                    type="date"
                    value={attendanceDate}
                    onChange={(e) => setAttendanceDate(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold block text-muted-foreground">Session</label>
                  <select
                    value={attendanceSession}
                    onChange={(e) => setAttendanceSession(e.target.value as any)}
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm"
                  >
                    <option value="FULL_DAY">Full Day</option>
                    {classSlots.map((slot: any) => (
                      <option key={slot.id} value={slot.name}>{slot.name} ({slot.startTime}-{slot.endTime})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => markAll('PRESENT')}
                  className="text-xs text-emerald-600 border-emerald-600/30 hover:bg-emerald-500/10"
                >
                  <CheckCircle className="h-3.5 w-3.5 mr-1" /> All Present
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => markAll('ABSENT')}
                  className="text-xs text-rose-600 border-rose-600/30 hover:bg-rose-500/10"
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" /> All Absent
                </Button>
              </div>
            </div>

            <div className="border rounded-md divide-y max-h-96 overflow-y-auto">
              {trainees.map((t) => {
                const currentStatus = attendanceStatuses[t.id] || 'PRESENT';
                return (
                  <div
                    key={t.id}
                    className="p-3 flex items-center justify-between hover:bg-muted/20"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                        {t.fullName.charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{t.fullName}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {t.registrationNo} • {t.batchName}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant={currentStatus === 'PRESENT' ? 'default' : 'outline'}
                        className={
                          currentStatus === 'PRESENT'
                            ? 'bg-emerald-600 hover:bg-emerald-600 text-xs h-7'
                            : 'text-xs h-7'
                        }
                        onClick={() =>
                          setAttendanceStatuses((prev) => ({ ...prev, [t.id]: 'PRESENT' }))
                        }
                      >
                        Present
                      </Button>
                      <Button
                        size="sm"
                        variant={currentStatus === 'ABSENT' ? 'default' : 'outline'}
                        className={
                          currentStatus === 'ABSENT'
                            ? 'bg-rose-600 hover:bg-rose-600 text-xs h-7'
                            : 'text-xs h-7'
                        }
                        onClick={() =>
                          setAttendanceStatuses((prev) => ({ ...prev, [t.id]: 'ABSENT' }))
                        }
                      >
                        Absent
                      </Button>
                      <Button
                        size="sm"
                        variant={currentStatus === 'LEAVE' ? 'default' : 'outline'}
                        className={
                          currentStatus === 'LEAVE'
                            ? 'bg-amber-600 hover:bg-amber-600 text-xs h-7'
                            : 'text-xs h-7'
                        }
                        onClick={() =>
                          setAttendanceStatuses((prev) => ({ ...prev, [t.id]: 'LEAVE' }))
                        }
                      >
                        Leave
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                onClick={() => setAttendanceDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveAttendance}
                disabled={markAttendanceMutation.isPending}
              >
                {markAttendanceMutation.isPending ? 'Saving...' : 'Submit Attendance'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
