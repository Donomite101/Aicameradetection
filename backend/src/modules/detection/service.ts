import { prisma } from '@/shared/database/prisma';
import { config } from '@/config';
import { broadcastAttendanceUpdate, emitToCentre } from '@/shared/websocket/socket';
import { findActiveSlot, toDateKey } from '@/modules/centres/schedule';
import { DetectionReportInput } from './schemas';

export interface ToolSummaryEntry {
  itemId: string;
  name: string;
  detectClass: string;
  expected: number;
  maxDetected: number;
  lastDetected: number;
}

export function parseToolsSummary(raw: string | null | undefined): ToolSummaryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const CAMERA_PRESETS = [
  { prefix: 'webcam', type: 'WEBCAM', defaultName: 'Laptop webcam' },
  { prefix: 'phone', type: 'PHONE', defaultName: 'Phone camera' },
];

/**
 * Find the Camera row a report belongs to, creating it the first time a source reports for a centre.
 * `ref` is either a Camera id, or a source label: "webcam-001" -> Laptop webcam, "phone-..." -> Phone camera.
 */
export async function resolveCamera(centreId: string, ref: string, deviceName?: string) {
  const byId = await prisma.camera.findFirst({ where: { id: ref, centreId } });
  if (byId) return byId;

  const lower = ref.toLowerCase();
  const preset = CAMERA_PRESETS.find((p) => lower.startsWith(p.prefix)) ?? { type: 'IP', defaultName: ref };
  const name = (deviceName?.trim() || preset.defaultName).slice(0, 100);

  const existing = await prisma.camera.findFirst({ where: { centreId, type: preset.type, name } });
  if (existing) return existing;
  return prisma.camera.create({ data: { centreId, type: preset.type, name } });
}

/** Tool checks are written at most this often per centre (readings can arrive every few seconds). */
const INFRA_CHECK_MIN_GAP_MS = 30_000;
const lastInfraCheck = new Map<string, number>();

/** If the camera counting a session has been silent this long, another camera may take over. */
const COUNTING_CAMERA_TIMEOUT_MS = 60_000;

/** Allowed gap between expected and detected before a session is flagged. */
export function discrepancyTolerance(expected: number): number {
  return Math.max(config.ATTENDANCE_DISCREPANCY_THRESHOLD, Math.ceil(expected * 0.1));
}

/**
 * Process a detection report from the AI service.
 * 1. Finds the class slot that is live right now (server clock, centre timetable)
 * 2. Outside any slot: broadcast live data only, store nothing
 * 3. Inside a slot: append a snapshot and update peak / avg / min and tool counts
 *    on that slot's AttendanceRecord
 */
