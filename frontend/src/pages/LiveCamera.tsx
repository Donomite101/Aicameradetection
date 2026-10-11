'use client';

/**
 * Live Camera — the camera is opened by THIS web page (so it can be any laptop), the picture plays right here with
 * no delay, and a small copy is sent to the backend about once a second. The backend's AI counts people and tools,
 * and the boxes it sends back are drawn on top of the live picture. Counts are saved to attendance only while a
 * class is running.
 */

import * as React from 'react';
import {
  VideoOff,
  Users,
  Activity,
  Wifi,
  WifiOff,
  Clock,
  Play,
  Square,
  Loader2,
  Package,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ws } from '@/services/websocket';
import { api, centresApi, dashboardApi } from '@/services/api';
import { aiApi } from '@/services/ai';
import { CurrentClassPanel } from '@/components/CurrentClassPanel';
import { to12h, describeNext } from '@/components/ClassSessionScheduleBanner';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

const SEND_WIDTH = 768;        // the picture sent for counting (the AI looks at ~640 px anyway)
const JPEG_QUALITY = 0.72;
const MIN_GAP_MS = 600;        // never send faster than this; the next picture goes as soon as the last answer is back
const BOX_LIFETIME_MS = 5000;  // boxes disappear if no answer has arrived for this long

interface DetectedItem {
  name: string;
  count: number;
  confidence: number;
}

interface Detection {
  label: string;
  confidence: number;
  box: number[]; // x1, y1, x2, y2 as fractions (0..1) of the picture
}

interface FrameResult {
  people: number;
  confidence: number;
  items: DetectedItem[];
  detections: Detection[];
  recorded: boolean;
  reason?: string | null;
  countingCamera?: string | null;
  timing?: { analyseMs: number; recordMs: number };
}

interface HistoryEntry {
  timestamp: string;
  count: number;
  confidence: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function friendlyCameraError(e: any): string {
  switch (e?.name) {
    case 'NotAllowedError':
      return 'Camera permission is blocked. Click the camera icon in the address bar, allow it, then press Start camera again.';
    case 'NotFoundError':
      return 'No camera was found on this computer.';
    case 'NotReadableError':
      return 'The camera is being used by another program. Close it and try again.';
    default:
      return e?.message || 'Could not open the camera.';
  }
}

export function LiveCameraPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  // Admins pick the centre they are filming; officers always film their own
  const [adminCentreId, setAdminCentreId] = React.useState('');
  const { data: centresData } = useQuery<any>({
    queryKey: ['live-centres'],
    queryFn: () => centresApi.list({ limit: 100 }),
    enabled: isAdmin,
  });
  const centreOptions: { id: string; name: string }[] = centresData?.data || [];
  React.useEffect(() => {
    if (isAdmin && !adminCentreId && centreOptions.length) setAdminCentreId(centreOptions[0].id);
  }, [isAdmin, adminCentreId, centreOptions]);
  const centreId = isAdmin ? adminCentreId : user?.centreId;

  // ── camera state ──────────────────────────────────────────────
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const overlayRef = React.useRef<HTMLCanvasElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = React.useState(() => {
    try { return localStorage.getItem('live-camera-device') || ''; } catch { return ''; }
  });
  const [autoStart, setAutoStart] = React.useState(() => {
    try { return localStorage.getItem('live-camera-autostart') === 'true'; } catch { return false; }
  });

  // ── results ───────────────────────────────────────────────────
  const [count, setCount] = React.useState(0);
  const [confidence, setConfidence] = React.useState(0);
  const [items, setItems] = React.useState<DetectedItem[]>([]);
  const [detections, setDetections] = React.useState<Detection[]>([]);
  const [lastResult, setLastResult] = React.useState<FrameResult | null>(null);
  const [lastResultAt, setLastResultAt] = React.useState(0);
  const [latencyMs, setLatencyMs] = React.useState<number | null>(null);
  const [connectionError, setConnectionError] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [pulse, setPulse] = React.useState(false);
  const [wsConnected, setWsConnected] = React.useState(false);

  // ── schedule + AI service ─────────────────────────────────────
  const { data: schedule } = useQuery<any>({
    queryKey: ['live-schedule', centreId],
    queryFn: () => centresApi.schedule(centreId as string),
    enabled: !!centreId,
    refetchInterval: 15_000,
  });
  const activeSlot = schedule?.activeSlot ?? null;
  const nextSlot = schedule?.nextSlot ?? null;

