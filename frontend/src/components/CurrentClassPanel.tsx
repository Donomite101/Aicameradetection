'use client';

import * as React from 'react';
import { Link } from 'react-router-dom';
import { Radio, Clock, Wrench, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { to12h } from '@/components/ClassSessionScheduleBanner';
import type { TodaySession } from '@/types';

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function minutesLeft(endTime: string, now: Date) {
  return Math.max(0, minutesOf(endTime) - (now.getHours() * 60 + now.getMinutes()));
}

const barColor = (p: number) => (p >= 90 ? 'bg-green-500' : p >= 70 ? 'bg-amber-500' : 'bg-red-500');

/**
 * The class that is running right now: how many people are in the room against how many are expected.
 * When nothing is running it shows the class that just finished (with its final count) and the next one.
 */
export function CurrentClassPanel({
  sessions,
  showCentre = false,
  compact = false,
}: {
  sessions: TodaySession[];
  showCentre?: boolean;
  compact?: boolean;
}) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(t);
  }, []);

  const live = sessions.filter((s) => s.state === 'LIVE');

  if (live.length === 0) {
    // most recently finished class, then the next one
    const finished = [...sessions].filter((s) => s.state === 'COMPLETED' || s.state === 'MISSED').sort((a, b) => b.endTime.localeCompare(a.endTime))[0];
    const upcoming = sessions.filter((s) => s.state === 'UPCOMING').sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
    return (
      <Card className="bg-card/60">
        <CardContent className={cn('flex flex-wrap items-center gap-x-6 gap-y-2', compact ? 'p-3' : 'p-4')}>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Radio className="h-4 w-4" />
            <span className="text-sm font-medium">No class in session</span>
          </div>
          {finished && (
            <div className="text-sm">
              <span className="text-muted-foreground">Last class </span>
              <span className="font-medium">{finished.name}</span>
              {finished.state === 'MISSED' || finished.detected == null ? (
                <span className="text-muted-foreground"> had no readings</span>
              ) : (
                <>
                  <span className="text-muted-foreground">: {finished.isFinal ? 'final count' : 'finalising'} </span>
                  <span className="font-mono font-semibold">{finished.detected}/{finished.expected}</span>
                  {finished.attendancePercent != null && <span className="text-muted-foreground"> ({finished.attendancePercent}%)</span>}
                </>
              )}
            </div>
          )}
          {upcoming && (
            <div className="text-sm text-muted-foreground">
              Next: <span className="font-medium text-foreground">{upcoming.name}</span> at {to12h(upcoming.startTime)}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('grid gap-4', !compact && live.length > 1 && 'md:grid-cols-2')}>
      {live.map((s) => {
        const nowCount = s.liveCount ?? s.detected ?? 0;
        const percent = s.expected > 0 ? Math.min(100, Math.round((nowCount / s.expected) * 100)) : 0;
        const silentFor = s.lastDetectionAt ? Math.round((now.getTime() - new Date(s.lastDetectionAt).getTime()) / 1000) : null;
        const stale = silentFor === null || silentFor > 60;
        const toolsBad = s.toolsTotal > 0 && s.toolsOk < s.toolsTotal;

        return (
          <Card key={`${s.centreId}-${s.classSlotId}`} className="border-green-500/40 bg-gradient-to-br from-green-500/5 via-card to-card shadow-sm">
            <CardContent className={cn(compact ? 'p-4 space-y-3' : 'p-5 space-y-4')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-red-500/10 text-red-600 border-red-500/30 gap-1" variant="outline">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                      LIVE CLASS
                    </Badge>
                    <p className="font-semibold truncate">{s.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                    <Clock className="h-3 w-3" />
                    {to12h(s.startTime)} – {to12h(s.endTime)} · ends in {minutesLeft(s.endTime, now)} min
                    {showCentre && <span>· {s.centreName}</span>}
                  </p>
                </div>
                {s.recordId && !compact && (
                  <Link to={`/attendance?record=${s.recordId}`} className="text-xs text-primary hover:underline shrink-0">Details</Link>
                )}
              </div>

              <div>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">People in the room now</p>
                    <p className={cn('font-black font-mono leading-none', compact ? 'text-4xl' : 'text-5xl')}>
                      {nowCount}
                      <span className="text-lg font-semibold text-muted-foreground"> / {s.expected}</span>
                    </p>
                  </div>
                  <span className={cn('font-mono font-bold', compact ? 'text-xl' : 'text-2xl', percent >= 90 ? 'text-green-600' : percent >= 70 ? 'text-amber-600' : 'text-red-600')}>
                    {percent}%
                  </span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden mt-3">
                  <div className={cn('h-full rounded-full transition-all', barColor(percent))} style={{ width: `${percent}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-muted/50 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Average</p>
                  <p className="font-mono font-semibold">{s.detected ?? '-'}</p>
                </div>
                <div className="rounded-md bg-muted/50 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Peak</p>
                  <p className="font-mono font-semibold">{s.peak ?? '-'}</p>
                </div>
                <div className="rounded-md bg-muted/50 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center justify-center gap-1"><Wrench className="h-3 w-3" />Tools</p>
                  <p className={cn('font-mono font-semibold', toolsBad && 'text-red-600')}>{s.toolsTotal > 0 ? `${s.toolsOk}/${s.toolsTotal}` : '-'}</p>
                </div>
              </div>

              {stale ? (
                <p className="text-xs text-amber-600 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {silentFor === null ? 'No readings yet. Is the camera or phone app running?' : `No reading for ${silentFor}s. Check the camera or phone app.`}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                  Updated {silentFor}s ago. The final count is fixed when the class ends.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
