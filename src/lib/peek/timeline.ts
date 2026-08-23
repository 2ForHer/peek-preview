import { clamp, roundDown } from "@/lib/utils";

export const MIN_SEGMENT_COUNT = 2;
export const MAX_SEGMENT_COUNT = 24;
export const MIN_SEGMENT_DURATION_MS = 500;
export const MAX_SEGMENT_DURATION_MS = 10_000;
export const SEGMENT_STEP_MS = 100;
export const MIN_TRANSITION_MS = 100;
export const MAX_TRANSITION_MS = 1_000;
export const TRANSITION_STEP_MS = 50;
export const LONG_VIDEO_THRESHOLD_MS = 5 * 60 * 1000;
export const LONG_VIDEO_INTRO_SKIP_MS = 25_000;
export const END_SAFETY_RESERVE_MS = 15_000;
export const MIN_CROP_SPAN = 8;
export const EXPORT_SOFT_CAP_MS = 45_000;
export const EXPORT_HARD_CAP_MS = 10 * 60 * 1000;

export type TransitionType = "crossfade" | "slide" | "zoom-blend" | "twist";
export type AspectGroup = "portrait" | "landscape" | "square";
export type CropAspect = "free" | "9:16" | "1:1" | "16:9";

export interface CropRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const FULL_CROP: CropRect = {
  left: 0,
  top: 0,
  right: 100,
  bottom: 100,
};

export const CROP_ASPECTS: Array<{
  id: CropAspect;
  label: string;
  ratio: number | null;
}> = [
  { id: "free", label: "Free", ratio: null },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
];

export const TRANSITION_TYPES: Array<{ id: TransitionType; label: string }> = [
  { id: "crossfade", label: "Fade" },
  { id: "slide", label: "Slide" },
  { id: "zoom-blend", label: "Zoom" },
  { id: "twist", label: "Twist" },
];

export interface CutSpec {
  startMs: number;
  durationMs: number;
}

export interface Segment {
  index: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  outputStartMs: number;
  outputEndMs: number;
}

export interface PreviewPlan {
  sourceDurationMs: number;
  segmentCount: number;
  segmentDurationMs: number;
  introSkipMs: number;
  transitionEnabled: boolean;
  transitionDurationMs: number;
  outputDurationMs: number;
  segments: Segment[];
}

export function aspectGroup(width: number, height: number): AspectGroup {
  const r = width / Math.max(1, height);
  if (r < 0.92) return "portrait";
  if (r > 1.08) return "landscape";
  return "square";
}

export function cropIsFull(crop: CropRect): boolean {
  return (
    crop.left <= 0.01 &&
    crop.top <= 0.01 &&
    crop.right >= 99.99 &&
    crop.bottom >= 99.99
  );
}

export function resolveCrop(
  crop: CropRect,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  const left = clamp(crop.left, 0, 100);
  const top = clamp(crop.top, 0, 100);
  const right = clamp(crop.right, left + 1, 100);
  const bottom = clamp(crop.bottom, top + 1, 100);
  const x = (left / 100) * width;
  const y = (top / 100) * height;
  const w = Math.max(2, ((right - left) / 100) * width);
  const h = Math.max(2, ((bottom - top) / 100) * height);
  return { x, y, w, h };
}

export function applyCropAspect(
  crop: CropRect,
  aspect: CropAspect,
  frameW: number,
  frameH: number,
): CropRect {
  const item = CROP_ASPECTS.find((a) => a.id === aspect);
  if (!item?.ratio || frameW <= 0 || frameH <= 0) return crop;
  const target = item.ratio;
  const cx = (crop.left + crop.right) / 2;
  const cy = (crop.top + crop.bottom) / 2;
  let spanX = Math.max(MIN_CROP_SPAN, crop.right - crop.left);
  let spanY = Math.max(MIN_CROP_SPAN, crop.bottom - crop.top);
  const current =
    ((spanX / 100) * frameW) / Math.max(1, (spanY / 100) * frameH);
  if (current > target) {
    spanX = spanY * target * (frameH / frameW);
  } else {
    spanY = (spanX / target) * (frameW / frameH);
  }
  spanX = clamp(spanX, MIN_CROP_SPAN, 100);
  spanY = clamp(spanY, MIN_CROP_SPAN, 100);
  let left = cx - spanX / 2;
  let top = cy - spanY / 2;
  left = clamp(left, 0, 100 - spanX);
  top = clamp(top, 0, 100 - spanY);
  return {
    left,
    top,
    right: left + spanX,
    bottom: top + spanY,
  };
}

export function clampCut(cut: CutSpec, sourceDurationMs: number): CutSpec {
  const durationMs = clamp(
    roundDown(cut.durationMs, SEGMENT_STEP_MS) || MIN_SEGMENT_DURATION_MS,
    MIN_SEGMENT_DURATION_MS,
    Math.min(
      MAX_SEGMENT_DURATION_MS,
      Math.max(MIN_SEGMENT_DURATION_MS, sourceDurationMs),
    ),
  );
  const maxStart = Math.max(0, sourceDurationMs - durationMs);
  const startMs = clamp(roundDown(cut.startMs, 100), 0, maxStart);
  return { startMs, durationMs };
}

export function maxSegmentCount(sourceDurationMs: number): number {
  const slots = Math.floor(sourceDurationMs / MIN_SEGMENT_DURATION_MS);
  return clamp(slots, MIN_SEGMENT_COUNT, MAX_SEGMENT_COUNT);
}

