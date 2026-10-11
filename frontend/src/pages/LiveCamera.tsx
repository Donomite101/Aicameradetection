'use client';

/**
 * LiveCameraPage — Full-screen AI person detection view with Start/Stop control
 * Route: /live
 */

import * as React from 'react';
import {
  Video,
  VideoOff,
  Users,
  Activity,
  Wifi,
  WifiOff,
  RefreshCw,
  Power,
  PowerOff,
  ChevronRight,
  CheckCircle2,
  Clock,
  Zap,
  Play,
  Square,
  Loader2,
  Package,
  HardHat,
  Wrench,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { ws } from '@/services/websocket';
import { centresApi, dashboardApi } from '@/services/api';
import { CurrentClassPanel } from '@/components/CurrentClassPanel';
import { to12h, describeNext } from '@/components/ClassSessionScheduleBanner';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

const AI_SERVICE_URL = import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:8000';

interface DetectedItem {
  name: string;
  count: number;
  confidence: number;
}

interface SlotInfo {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  startsAt?: string;
}

interface DetectionEvent {
  timestamp: string;
  count: number;
  confidence: number;
  session: string;
  items?: DetectedItem[];
}

export function LiveCameraPage() {
  const { user } = useAuthStore();
  const centreId = user?.centreId;

  const [count, setCount] = React.useState(0);
  const [confidence, setConfidence] = React.useState(0);
  const [items, setItems] = React.useState<DetectedItem[]>([]);
  const [session, setSession] = React.useState('');
  const [activeSlot, setActiveSlot] = React.useState<SlotInfo | null>(null);
  const [nextSlot, setNextSlot] = React.useState<SlotInfo | null>(null);
  const [autoStarted, setAutoStarted] = React.useState(false);
  const [aiCentreId, setAiCentreId] = React.useState<string | undefined>();
  const [sourceMode, setSourceMode] = React.useState<'webcam' | 'phone'>('webcam');
  const [switching, setSwitching] = React.useState(false);
  const [snapTick, setSnapTick] = React.useState(0);
  const [lastUpdate, setLastUpdate] = React.useState('');
  const [aiOnline, setAiOnline] = React.useState(false);  // Python service reachable
  const [detecting, setDetecting] = React.useState(false); // Camera actively running
  const [wsConnected, setWsConnected] = React.useState(false);
  const [videoError, setVideoError] = React.useState(false);
  const [history, setHistory] = React.useState<DetectionEvent[]>([]);
  const [framesProcessed, setFramesProcessed] = React.useState(0);
  const [pulse, setPulse] = React.useState(false);
  const [toggling, setToggling] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const historyTick = React.useRef(0);
  const pollRef = React.useRef<NodeJS.Timeout>();
  const videoUrl = `${AI_SERVICE_URL}/video_feed`;

  // ── Poll AI status ────────────────────────────────────────────
  const poll = React.useCallback(async () => {
    try {
      const res = await fetch(`${AI_SERVICE_URL}/status`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        setAiOnline(true);
        const mode: 'webcam' | 'phone' = data.sourceMode === 'phone' ? 'phone' : 'webcam';
        setSourceMode(mode);
        // In phone mode "active" means the app has sent a photo recently
        setDetecting(mode === 'phone' ? !!data.phoneActive : (data.active ?? false));
        setCount(data.currentCount ?? 0);
        setConfidence(data.confidence ?? 0);
        setItems(data.items ?? []);
        setSession(data.session ?? '');
        setActiveSlot(data.activeSlot ?? null);
        setNextSlot(data.nextSlot ?? null);
        setAutoStarted(!!data.autoStarted);
        setAiCentreId(data.centreId || undefined);
        setLastUpdate(data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '');
        setFramesProcessed(data.framesProcessed ?? 0);
        if (data.active && data.currentCount > 0) {
          setPulse(true);
          setTimeout(() => setPulse(false), 350);
        }
      } else {
        setAiOnline(false);
        setDetecting(false);
      }
    } catch {
      setAiOnline(false);
      setDetecting(false);
    }

    // Fetch history (not on every 2-second status poll)
    historyTick.current += 1;
    if (historyTick.current % 5 !== 1) return;
    try {
      const res = await fetch(`${AI_SERVICE_URL}/history?limit=30`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const h: DetectionEvent[] = await res.json();
        setHistory(h.reverse());
      }
    } catch { /* ignore */ }
  }, []);

  // ── Start / Stop detection ────────────────────────────────────
  const toggleDetection = async () => {
    setToggling(true);
    try {
      const endpoint = detecting ? '/stop' : '/start';
      const res = await fetch(`${AI_SERVICE_URL}${endpoint}`, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        setDetecting(data.active ?? !detecting);
        if (!data.active) {
          setVideoError(false);
        }
      }
    } catch (err) {
      console.error('Toggle failed:', err);
    } finally {
      setToggling(false);
      // Re-poll after a short delay
      setTimeout(poll, 1000);
    }
  };

  // ── Switch camera source (laptop webcam <-> phone app) ────────
  const switchSource = async (mode: 'webcam' | 'phone') => {
    if (mode === sourceMode || switching) return;
    setSwitching(true);
    try {
      const res = await fetch(`${AI_SERVICE_URL}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) setSourceMode(mode);
    } catch (err) {
      console.error('Switch failed:', err);
    } finally {
      setSwitching(false);
      setTimeout(poll, 500);
    }
  };

  // Phone frames arrive as one photo at a time: refresh the preview every 2 seconds
  React.useEffect(() => {
    if (sourceMode !== 'phone' || !detecting) return;
    const t = setInterval(() => setSnapTick((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, [sourceMode, detecting]);

  // ── Registered tools for the centre being monitored ───────────
  const effectiveCentreId = centreId || aiCentreId;
  const { data: centreData } = useQuery<any>({
    queryKey: ['centre', effectiveCentreId],
    queryFn: () => centresApi.get(effectiveCentreId as string),
    enabled: !!effectiveCentreId,
    staleTime: 60_000,
  });
  // The class running now, with the same numbers the dashboard shows
  const { data: summaryData, refetch: refetchSummary } = useQuery<any>({
    queryKey: ['live-today-sessions', effectiveCentreId],
    queryFn: () => dashboardApi.summary({ days: 1, centreId: effectiveCentreId }),
    enabled: !!effectiveCentreId,
    refetchInterval: 10_000,
  });
  const todaySessions = summaryData?.todaySessions ?? [];
  React.useEffect(() => {
    const unsub = ws.on('attendance:update', () => refetchSummary());
    return () => unsub();
  }, [refetchSummary]);

  const registeredTools: { id: string; name: string; detectClass: string; quantity: number }[] =
    (centreData?.inventory || []).filter((i: any) => i.detectClass);

  // ── WebSocket ─────────────────────────────────────────────────
  React.useEffect(() => {
    const socket = ws.connect();
    setWsConnected(socket.connected);

    const u1 = ws.on('connected', () => setWsConnected(true));
    const u2 = ws.on('disconnected', () => setWsConnected(false));
    const u3 = ws.on('detection:live', (data: any) => {
      if (!centreId || data.centreId === centreId) {
        setCount(data.detectedCount);
        setConfidence(data.confidence ?? 0);
        if (data.items) setItems(data.items);
        setSession(data.session ?? '');
        setLastUpdate(new Date(data.timestamp).toLocaleTimeString());
        setPulse(true);
        setTimeout(() => setPulse(false), 350);
        setHistory(prev => [{
          timestamp: new Date(data.timestamp).toISOString(),
          count: data.detectedCount,
          confidence: data.confidence ?? 0,
          items: data.items,
          session: data.session ?? '',
        }, ...prev].slice(0, 30));
      }
    });

    const u4 = ws.on('infrastructure:update', (data: any) => {
      if ((!centreId || data.centreId === centreId) && data.items) {
        setItems(data.items);
      }
    });

    return () => { u1(); u2(); u3(); u4(); };
  }, [centreId]);

  // ── Polling ───────────────────────────────────────────────────
  React.useEffect(() => {
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => clearInterval(pollRef.current);
  }, [poll]);

  const maxCount = Math.max(...history.map(h => h.count), 1);

  return (
    <div className="flex h-[calc(100vh-72px-3rem)] flex-col gap-3 lg:h-[calc(100vh-72px-4rem)]">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className={cn(
            'h-2.5 w-2.5 rounded-full',
            detecting ? 'bg-green-500 animate-pulse' : aiOnline ? 'bg-yellow-500' : 'bg-red-500'
          )} />
          <span className="font-semibold text-sm">
            {sourceMode === 'phone'
              ? (detecting ? 'Phone Connected' : aiOnline ? 'Waiting for Phone App' : 'AI Service Offline')
              : (detecting ? 'Detection Active' : aiOnline ? 'AI Ready — Camera Off' : 'AI Service Offline')}
          </span>
          <Badge variant="outline" className="text-xs gap-1 hidden sm:flex">
            {wsConnected
              ? <><Wifi className="h-3 w-3 text-green-500" /> Live</>
              : <><WifiOff className="h-3 w-3 text-muted-foreground" /> WS Off</>
            }
          </Badge>
          {activeSlot ? (
            <Badge variant="secondary" className="text-xs gap-1 border-green-500/40">
              <Clock className="h-3 w-3" /> {activeSlot.name} · {to12h(activeSlot.startTime)} – {to12h(activeSlot.endTime)}
              {detecting && <span className="text-green-600 font-semibold">· recording to attendance</span>}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              {nextSlot ? `No class now · next ${nextSlot.name} ${describeNext(nextSlot)}` : 'No class in session'}
              {detecting && ' · live view only, not recorded'}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && detecting && (
            <span className="text-xs text-muted-foreground hidden md:block">
              Updated: {lastUpdate}
            </span>
          )}

          {/* ━━━━ CAMERA SOURCE ━━━━ */}
          <div className="flex rounded-md border overflow-hidden text-xs" role="group" aria-label="Camera source">
            {([['webcam', 'Laptop webcam'], ['phone', 'Phone app']] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                disabled={!aiOnline || switching}
                onClick={() => switchSource(mode)}
                className={cn(
                  'px-3 py-1.5 font-medium transition-colors disabled:opacity-50',
                  sourceMode === mode ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ━━━━ START / STOP BUTTON (webcam only) ━━━━ */}
          {sourceMode === 'webcam' && (
          <Button
            variant={detecting ? 'destructive' : 'default'}
            size="sm"
            onClick={toggleDetection}
            disabled={toggling || !aiOnline}
            className={cn(
              'gap-1.5 font-semibold min-w-[140px]',
              !detecting && aiOnline && 'bg-green-600 hover:bg-green-700 text-white'
            )}
          >
            {toggling ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> {detecting ? 'Stopping...' : 'Starting...'}</>
            ) : detecting ? (
              <><Square className="h-4 w-4" /> Stop Camera</>
            ) : (
              <><Play className="h-4 w-4" /> Start Camera</>
            )}
          </Button>
          )}

          <Button variant="ghost" size="sm" onClick={poll} className="gap-1 h-7 text-xs">
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* ── Left: Video Feed ─────────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="relative flex-1 bg-black rounded-xl overflow-hidden border border-border min-h-0">
            {detecting && !videoError ? (
              <>
                <img
                  ref={imgRef}
                  src={sourceMode === 'phone' ? `${AI_SERVICE_URL}/snapshot?t=${snapTick}` : videoUrl}
                  alt="Live annotated camera feed with YOLOv8 people and tool detection"
                  className="w-full h-full object-contain"
                  onError={() => setVideoError(true)}
                  onLoad={() => setVideoError(false)}
                />
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <div className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                    LIVE
                  </div>
                  <div className="bg-black/60 text-white text-xs px-2 py-0.5 rounded backdrop-blur-sm">
                    YOLOv8 • People &amp; Tool Detection
                  </div>
                </div>
                <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm text-white text-xs px-2 py-1 rounded">
                  {framesProcessed.toLocaleString()} frames
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/10">
                {aiOnline ? (
                  <>
                    <VideoOff className="h-16 w-16 text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium text-muted-foreground">
                      {sourceMode === 'phone' ? 'Waiting for the phone app' : 'Camera is off'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {sourceMode === 'phone'
                        ? <>Open the app and sign in as this centre&apos;s officer. It sends photos while a class is live.</>
                        : nextSlot
                        ? <>Next class: <strong>{nextSlot.name}</strong> {describeNext(nextSlot)}. The camera starts automatically then.</>
                        : <>Click <strong>Start Camera</strong> above to begin AI detection</>}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-3">
                      Manual runs outside a class are shown live but not saved to attendance
                    </p>
                  </>
                ) : (
                  <>
                    <PowerOff className="h-16 w-16 text-muted-foreground/40 mb-4" />
                    <p className="text-lg font-medium text-muted-foreground">
                      AI Service not running
                    </p>
                    <p className="text-sm text-muted-foreground mt-1 text-center max-w-xs">
                      Run <code className="bg-muted px-1.5 py-0.5 rounded text-xs">python ai-service/detector.py</code>
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4 gap-1.5"
                      onClick={() => { setVideoError(false); poll(); }}
                    >
                      <RefreshCw className="h-4 w-4" /> Check Again
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Mini history bar chart */}
          <Card className="flex-shrink-0">
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <Activity className="h-4 w-4 text-primary flex-shrink-0" />
                <div className="flex-1 flex items-end gap-0.5 h-10">
                  {history.slice(0, 20).reverse().map((h, i, arr) => {
                    const pct = Math.max((h.count / maxCount) * 100, 5);
                    const isLatest = i === arr.length - 1;
                    return (
                      <div
                        key={i}
                        className={cn(
                          'flex-1 rounded-sm transition-all duration-300',
                          isLatest ? 'bg-primary' : 'bg-primary/30'
                        )}
                        style={{ height: `${pct}%` }}
                        title={`${h.count} persons at ${new Date(h.timestamp).toLocaleTimeString()}`}
                      />
                    );
                  })}
                  {history.length === 0 && (
                    <span className="text-xs text-muted-foreground mx-auto">
                      {detecting ? 'Waiting for first detection...' : 'Start camera to begin'}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">
                  Last {Math.min(history.length, 20)} detections
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: Stats Panel ───────────────────────────────── */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
          {/* Current class: people in the room vs expected */}
          <CurrentClassPanel sessions={todaySessions} compact />

          {/* Big Count */}
          <Card className="flex-shrink-0">
            <CardContent className="p-5 text-center">
              <Users className="h-8 w-8 text-primary mx-auto mb-2" />
              <div className={cn(
                'text-7xl font-black tabular-nums leading-none transition-all duration-200',
                pulse && 'scale-110 text-green-500',
                !detecting && 'text-muted-foreground/40'
              )}>
                {detecting ? count : '—'}
              </div>
              <p className="text-xs font-medium text-muted-foreground mt-2 uppercase tracking-wider">
                Persons Detected
              </p>
              {confidence > 0 && detecting && (
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Avg Confidence</span>
                    <span className="font-medium">{Math.round(confidence * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${Math.round(confidence * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-2 flex-shrink-0">
            <Card>
              <CardContent className="p-3 text-center">
                <Zap className="h-4 w-4 text-yellow-500 mx-auto mb-1" />
                <p className="text-lg font-bold">{activeSlot ? to12h(activeSlot.endTime) : '—'}</p>
                <p className="text-xs text-muted-foreground">Class ends</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto mb-1" />
                <p className="text-lg font-bold">YOLOv8</p>
                <p className="text-xs text-muted-foreground">Model</p>
              </CardContent>
            </Card>
          </div>

          {/* Equipment & Infrastructure Items */}
          <Card className="flex-shrink-0">
            <CardHeader className="p-3 pb-1.5 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-primary" />
                Equipment / Items
              </CardTitle>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">
                {items.length} {items.length === 1 ? 'type' : 'types'}
              </Badge>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2 italic">
                  {detecting ? 'Scanning for items in room...' : 'Camera standby'}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {items.map((it, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs gap-1 py-0.5 px-2 font-normal">
                      <span className="font-semibold capitalize text-foreground">{it.name}</span>
                      <span className="bg-primary/15 text-primary px-1 rounded text-[10px] font-bold">
                        {it.count}
                      </span>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Registered tools vs what the camera sees right now */}
          {registeredTools.length > 0 && (
            <Card className="flex-shrink-0">
              <CardHeader className="p-3 pb-1.5">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5 text-primary" />
                  Tools vs expected
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-1 space-y-1.5">
                {registeredTools.map((tool) => {
                  const seen = items.find((it) => it.name.toLowerCase() === tool.detectClass.toLowerCase())?.count ?? 0;
                  const ok = detecting && seen >= tool.quantity;
                  return (
                    <div key={tool.id} className="flex items-center justify-between text-xs gap-2">
                      <span className="truncate">{tool.name}</span>
                      <span className={cn('font-mono font-semibold', !detecting ? 'text-muted-foreground' : ok ? 'text-green-600' : 'text-amber-600')}>
                        {detecting ? seen : '—'} / {tool.quantity}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Detection Log */}
          <Card className="flex-1 min-h-0">
            <CardHeader className="p-3 pb-1.5">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Detection Log
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto" style={{ maxHeight: '320px' }}>
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  {detecting ? 'Waiting...' : 'No detections yet'}
                </p>
              ) : (
                <div className="divide-y">
                  {history.map((e, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex items-center justify-between px-3 py-2 text-xs gap-2',
                        i === 0 && 'bg-primary/5'
                      )}
                    >
                      <span className="text-muted-foreground font-mono text-[10px] flex-shrink-0">
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </span>
                      <div className="flex items-center gap-1 font-medium">
                        <Users className="h-3 w-3" />
                        {e.count}
                      </div>
                      <span className="text-muted-foreground flex-shrink-0">
                        {Math.round(e.confidence * 100)}%
                      </span>
                      {i === 0 && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 flex-shrink-0">
                          latest
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Info card */}
          <Card className="flex-shrink-0 bg-muted/30">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                <strong>YOLOv8</strong> • People &amp; tool detection • Reports every 10s.
                Camera is <strong>{detecting ? 'ON' : 'OFF'}</strong>{detecting && autoStarted ? ' (started by class schedule)' : ''}.
              </p>
              <a
                href={`${AI_SERVICE_URL}/status`}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-primary flex items-center gap-0.5 mt-1.5 hover:underline"
              >
                AI Service Status <ChevronRight className="h-2.5 w-2.5" />
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
