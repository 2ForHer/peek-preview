import { clamp, smoothstep } from "@/lib/utils";
import {
  activeLayers,
  resolveCrop,
  sourceTimeSec,
  type CropRect,
  type PreviewPlan,
  type Segment,
  type TransitionType,
} from "./timeline";
import { cropForRotation } from "./video-rotation";
import type { LoadedClip } from "./media";

export interface WatermarkDraw {
  image: CanvasImageSource;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export interface ComposeOptions {
  clip: LoadedClip;
  plan: PreviewPlan;
  crop: CropRect;
  transitionType: TransitionType;
  videos: Array<HTMLVideoElement | null>;
  watermark: WatermarkDraw | null;
}

export function drawOrientedVideo(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  clip: LoadedClip,
  crop: CropRect,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  if (video.readyState < 2 || video.videoWidth < 2) return;
  const orientedCrop = cropForRotation(crop, clip.rotation);
  const src = resolveCrop(orientedCrop, video.videoWidth, video.videoHeight);
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();
  ctx.translate(dx + dw / 2, dy + dh / 2);
  if (clip.rotation) ctx.rotate((clip.rotation * Math.PI) / 180);
  const destW = clip.rotation === 90 || clip.rotation === 270 ? dh : dw;
  const destH = clip.rotation === 90 || clip.rotation === 270 ? dw : dh;
  ctx.drawImage(
    video,
    src.x,
    src.y,
    src.w,
    src.h,
    -destW / 2,
    -destH / 2,
    destW,
    destH,
  );
  ctx.restore();
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  clip: LoadedClip,
  crop: CropRect,
  width: number,
  height: number,
  alpha: number,
  type: TransitionType | "none",
  amount: number,
) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(width / 2, height / 2);
  if (type === "slide") {
    ctx.translate((1 - amount) * width, 0);
  } else if (type === "zoom-blend") {
    const scale = 1.12 - 0.12 * amount;
    ctx.scale(scale, scale);
  } else if (type === "twist") {
    ctx.rotate(((1 - amount) * 11 * Math.PI) / 180);
    const scale = 1.04 - 0.04 * amount;
    ctx.scale(scale, scale);
  }
  ctx.translate(-width / 2, -height / 2);
  drawOrientedVideo(ctx, video, clip, crop, 0, 0, width, height);
  ctx.restore();
}

export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  mark: WatermarkDraw,
  width: number,
  height: number,
) {
  const img = mark.image;
  const iw =
    "naturalWidth" in img && typeof img.naturalWidth === "number"
      ? img.naturalWidth
      : "width" in img && typeof img.width === "number"
        ? Number(img.width)
        : 128;
  const ih =
    "naturalHeight" in img && typeof img.naturalHeight === "number"
      ? img.naturalHeight
      : "height" in img && typeof img.height === "number"
        ? Number(img.height)
        : 128;
  if (iw < 1 || ih < 1) return;
  const base = Math.min(width, height) * 0.28 * mark.scale;
  const ratio = iw / ih;
  const dw = ratio >= 1 ? base : base * ratio;
  const dh = ratio >= 1 ? base / ratio : base;
  ctx.save();
  ctx.globalAlpha = clamp(mark.opacity, 0, 1);
  ctx.translate((mark.x / 100) * width, (mark.y / 100) * height);
  ctx.rotate((mark.rotation * Math.PI) / 180);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

export function drawComposedFrame(
  ctx: CanvasRenderingContext2D,
  options: ComposeOptions,
  outputMs: number,
) {
  const { clip, plan, crop, transitionType, videos, watermark } = options;
  const { width, height } = ctx.canvas;
  ctx.fillStyle = "#0a0a0b";
  ctx.fillRect(0, 0, width, height);

  const layers = activeLayers(plan, outputMs);
  if (layers.length === 0) return;

  const videoFor = (segment: Segment) =>
    videos[segment.index % videos.length] ?? null;

  if (layers.length === 1) {
    const video = videoFor(layers[0]!);
    if (video) {
      drawLayer(ctx, video, clip, crop, width, height, 1, "none", 1);
    }
  } else {
    const outgoing = layers[0]!;
    const incoming = layers[layers.length - 1]!;
    const overlap = Math.max(1, plan.transitionDurationMs);
    const t = clamp((outputMs - incoming.outputStartMs) / overlap, 0, 1);
    const e = smoothstep(t);
    const outVideo = videoFor(outgoing);
    const inVideo = videoFor(incoming);
    if (outVideo) {
      drawLayer(ctx, outVideo, clip, crop, width, height, 1, "none", 1);
    }
    if (inVideo) {
      drawLayer(
        ctx,
        inVideo,
        clip,
        crop,
        width,
        height,
        transitionType === "crossfade" ? e : 1,
        transitionType,
        e,
      );
    }
  }

  if (watermark && watermark.opacity > 0.01) {
    drawWatermark(ctx, watermark, width, height);
  }
}

export function bindSegmentTimes(
  videos: Array<HTMLVideoElement | null>,
  plan: PreviewPlan,
  outputMs: number,
  playing: boolean,
) {
  const layers = activeLayers(plan, outputMs);
  for (const segment of layers) {
    const video = videos[segment.index % videos.length];
    if (!video) continue;
    const target = sourceTimeSec(segment, outputMs);
    const drift = Math.abs(video.currentTime - target);
    if (drift > 0.09) {
      try {
        video.currentTime = target;
      } catch {
        /* ignore */
      }
    }
    if (playing && video.paused) {
      void video.play().catch(() => undefined);
    }
    if (!playing && !video.paused) {
      video.pause();
    }
  }
  for (const video of videos) {
    if (!video) continue;
    const used = layers.some(
      (segment, i) => videos[segment.index % videos.length] === video || i < 0,
    );
    const assigned = layers.some(
      (segment) => videos[segment.index % videos.length] === video,
    );
    if (!assigned && !video.paused) video.pause();
    void used;
  }
}