export async function handleDetectionReport(data: DetectionReportInput) {
  const { centreId, cameraId: cameraRef, detectedCount, confidence } = data;
  const items = data.items ?? [];
  const now = new Date();

  const centre = await prisma.centre.findUnique({
    where: { id: centreId },
    include: {
      classSlots: { where: { isActive: true } },
      inventory: { where: { isActive: true, detectClass: { not: null } } },
    },
  });
  if (!centre) {
    return { success: false, recorded: false, reason: 'CENTRE_NOT_FOUND' };
  }

  const slot = findActiveSlot(centre.classSlots, now);

  // Register the source as one of the centre's cameras the first time it reports, and mark it seen
  const camera = await resolveCamera(centreId, cameraRef, data.deviceName);
  const cameraId = camera.id;
  await prisma.camera.update({ where: { id: camera.id }, data: { lastSeenAt: now } });

  // Live feed always goes out so the camera page works during demos / outside class
  emitToCentre(centreId, 'detection:live', {
    centreId,
    cameraId,
    cameraName: camera.name,
    cameraType: camera.type,
    detectedCount,
    confidence,
    items,
    session: slot?.name ?? null,
    classSlotId: slot?.id ?? null,
    timestamp: Date.now(),
  });

  if (!slot) {
    return { success: true, recorded: false, reason: 'OUTSIDE_SESSION' };
  }

  const expected = slot.expectedTrainees ?? centre.totalTrainees ?? 0;
  const date = toDateKey(now);

  const outcome = await prisma.$transaction(async (tx) => {
    const existing = await tx.attendanceRecord.findUnique({
      where: { centreId_date_session: { centreId, date, session: slot.name } },
    });

    // One camera counts per class. Readings from a second camera would count the same people twice,
    // so they are ignored unless the counting camera has gone silent.
    if (
      existing?.primaryCameraId &&
      existing.primaryCameraId !== camera.id &&
      existing.lastSeenAt &&
      now.getTime() - existing.lastSeenAt.getTime() < COUNTING_CAMERA_TIMEOUT_MS
    ) {
      return { blocked: existing.primaryCameraId };
    }

    // Tool summary: one entry per registered tool, max count seen during the session
    const previous = parseToolsSummary(existing?.toolsSummary);
    const toolsSummary: ToolSummaryEntry[] = centre.inventory.map((inv) => {
      const seen = items.find((it) => it.name.toLowerCase() === inv.detectClass!.toLowerCase());
      const count = seen?.count ?? 0;
      const prev = previous.find((p) => p.itemId === inv.id);
      return {
        itemId: inv.id,
        name: inv.name,
        detectClass: inv.detectClass!,
        expected: inv.quantity,
        maxDetected: Math.max(prev?.maxDetected ?? 0, count),
        lastDetected: count,
      };
    });

    const n = existing?.sampleCount ?? 0;
    const avg = ((existing?.avgCount ?? 0) * n + detectedCount) / (n + 1);
    const avgConf = ((existing?.confidence ?? 0) * n + confidence) / (n + 1);
    const peak = Math.max(existing?.peakCount ?? 0, detectedCount);
    const min = n === 0 ? detectedCount : Math.min(existing?.minCount ?? detectedCount, detectedCount);
    const detected = Math.round(avg);
    const target = expected > 0 ? expected : existing?.recordedCount ?? 0;
    const discrepancy = detected - target;

    // Status is finalised when the slot ends; a human decision is never overridden
    const locked = existing?.status === 'UNDER_REVIEW' || !!existing?.verifiedBy;

    const fields = {
      classSlotId: slot.id,
      primaryCameraId: camera.id,
      expectedCount: expected,
      detectedCount: detected,
      peakCount: peak,
      avgCount: Math.round(avg * 100) / 100,
      minCount: min,
      sampleCount: n + 1,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
      confidence: avgConf,
      discrepancy,
      toolsSummary: JSON.stringify(toolsSummary),
      ...(locked ? {} : { status: 'PENDING' }),
      // A live reading on an already-closed record means the class is running again (for example the slot was
      // rescheduled). Re-open it so the final count is recomputed when the class really ends.
      ...(existing?.finalizedAt ? { finalizedAt: null, finalCount: null } : {}),
    };

    const saved = existing
      ? await tx.attendanceRecord.update({ where: { id: existing.id }, data: fields })
      : await tx.attendanceRecord.create({
          data: { centreId, date, session: slot.name, recordedCount: 0, ...fields },
        });

    await tx.detectionSnapshot.create({
      data: {
        attendanceRecordId: saved.id,
        cameraId,
        timestamp: now,
        peopleCount: detectedCount,
        confidence,
        items: JSON.stringify(items),
      },
    });

    return { saved };
  });

  if ('blocked' in outcome) {
    const counting = await prisma.camera.findUnique({ where: { id: outcome.blocked }, select: { name: true } });
    return { success: true, recorded: false, reason: 'OTHER_CAMERA_ACTIVE', countingCamera: counting?.name ?? null };
  }
  const record = outcome.saved;

  // Per-tool infrastructure checks (exact class match only), throttled
  const recordInfra = now.getTime() - (lastInfraCheck.get(centreId) ?? 0) >= INFRA_CHECK_MIN_GAP_MS;
  if (recordInfra) lastInfraCheck.set(centreId, now.getTime());
  try {
    for (const inv of recordInfra ? centre.inventory : []) {
      const seen = items.find((it) => it.name.toLowerCase() === inv.detectClass!.toLowerCase());
      await prisma.infrastructureCheck.create({
        data: {
          centreId,
          itemId: inv.id,
          detected: (seen?.count ?? 0) > 0,
          operability: (seen?.count ?? 0) > 0 ? 'FUNCTIONAL' : 'UNKNOWN',
          confidence: seen?.confidence ?? 0,
          personNearby: detectedCount > 0,
          metadata: JSON.stringify({ source: 'ai-detection', cameraId, count: seen?.count ?? 0, classSlotId: slot.id }),
        },
      });
    }
    if (items.length > 0) {
      emitToCentre(centreId, 'infrastructure:update', { centreId, items, timestamp: Date.now() });
    }
  } catch (err) {
    console.error('Failed to record infrastructure checks:', err);
  }

  const wsPayload = {
    centreId,
    cameraId,
    detectedCount: record.detectedCount ?? detectedCount,
    recordedCount: record.recordedCount,
    expectedCount: record.expectedCount,
    peakCount: record.peakCount,
    discrepancy: record.discrepancy ?? 0,
    confidence: record.confidence ?? confidence,
    session: slot.name,
    classSlotId: slot.id,
    status: record.status,
    timestamp: Date.now(),
  };
  broadcastAttendanceUpdate(centreId, wsPayload);

  return {
    success: true,
    recorded: true,
    record: {
      id: record.id,
      session: slot.name,
      classSlotId: slot.id,
      detectedCount: record.detectedCount,
      peakCount: record.peakCount,
      expectedCount: record.expectedCount,
      sampleCount: record.sampleCount,
      status: record.status,
      date: date.toISOString(),
    },
  };
}

