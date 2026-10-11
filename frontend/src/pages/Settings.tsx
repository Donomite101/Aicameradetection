'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Bell, Shield, Palette, Database, Server, Save, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/services/api';
import { cn } from '@/lib/utils';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

const profileSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').optional(),
  confirmPassword: z.string().optional(),
}).refine((data) => !data.newPassword || data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type ProfileFormData = z.infer<typeof profileSchema>;

const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  emailNotifications: z.boolean(),
  pushNotifications: z.boolean(),
  alertEmails: z.boolean(),
  weeklyReports: z.boolean(),
  dataRetentionDays: z.number().min(30).max(3650),
  autoRefreshInterval: z.number().min(10).max(3600),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

export function SettingsPage() {
  const { user, updateUser } = useAuthStore();
  const queryClient = useQueryClient();

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: user?.fullName || '',
      email: user?.email || '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const settingsForm = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      theme: 'system',
      emailNotifications: true,
      pushNotifications: true,
      alertEmails: true,
      weeklyReports: false,
      dataRetentionDays: 730,
      autoRefreshInterval: 30,
    },
  });

  const profileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      // A new password needs the current one: check that BEFORE anything is saved
      if (data.newPassword && !data.currentPassword) {
        throw new Error('Enter your current password to set a new one');
      }
      const res: any = await authApi.updateProfile({ fullName: data.fullName });
      if (data.newPassword) {
        await authApi.changePassword(data.currentPassword as string, data.newPassword);
      }
      return { fullName: res.user.fullName as string, passwordChanged: !!data.newPassword };
    },
    onSuccess: ({ fullName, passwordChanged }) => {
      updateUser({ fullName });
      profileForm.reset({ ...profileForm.getValues(), currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success(passwordChanged ? 'Profile and password updated' : 'Profile updated');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || err?.message || 'Could not update your profile'),
  });

  const settingsMutation = useMutation({
    mutationFn: async (data: SettingsFormData) => {
      // These are display preferences kept in this browser only (nothing is sent to the server)
      localStorage.setItem('app-settings', JSON.stringify(data));
      return data;
    },
    onSuccess: () => toast.success('Preferences saved on this browser'),
    onError: () => toast.error('Failed to save settings'),
  });

  const handleProfileSubmit = (data: ProfileFormData) => {
    profileMutation.mutate(data);
  };

  const handleSettingsSubmit = (data: SettingsFormData) => {
    settingsMutation.mutate(data);
  };

  // Load saved settings
  React.useEffect(() => {
    const saved = localStorage.getItem('app-settings');
    if (saved) {
      settingsForm.reset(JSON.parse(saved));
    }
  }, [settingsForm]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and application preferences</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile"><User className="h-4 w-4 mr-2" />Profile</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-4 w-4 mr-2" />Notifications</TabsTrigger>
          <TabsTrigger value="appearance"><Palette className="h-4 w-4 mr-2" />Appearance</TabsTrigger>
          <TabsTrigger value="data"><Database className="h-4 w-4 mr-2" />Data & Privacy</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal information</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={profileForm.handleSubmit(handleProfileSubmit)} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Full Name"
                    error={profileForm.formState.errors.fullName?.message}
                    {...profileForm.register('fullName')}
                  />
                  <Input
                    label="Email (sign-in)"
                    type="email"
                    readOnly
                    hint="Ask an administrator to change your sign-in email."
                    error={profileForm.formState.errors.email?.message}
                    {...profileForm.register('email')}
                  />
                </div>
                <Separator />
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Current Password"
                    type="password"
                    error={profileForm.formState.errors.currentPassword?.message}
                    {...profileForm.register('currentPassword')}
                    placeholder="Leave blank to keep current"
                  />
                  <Input
                    label="New Password"
                    type="password"
                    error={profileForm.formState.errors.newPassword?.message}
                    {...profileForm.register('newPassword')}
                    placeholder="Min 8 characters"
                  />
                  <Input
                    label="Confirm New Password"
                    type="password"
                    error={profileForm.formState.errors.confirmPassword?.message}
                    {...profileForm.register('confirmPassword')}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => profileForm.reset()}>Cancel</Button>
                  <Button type="submit" disabled={profileMutation.isPending}>
                    {profileMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save Changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Current User Info */}
          <Card>
            <CardHeader>
              <CardTitle>Account Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 text-sm">
                <div className="space-y-1">
                  <Label>User ID</Label>
                  <p className="font-mono text-muted-foreground">{user?.id}</p>
                </div>
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Badge variant="secondary">{user?.role}</Badge>
                </div>
                <div className="space-y-1">
                  <Label>Centre</Label>
                  <p>{user?.centre?.name || 'Not assigned'}</p>
                </div>
                <div className="space-y-1">
                  <Label>Last Login</Label>
                  <p className="text-muted-foreground">{user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</p>
                </div>
</div>
          </CardContent>
        </Card>
      </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>Configure when you receive email notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>All Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive emails for all system notifications</p>
                </div>
                <Switch
                  checked={settingsForm.watch('emailNotifications')}
                  onCheckedChange={(v) => settingsForm.setValue('emailNotifications', v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Alert Emails</Label>
                  <p className="text-sm text-muted-foreground">Receive immediate emails for critical alerts</p>
                </div>
                <Switch
                  checked={settingsForm.watch('alertEmails')}
                  onCheckedChange={(v) => settingsForm.setValue('alertEmails', v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Weekly Reports</Label>
                  <p className="text-sm text-muted-foreground">Receive weekly summary reports via email</p>
                </div>
                <Switch
                  checked={settingsForm.watch('weeklyReports')}
                  onCheckedChange={(v) => settingsForm.setValue('weeklyReports', v)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Push Notifications</CardTitle>
              <CardDescription>Browser push notifications for real-time alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Enable Push Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive browser notifications for alerts</p>
                </div>
                <Switch
                  checked={settingsForm.watch('pushNotifications')}
                  onCheckedChange={(v) => settingsForm.setValue('pushNotifications', v)}
                />
              </div>
              <p className="text-sm text-muted-foreground">Requires browser permission. You'll be prompted on first enable.</p>
            </CardContent>
        </Card>
      </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
              <CardDescription>Choose your preferred color scheme</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {['light', 'dark', 'system'].map((theme) => (
                  <label
                    key={theme}
                    className={cn(
                      'relative cursor-pointer p-4 rounded-lg border-2 transition-all',
                      settingsForm.watch('theme') === theme
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    <input
                      type="radio"
                      value={theme}
                      checked={settingsForm.watch('theme') === theme}
                      onChange={(e) => settingsForm.setValue('theme', e.target.value as any)}
                      className="sr-only"
                    />
                    <div className="flex flex-col items-center gap-2">
                      <div className={cn(
                        'h-20 w-full rounded-lg border',
                        theme === 'light' ? 'bg-white border-gray-200' :
                        theme === 'dark' ? 'bg-gray-900 border-gray-700' :
                        'bg-gradient-to-r from-white to-gray-900 border-gray-300'
                      )} />
                      <span className="font-medium capitalize">{theme}</span>
                    </div>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Auto Refresh</CardTitle>
              <CardDescription>Configure automatic data refresh intervals</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Dashboard Refresh (seconds)</Label>
                  <Input
                    type="number"
                    min={10}
                    max={3600}
                    {...settingsForm.register('autoRefreshInterval', { valueAsNumber: true })}
                  />
                  <p className="text-sm text-muted-foreground">How often the dashboard auto-refreshes</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data & Privacy Tab */}
        <TabsContent value="data" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Data Retention</CardTitle>
              <CardDescription>Configure how long data is stored</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Data Retention Period (days)</Label>
                <Input
                  type="number"
                  min={30}
                  max={3650}
                  {...settingsForm.register('dataRetentionDays', { valueAsNumber: true })}
                />
                <p className="text-sm text-muted-foreground">How long to keep attendance records, alerts, and infrastructure checks. Minimum 30 days, maximum 10 years.</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <h4 className="font-medium mb-2">Current Data Policy</h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Raw video frames: Never stored (processed at edge)</li>
                  <li>Blurred thumbnails: 30 days</li>
                  <li>Attendance records: 2 years (audit requirement)</li>
                  <li>Infrastructure checks: 2 years</li>
                  <li>Alerts: Until resolved + 1 year</li>
                  <li>Audit logs: 2 years</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Privacy Settings</CardTitle>
              <CardDescription>Control data processing and privacy features</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Face Blurring</Label>
                    <p className="text-sm text-muted-foreground">Automatically blur faces in captured thumbnails</p>
                  </div>
                  <Badge variant="success">Enabled (Edge)</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Aggregate Only</Label>
                    <p className="text-sm text-muted-foreground">Only store aggregate counts, never individual identities</p>
                  </div>
                  <Badge variant="success">Enabled</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>No Facial Recognition</Label>
                    <p className="text-sm text-muted-foreground">No biometric identification or person re-identification</p>
                  </div>
                  <Badge variant="success">Enabled</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Local Processing</Label>
                    <p className="text-sm text-muted-foreground">Video analytics runs on edge device, raw video never leaves</p>
                  </div>
                  <Badge variant="success">Enabled</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">Delete Account</p>
                <p className="text-sm text-muted-foreground">Permanently delete your account and all associated data</p>
              </div>
              <Button variant="destructive" onClick={() => { if (confirm('Are you sure? This cannot be undone.')) toast.error('Account deletion not implemented in demo') }}>
                Delete Account
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Settings Button */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex justify-end">
            <Button onClick={settingsForm.handleSubmit(handleSettingsSubmit)} disabled={settingsMutation.isPending}>
              {settingsMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save All Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}