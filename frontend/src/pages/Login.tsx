'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Lock, Mail, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginPage() {
  const [showPassword, setShowPassword] = React.useState(false);
  const { setAuth } = useAuthStore();
  const [isLoading, setIsLoading] = React.useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const response = await authApi.login(data.email, data.password);
      const payload = (response as any)?.data || response;
      const { user, accessToken, refreshToken } = payload;
      setAuth(user, accessToken, refreshToken);
      toast.success('Welcome back!');
      window.location.href = '/';
    } catch (error: any) {
      const message = error.response?.data?.error || 'Invalid credentials';
      toast.error(message);
      form.setError('password', { type: 'manual', message });
    } finally {
      setIsLoading(false);
    }
  };

  // Demo credentials
  const demoAccounts = [
    { email: 'admin@sih.gov.in', password: 'admin123', role: 'Administrator' },
    { email: 'officer@sih.gov.in', password: 'officer123', role: 'Monitoring Officer' },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-lg bg-primary flex items-center justify-center">
            <Building2 className="h-8 w-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">SIH26245 Monitor</CardTitle>
          <CardDescription>Training Centre Attendance & Infrastructure Compliance</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@sih.gov.in"
                  className="pl-10"
                  error={form.formState.errors.email?.message}
                  {...form.register('email')}
                  disabled={isLoading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <a href="#" className="text-xs text-primary hover:underline" onClick={(e) => { e.preventDefault(); toast.info('Demo: admin123 or officer123') }}>
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="pl-10 pr-10"
                  error={form.formState.errors.password?.message}
                  {...form.register('password')}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="mt-6 space-y-3">
            <p className="text-xs text-muted-foreground text-center">Demo Accounts</p>
            <div className="grid gap-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => {
                    form.setValue('email', account.email);
                    form.setValue('password', account.password);
                  }}
                  className={cn(
                    'w-full p-3 text-left rounded-lg border border-border hover:bg-accent transition-colors',
                    isLoading && 'opacity-50 pointer-events-none'
                  )}
                  disabled={isLoading}
                >
                  <div className="font-medium text-sm">{account.email}</div>
                  <div className="text-xs text-muted-foreground">{account.role} • Click to fill</div>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}