export function defaultCuts(
  sourceDurationMs: number,
  count = 5,
  durationMs = 1500,
): CutSpec[] {
  const n = clamp(count, MIN_SEGMENT_COUNT, maxSegmentCount(sourceDurationMs));
  const usable = Math.max(
    MIN_SEGMENT_DURATION_MS,
    sourceDurationMs -
      (sourceDurationMs > LONG_VIDEO_THRESHOLD_MS ? END_SAFETY_RESERVE_MS : 0),
  );
  const intro =
    sourceDurationMs > LONG_VIDEO_THRESHOLD_MS
      ? Math.min(LONG_VIDEO_INTRO_SKIP_MS, Math.max(0, usable * 0.1))
      : 0;
  const span = Math.max(0, usable - intro);
  const cuts: CutSpec[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0 : i / (n - 1);
    const startMs = intro + t * Math.max(0, span - durationMs);
    cuts.push(clampCut({ startMs, durationMs }, sourceDurationMs));
  }
  return cuts;
}

export function maxTransitionMs(shortestSegmentMs: number): number {
  return clamp(
    roundDown(shortestSegmentMs / 2, TRANSITION_STEP_MS),
    MIN_TRANSITION_MS,
    MAX_TRANSITION_MS,
  );
}

export function resizeCutList(
  cuts: CutSpec[],
  count: number,
  sourceDurationMs: number,
): CutSpec[] {
  const n = clamp(count, MIN_SEGMENT_COUNT, maxSegmentCount(sourceDurationMs));
  if (n === cuts.length) {
    return cuts.map((c) => clampCut(c, sourceDurationMs));
  }
  if (n < cuts.length) {
    return cuts.slice(0, n).map((c) => clampCut(c, sourceDurationMs));
  }
  const base = cuts.length ? cuts : defaultCuts(sourceDurationMs, n);
  const out = base.map((c) => clampCut(c, sourceDurationMs));
  const last = out[out.length - 1] ?? {
    startMs: 0,
    durationMs: 1500,
  };
  while (out.length < n) {
    out.push(
      clampCut(
        {
          startMs: last.startMs + Math.round(last.durationMs * 0.75),
          durationMs: last.durationMs,
        },
        sourceDurationMs,
      ),
    );
  }
  return out;
}

export function buildPlan(options: {
  sourceDurationMs: number;
  cuts: CutSpec[];
  transitionEnabled: boolean;
  transitionDurationMs: number;
}): PreviewPlan {
  const cuts = options.cuts.map((c) => clampCut(c, options.sourceDurationMs));
  if (cuts.length < MIN_SEGMENT_COUNT) {
    throw new Error("Need at least two cuts.");
  }
  const shortest = Math.min(...cuts.map((c) => c.durationMs));
  const transitionDurationMs = options.transitionEnabled
    ? clamp(
        options.transitionDurationMs,
        MIN_TRANSITION_MS,
        maxTransitionMs(shortest),
      )
    : 0;
  const segments: Segment[] = [];
  let outputCursor = 0;
  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i]!;
    const overlap =
      options.transitionEnabled && i > 0 ? transitionDurationMs : 0;
    const outputStartMs = Math.max(0, outputCursor - overlap);
    const outputEndMs = outputStartMs + cut.durationMs;
    segments.push({
      index: i,
      startMs: cut.startMs,
      endMs: cut.startMs + cut.durationMs,
      durationMs: cut.durationMs,
      outputStartMs,
      outputEndMs,
    });
    outputCursor = outputEndMs;
  }
  const avg =
    cuts.reduce((s, c) => s + c.durationMs, 0) / Math.max(1, cuts.length);
  return {
    sourceDurationMs: options.sourceDurationMs,
    segmentCount: segments.length,
    segmentDurationMs: avg,
    introSkipMs: 0,
    transitionEnabled: options.transitionEnabled && transitionDurationMs > 0,
    transitionDurationMs,
    outputDurationMs: outputCursor,
    segments,
  };
}

export function activeLayers(plan: PreviewPlan, outputMs: number): Segment[] {
  const t = clamp(outputMs, 0, Math.max(0, plan.outputDurationMs - 1));
  return plan.segments.filter(
    (seg) => t >= seg.outputStartMs && t < seg.outputEndMs,
  );
}

export function sourceTimeSec(segment: Segment, outputMs: number): number {
  return (segment.startMs + (outputMs - segment.outputStartMs)) / 1000;
}

export function fullClipPlan(durationMs: number): PreviewPlan {
  return {
    sourceDurationMs: durationMs,
    segmentCount: 1,
    segmentDurationMs: durationMs,
    introSkipMs: 0,
    transitionEnabled: false,
    transitionDurationMs: 0,
    outputDurationMs: durationMs,
    segments: [
      {
        index: 0,
        startMs: 0,
        endMs: durationMs,
        durationMs,
        outputStartMs: 0,
        outputEndMs: durationMs,
      },
    ],
  };
}

export function resolveOutputSize(
  frameW: number,
  frameH: number,
  crop: CropRect,
): { width: number; height: number } {
  const src = resolveCrop(crop, frameW, frameH);
  let w = src.w;
  let h = src.h;
  const long = Math.max(w, h);
  if (long > 1280) {
    const s = 1280 / long;
    w *= s;
    h *= s;
  }
  const short = Math.min(w, h);
  if (short > 720) {
    const s = 720 / short;
    w *= s;
    h *= s;
  }
  return {
    width: Math.max(2, Math.round(w / 2) * 2),
    height: Math.max(2, Math.round(h / 2) * 2),
  };
}