/**
 * A phone / edge camera uploads one image. We have the AI service count people and tools,
 * then record the result exactly like a regular detection report (only stored inside a live class slot).
 */
export async function handleFrameUpload(centreId: string, cameraId: string, image: Buffer, deviceName?: string, options: { autorotate?: boolean } = {}) {
  const started = Date.now();
  let analysis: {
    count: number;
    confidence: number;
    items: { name: string; count: number; confidence: number }[];
    detections?: { label: string; confidence: number; box: number[] }[];
    imageSize?: { width: number; height: number };
  };
  try {
    const res = await fetch(`${config.AI_SERVICE_URL}/analyze${options.autorotate === false ? '?autorotate=0' : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: new Uint8Array(image),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      const error: any = new Error(
        res.status === 404
          ? 'The AI service is running old code (no /analyze endpoint). Restart ai-service/detector.py'
          : `AI service rejected the image (${res.status}) ${detail}`.trim()
      );
      error.statusCode = 502;
      throw error;
    }
    analysis = (await res.json()) as typeof analysis;
  } catch (err: any) {
    if (err.statusCode) throw err;
    const error: any = new Error('AI service is not reachable. Start ai-service/detector.py');
    error.statusCode = 503;
    throw error;
  }

  const analysedAt = Date.now();
  const report: any = await handleDetectionReport({
    centreId,
    cameraId,
    deviceName,
    detectedCount: analysis.count,
    confidence: analysis.confidence,
    items: analysis.items,
  });

  return {
    people: analysis.count,
    confidence: analysis.confidence,
    items: analysis.items,
    detections: analysis.detections ?? [], // boxes, normalised 0..1, for the app to draw
    imageSize: analysis.imageSize ?? null,
    recorded: report.recorded ?? false,
    reason: report.reason ?? null,
    countingCamera: report.countingCamera ?? null,
    // where the time went on the server (the upload from the phone is not included)
    timing: { analyseMs: analysedAt - started, recordMs: Date.now() - analysedAt },
    record: report.record ?? null,
  };
}
