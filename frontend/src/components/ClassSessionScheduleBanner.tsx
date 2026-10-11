'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, isToday, isTomorrow } from 'date-fns';
import { centresApi } from '@/services/api';
import type { CentreSchedule, ClassSlot } from '@/types';

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

/** "at 9:00 AM", "tomorrow 9:00 AM" or "Mon 9:00 AM" for the next class start */
export function describeNext(next: { startTime: string; startsAt?: string }) {
  const at = to12h(next.startTime);
  if (!next.startsAt) return `at ${at}`;
  const d = new Date(next.startsAt);
  if (isToday(d)) return `at ${at}`;
  if (isTomorrow(d)) return `tomorrow ${at}`;
  return `${format(d, 'EEE')} ${at}`;
}

type SlotState = 'LIVE' | 'UPCOMING' | 'COMPLETED' | 'NOT_TODAY';

function slotState(slot: ClassSlot, activeId: string | undefined, now: Date): SlotState {
  if (slot.id === activeId) return 'LIVE';
  const days = String(slot.daysOfWeek).split(',').map(Number);
  if (!days.includes(now.getDay())) return 'NOT_TODAY';
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins < toMinutes(slot.startTime) ? 'UPCOMING' : 'COMPLETED';
}

/**
 * Shows a centre's real class slots (from /centres/:id/schedule) with the one that is live right now.
 * Clicking a slot reports it through onSelectSlot so pages can filter by that class window.
 */
export function ClassSessionScheduleBanner({
  centreId,
  centreName,
  selectedSlotId,
  onSelectSlot,
}: {
  centreId?: string;
  centreName?: string;
  selectedSlotId?: string;
  onSelectSlot?: (slotId: string) => void;
}) {
  const { data } = useQuery<CentreSchedule>({
    queryKey: ['centre-schedule', centreId],
    queryFn: () => centresApi.schedule(centreId as string),
    enabled: !!centreId,
    refetchInterval: 30_000,
  });

  if (!centreId) return null;

  const slots = data?.slots ?? [];
  const active = data?.activeSlot ?? null;
  const next = data?.nextSlot ?? null;
  const now = new Date();

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-card via-card to-primary/5 shadow-sm">
      <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl shrink-0">⏰</div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">Class Session Timings</h3>
              {centreName && <Badge variant="outline" className="text-xs">{centreName}</Badge>}
              {active ? (
                <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  Live: {active.name} ({to12h(active.startTime)} – {to12h(active.endTime)})
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {next
                    ? `No class now · next: ${next.name} ${describeNext(next)}`
                    : 'No classes scheduled'}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              The camera counts people and tools only inside these windows
              {onSelectSlot ? ' — click a slot to filter by it' : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto shrink-0">
          {slots.length === 0 && <span className="text-xs text-muted-foreground">No class timings configured for this centre.</span>}
          {slots.map((slot) => {
            const state = slotState(slot, active?.id, now);
            const isSelected = selectedSlotId === slot.id;
            return (
              <button
                key={slot.id}
                type="button"
                disabled={!onSelectSlot}
                onClick={() => onSelectSlot?.(isSelected ? '' : slot.id)}
                className={cn(
                  'flex flex-col p-2.5 rounded-lg border text-left transition-all min-w-[150px]',
                  onSelectSlot ? 'cursor-pointer' : 'cursor-default',
                  isSelected
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                    : state === 'LIVE'
                    ? 'border-green-500/50 bg-green-500/10'
                    : state === 'NOT_TODAY'
                    ? 'border-border opacity-60'
                    : 'border-border hover:bg-accent/60'
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold">{slot.name}</span>
                  {state === 'LIVE' && (
                    <span className="text-[9px] font-bold bg-green-500 text-white px-1.5 rounded-full">LIVE NOW</span>
                  )}
                  {state === 'COMPLETED' && <span className="text-[9px] text-muted-foreground">Done</span>}
                  {state === 'NOT_TODAY' && <span className="text-[9px] text-muted-foreground">Not today</span>}
                </div>
                <span className="text-xs font-mono font-semibold">
                  {to12h(slot.startTime)} – {to12h(slot.endTime)}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