  const { dataUpdatedAt: aiSeenAt } = useQuery<any>({
    queryKey: ['live-ai-status'],
    queryFn: () => aiApi.status(),
    refetchInterval: 4000,
    retry: false,
  });
  // "online" unless the AI service has not answered for a while (one slow answer is not an outage)
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(t);
  }, []);
  const aiOnline = aiSeenAt > 0 && now - aiSeenAt < 15_000;

  const { data: centreData } = useQuery<any>({
    queryKey: ['centre', centreId],
    queryFn: () => centresApi.get(centreId as string),
    enabled: !!centreId,
    staleTime: 60_000,
  });
  const registeredTools: { id: string; name: string; detectClass: string; quantity: number }[] =
    (centreData?.inventory || []).filter((i: any) => i.detectClass);

  const { data: summaryData, refetch: refetchSummary } = useQuery<any>({
    queryKey: ['live-today-sessions', centreId],
    queryFn: () => dashboardApi.summary({ days: 1, centreId }),
    enabled: !!centreId,
    refetchInterval: 10_000,
  });
  const todaySessions = summaryData?.todaySessions ?? [];

  React.useEffect(() => {
    const socket = ws.connect();
    setWsConnected(socket.connected);
    const u1 = ws.on('connected', () => setWsConnected(true));
    const u2 = ws.on('disconnected', () => setWsConnected(false));
    const u3 = ws.on('attendance:update', () => refetchSummary());
    return () => { u1(); u2(); u3(); };
  }, [refetchSummary]);

  // ── start / stop the camera ───────────────────────────────────
  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    setDetections([]);
  }, []);

  const startCamera = React.useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser only allows the camera on https:// or http://localhost. Open the web app at http://localhost:5173 on this laptop.');
      return;
    }
    setStarting(true);
    setCameraError(null);
    try {
      const video = (id?: string): MediaStreamConstraints => ({
        video: { ...(id ? { deviceId: { exact: id } } : {}), width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(video(deviceId || undefined));
      } catch (e: any) {
        if (deviceId && e?.name === 'OverconstrainedError') stream = await navigator.mediaDevices.getUserMedia(video()); // saved camera is gone
        else throw e;
      }
      streamRef.current = stream;
      const el = videoRef.current;
      if (el) {
        el.srcObject = stream;
        await el.play().catch(() => undefined);
      }
      setCameraOn(true);
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === 'videoinput'));
    } catch (e: any) {
      setCameraError(friendlyCameraError(e));
      setCameraOn(false);
    } finally {
      setStarting(false);
    }
  }, [deviceId]);

  React.useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // Start by itself when this page opens (or a class begins) if the user asked for that
  const autoTried = React.useRef<string>('');
  React.useEffect(() => {
    if (!autoStart || cameraOn || starting || cameraError || !centreId) return;
    const key = `${centreId}:${activeSlot?.id ?? 'none'}`;
    if (autoTried.current === key) return;
    autoTried.current = key;
    startCamera();
  }, [autoStart, cameraOn, starting, cameraError, centreId, activeSlot?.id, startCamera]);

  const toggleAutoStart = (value: boolean) => {
    setAutoStart(value);
    autoTried.current = '';
    try { localStorage.setItem('live-camera-autostart', String(value)); } catch { /* ignore */ }
  };

  const deviceLabel = React.useMemo(() => {
    const d = devices.find((x) => x.deviceId === (deviceId || streamRef.current?.getVideoTracks()[0]?.getSettings().deviceId));
    return d?.label || 'Browser webcam';
  }, [devices, deviceId, cameraOn]);

  // ── the sending loop: grab a picture, send it, draw the answer, repeat ──
  React.useEffect(() => {
    if (!cameraOn || !centreId) return;
    let cancelled = false;
    const canvas = document.createElement('canvas');

    (async () => {
      let failures = 0;
      while (!cancelled) {
        const started = performance.now();
        const video = videoRef.current;
        if (video && video.readyState >= 2 && video.videoWidth) {
          try {
            const w = Math.min(SEND_WIDTH, video.videoWidth);
            canvas.width = w;
            canvas.height = Math.round((w * video.videoHeight) / video.videoWidth);
            canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
            const blob: Blob = await new Promise((resolve, reject) =>
              canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the picture'))), 'image/jpeg', JPEG_QUALITY)
            );
            const result: FrameResult = await api.post('/detection/frame', blob, {
              params: { centreId: isAdmin ? centreId : undefined, cameraId: 'webcam-browser', deviceName: deviceLabel, source: 'browser' },
              headers: { 'Content-Type': 'image/jpeg' },
              timeout: 25_000,
            }) as any;
            if (cancelled) return;
            failures = 0;
            setConnectionError(null);
            setCount(result.people ?? 0);
            setConfidence(result.confidence ?? 0);
            setItems(result.items ?? []);
            setDetections(result.detections ?? []);
            setLastResult(result);
            setLastResultAt(Date.now());
            setLatencyMs(Math.round(performance.now() - started));
            setPulse(true);
            setTimeout(() => setPulse(false), 300);
            setHistory((prev) => [{ timestamp: new Date().toISOString(), count: result.people ?? 0, confidence: result.confidence ?? 0 }, ...prev].slice(0, 30));
          } catch (e: any) {
            if (cancelled) return;
            failures += 1;
            const status = e?.response?.status;
            setConnectionError(
              status === 503 ? 'The AI service is not running on the backend computer.'
              : status === 401 || status === 403 ? 'Signed out or not allowed. Sign in again.'
              : failures >= 2 ? 'Cannot reach the server. Retrying...'
              : null
            );
            await sleep(Math.min(5000, 800 * failures)); // back off a little, but keep trying
          }
        }
        await sleep(Math.max(0, MIN_GAP_MS - (performance.now() - started)));
      }
    })();

    return () => { cancelled = true; };
  }, [cameraOn, centreId, isAdmin, deviceLabel]);

  // Boxes fade out if answers stop arriving
  React.useEffect(() => {
    const t = setInterval(() => {
      if (lastResultAt && Date.now() - lastResultAt > BOX_LIFETIME_MS) setDetections([]);
    }, 1000);
    return () => clearInterval(t);
  }, [lastResultAt]);

  // ── draw the boxes on top of the live picture ─────────────────
  const drawBoxes = React.useCallback(() => {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const rect = video.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!video.videoWidth || detections.length === 0) return;

    // the picture is letterboxed inside the element (object-fit: contain): work out where it really is
    const scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);
    const dw = video.videoWidth * scale;
    const dh = video.videoHeight * scale;
    const ox = (rect.width - dw) / 2;
    const oy = (rect.height - dh) / 2;
    ctx.lineWidth = 3;
    ctx.font = '600 13px Inter, system-ui, sans-serif';
    for (const d of detections) {
      const x = ox + d.box[0] * dw;
      const y = oy + d.box[1] * dh;
      const w = (d.box[2] - d.box[0]) * dw;
      const h = (d.box[3] - d.box[1]) * dh;
      const color = d.label === 'person' ? '#22c55e' : '#fb923c';
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, w, h);
      const text = `${d.label} ${Math.round(d.confidence * 100)}%`;
      const tw = ctx.measureText(text).width + 10;
      ctx.fillStyle = color;
      ctx.fillRect(x, Math.max(oy, y - 20), tw, 20);
      ctx.fillStyle = '#0b1220';
      ctx.fillText(text, x + 5, Math.max(oy, y - 20) + 14);
    }
  }, [detections]);

  React.useEffect(() => {
    drawBoxes();
    const video = videoRef.current;
    if (!video || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(drawBoxes);
    ro.observe(video);
    return () => ro.disconnect();
  }, [drawBoxes]);

  const maxCount = Math.max(...history.map((h) => h.count), 1);
  const saving = !!lastResult?.recorded;
  const recordingNote = !cameraOn ? null
    : lastResult?.reason === 'OTHER_CAMERA_ACTIVE' ? `Another camera (${lastResult.countingCamera ?? 'unknown'}) is counting this class, so this view is not saved.`
    : saving ? 'Saving to attendance'
    : activeSlot ? 'Waiting for the first answer...'
    : 'Preview only: nothing is saved until a class is running';

  return (
    <div className="flex h-[calc(100vh-72px-3rem)] flex-col gap-3 lg:h-[calc(100vh-72px-4rem)]">
      {/* Header bar */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn('h-2.5 w-2.5 rounded-full', cameraOn ? 'bg-green-500 animate-pulse' : 'bg-yellow-500')} />
          <span className="text-sm font-semibold">{cameraOn ? 'Camera on' : 'Camera off'}</span>
          <Badge variant="outline" className={cn('gap-1 text-xs', !aiOnline && 'border-red-300 text-red-600')}>
            {aiOnline ? <><Wifi className="h-3 w-3 text-green-500" /> AI service online</> : <><WifiOff className="h-3 w-3" /> AI service not reachable</>}
          </Badge>
          {!wsConnected && <Badge variant="outline" className="hidden text-xs text-muted-foreground sm:flex">Live updates reconnecting</Badge>}
          {activeSlot ? (
            <Badge variant="secondary" className="gap-1 border-green-500/40 text-xs">
              <Clock className="h-3 w-3" /> Class live: {activeSlot.name} · {to12h(activeSlot.startTime)} – {to12h(activeSlot.endTime)}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {nextSlot ? `No class now · next ${nextSlot.name} ${describeNext(nextSlot)}` : 'No class in session'}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && centreOptions.length > 1 && (
            <select
              value={adminCentreId}
              onChange={(e) => { stopCamera(); setAdminCentreId(e.target.value); }}
              className="h-9 rounded-lg border bg-card px-2 text-xs"
              aria-label="Centre being filmed"
            >
              {centreOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {devices.length > 1 && (
            <select
              value={deviceId || streamRef.current?.getVideoTracks()[0]?.getSettings().deviceId || ''}
              onChange={(e) => {
                setDeviceId(e.target.value);
                try { localStorage.setItem('live-camera-device', e.target.value); } catch { /* ignore */ }
                if (cameraOn) { stopCamera(); setTimeout(() => startCamera(), 200); }
              }}
              className="h-9 max-w-[200px] rounded-lg border bg-card px-2 text-xs"
              aria-label="Camera"
            >
              {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
            </select>
          )}
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={autoStart} onChange={(e) => toggleAutoStart(e.target.checked)} className="h-3.5 w-3.5 accent-current" />
            Start automatically
          </label>
          <Button
            variant={cameraOn ? 'destructive' : 'default'}
            size="sm"
            onClick={cameraOn ? stopCamera : startCamera}
            disabled={starting || !centreId}
            className="min-w-[140px] gap-1.5 font-semibold"
          >
            {starting ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting...</>
              : cameraOn ? <><Square className="h-4 w-4" /> Stop camera</>
              : <><Play className="h-4 w-4" /> Start camera</>}
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* ── Left: camera ─────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-black">
            <video ref={videoRef} autoPlay playsInline muted className={cn('absolute inset-0 h-full w-full object-contain', !cameraOn && 'invisible')} />
            <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />

            {cameraOn && (
              <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
                </div>
                {latencyMs !== null && (
                  <div className="rounded bg-black/60 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
                    count updates every ~{(latencyMs / 1000).toFixed(1)}s
                  </div>
                )}
                {recordingNote && (
                  <div className={cn('rounded px-2 py-0.5 text-xs backdrop-blur-sm', saving ? 'bg-green-600/80 text-white' : 'bg-black/60 text-white')}>
                    {recordingNote}
                  </div>
                )}
              </div>
            )}
            {cameraOn && connectionError && (
              <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 rounded-lg bg-red-600/90 px-3 py-2 text-sm text-white">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {connectionError}
              </div>
            )}

            {!cameraOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center">
                <VideoOff className="mb-3 h-14 w-14 text-muted-foreground/50" />
                <p className="text-lg font-medium text-muted-foreground">Camera is off</p>
                {cameraError ? (
                  <p className="max-w-md text-sm text-red-400">{cameraError}</p>
                ) : activeSlot ? (
                  <p className="max-w-md text-sm text-muted-foreground">
                    A class is live now: <strong>{activeSlot.name}</strong> ({to12h(activeSlot.startTime)} – {to12h(activeSlot.endTime)}).
                    Press <strong>Start camera</strong> so attendance is counted.
                  </p>
                ) : nextSlot ? (
                  <p className="max-w-md text-sm text-muted-foreground">
                    No class right now. Next: <strong>{nextSlot.name}</strong> {describeNext(nextSlot)}. You can start the camera for a preview;
                    nothing is saved until a class is running.
                  </p>
                ) : (
                  <p className="max-w-md text-sm text-muted-foreground">No classes are scheduled for this centre. Press Start camera for a preview.</p>
                )}
              </div>
            )}
          </div>

          <Card className="flex-shrink-0">
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <Activity className="h-4 w-4 flex-shrink-0 text-primary" />
                <div className="flex h-10 flex-1 items-end gap-0.5">
                  {history.slice(0, 20).reverse().map((h, i, arr) => (
                    <div
                      key={i}
                      className={cn('flex-1 rounded-sm transition-all duration-300', i === arr.length - 1 ? 'bg-primary' : 'bg-primary/30')}
                      style={{ height: `${Math.max((h.count / maxCount) * 100, 5)}%` }}
                      title={`${h.count} people at ${new Date(h.timestamp).toLocaleTimeString()}`}
                    />
                  ))}
                  {history.length === 0 && (
                    <span className="mx-auto text-xs text-muted-foreground">{cameraOn ? 'Waiting for the first count...' : 'Start the camera to begin'}</span>
                  )}
                </div>
                <span className="hidden flex-shrink-0 text-xs text-muted-foreground sm:block">Last {Math.min(history.length, 20)} counts</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: numbers ───────────────────────────────────── */}
        <div className="flex w-64 flex-shrink-0 flex-col gap-3 overflow-y-auto">
          <CurrentClassPanel sessions={todaySessions} compact />

          <Card className="flex-shrink-0">
            <CardContent className="p-5 text-center">
              <Users className="mx-auto mb-2 h-8 w-8 text-primary" />
              <div className={cn('text-7xl font-black leading-none tabular-nums transition-all duration-200', pulse && 'scale-110 text-green-500', !cameraOn && 'text-muted-foreground/40')}>
                {cameraOn ? count : '—'}
              </div>
              <p className="mt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">People in the picture</p>
              {confidence > 0 && cameraOn && (
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Avg confidence</span>
                    <span className="font-medium">{Math.round(confidence * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${Math.round(confidence * 100)}%` }} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid flex-shrink-0 grid-cols-2 gap-2">
            <Card>
              <CardContent className="p-3 text-center">
                <Zap className="mx-auto mb-1 h-4 w-4 text-yellow-500" />
                <p className="text-lg font-bold">{latencyMs !== null && cameraOn ? `${(latencyMs / 1000).toFixed(1)}s` : '—'}</p>
                <p className="text-xs text-muted-foreground">Per count</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <CheckCircle2 className={cn('mx-auto mb-1 h-4 w-4', saving ? 'text-green-500' : 'text-muted-foreground')} />
                <p className="text-lg font-bold">{saving ? 'Yes' : 'No'}</p>
                <p className="text-xs text-muted-foreground">Saved</p>
              </CardContent>
            </Card>
          </div>

          <Card className="flex-shrink-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1.5">
              <CardTitle className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Package className="h-3.5 w-3.5 text-primary" /> Equipment / Items
              </CardTitle>
              <Badge variant="outline" className="h-4 px-1.5 font-mono text-[10px]">{items.length} {items.length === 1 ? 'type' : 'types'}</Badge>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              {items.length === 0 ? (
                <p className="py-2 text-center text-xs italic text-muted-foreground">{cameraOn ? 'Scanning for items in the room...' : 'Camera off'}</p>
              ) : (
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                  {items.map((it, idx) => (
                    <Badge key={idx} variant="secondary" className="gap-1 px-2 py-0.5 text-xs font-normal">
                      <span className="font-semibold capitalize text-foreground">{it.name}</span>
                      <span className="rounded bg-primary/15 px-1 text-[10px] font-bold text-primary">{it.count}</span>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {registeredTools.length > 0 && (
            <Card className="flex-shrink-0">
              <CardHeader className="p-3 pb-1.5">
                <CardTitle className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Wrench className="h-3.5 w-3.5 text-primary" /> Tools vs expected
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 p-3 pt-1">
                {registeredTools.map((tool) => {
                  const seen = items.find((it) => it.name.toLowerCase() === tool.detectClass.toLowerCase())?.count ?? 0;
                  const ok = cameraOn && seen >= tool.quantity;
                  return (
                    <div key={tool.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{tool.name}</span>
                      <span className={cn('font-mono font-semibold', !cameraOn ? 'text-muted-foreground' : ok ? 'text-green-600' : 'text-amber-600')}>
                        {cameraOn ? seen : '—'} / {tool.quantity}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Card className="min-h-0 flex-1">
            <CardHeader className="p-3 pb-1.5">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Count log</CardTitle>
            </CardHeader>
            <CardContent className="overflow-y-auto p-0" style={{ maxHeight: '320px' }}>
              {history.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">{cameraOn ? 'Waiting...' : 'No counts yet'}</p>
              ) : (
                <div className="divide-y">
                  {history.map((e, i) => (
                    <div key={i} className={cn('flex items-center justify-between gap-2 px-3 py-2 text-xs', i === 0 && 'bg-primary/5')}>
                      <span className="flex-shrink-0 font-mono text-[10px] text-muted-foreground">{new Date(e.timestamp).toLocaleTimeString()}</span>
                      <div className="flex items-center gap-1 font-medium"><Users className="h-3 w-3" />{e.count}</div>
                      <span className="flex-shrink-0 text-muted-foreground">{Math.round(e.confidence * 100)}%</span>
                      {i === 0 && <Badge variant="outline" className="h-4 flex-shrink-0 px-1 text-[9px]">latest</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex-shrink-0 bg-muted/30">
            <CardContent className="p-3">
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                The camera is opened by this web page. A small picture goes to the server about once a second; people and tools are counted there.
                Counts are saved to attendance only while a class is running.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
