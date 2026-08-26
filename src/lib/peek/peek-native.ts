import { Capacitor, registerPlugin } from "@capacitor/core";

export interface PeekPreviewPlugin {
  attach(): Promise<void>;
  detach(): Promise<void>;
  prepare(options: { path: string; width?: number; height?: number }): Promise<{ durationUs: number }>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(options: { us: number }): Promise<void>;
  setCrop(options: { l: number; t: number; r: number; b: number }): Promise<void>;
  setLogo(options: {
    pngBase64?: string;
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    opacity?: number;
  }): Promise<void>;
  setJoinAlpha(options: { alpha: number }): Promise<void>;
  setNeedsDual(options: { on: boolean }): Promise<void>;
  release(): Promise<void>;
  addListener(
    event: "position" | "error" | "surfaceReady" | "surfaceDestroyed",
    cb: (data: any) => void,
  ): Promise<{ remove: () => void }>;
}

const PeekPreview = registerPlugin<PeekPreviewPlugin>("PeekPreview");

export function isNativePreviewAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function nativeAttach(): Promise<void> {
  if (!isNativePreviewAvailable()) return;
  await PeekPreview.attach();
}

export async function nativeDetach(): Promise<void> {
  if (!isNativePreviewAvailable()) return;
  await PeekPreview.detach();
}

export async function nativePrepare(
  path: string,
  width = 1080,
  height = 1920,
): Promise<number> {
  if (!isNativePreviewAvailable()) return 0;
  const ret = await PeekPreview.prepare({ path, width, height });
  return ret.durationUs;
}

export async function nativePlay(): Promise<void> {
  if (!isNativePreviewAvailable()) return;
  await PeekPreview.play();
}

export async function nativePause(): Promise<void> {
  if (!isNativePreviewAvailable()) return;
  await PeekPreview.pause();
}

export async function nativeSeek(us: number): Promise<void> {
  if (!isNativePreviewAvailable()) return;
  await PeekPreview.seek({ us });
}

export async function nativeSetCrop(
  l: number,
  t: number,
  r: number,
  b: number,
): Promise<void> {
  if (!isNativePreviewAvailable()) return;
  await PeekPreview.setCrop({ l, t, r, b });
}

export async function nativeSetLogo(options: {
  pngBase64?: string;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
}): Promise<void> {
  if (!isNativePreviewAvailable()) return;
  await PeekPreview.setLogo(options);
}

export async function nativeSetJoinAlpha(alpha: number): Promise<void> {
  if (!isNativePreviewAvailable()) return;
  await PeekPreview.setJoinAlpha({ alpha });
}

export async function nativeSetNeedsDual(on: boolean): Promise<void> {
  if (!isNativePreviewAvailable()) return;
  await PeekPreview.setNeedsDual({ on });
}

export async function nativeRelease(): Promise<void> {
  if (!isNativePreviewAvailable()) return;
  await PeekPreview.release();
}

export function nativeOnPosition(
  cb: (ptsUs: number, playing: boolean) => void,
): () => void {
  if (!isNativePreviewAvailable()) return () => undefined;
  let handle: { remove: () => void } | null = null;
  void PeekPreview.addListener("position", (data) => {
    cb(Number(data.ptsUs) || 0, !!data.playing);
  }).then((h) => {
    handle = h;
  });
  return () => {
    handle?.remove();
  };
}

/** Convert a canvas / image to PNG base64 (no data-URL prefix) for the native logo path. */
export function watermarkToNativePng(
  image: CanvasImageSource,
  maxSize = 512,
): string | null {
  try {
    const canvas = document.createElement("canvas");
    const w =
      "naturalWidth" in image && typeof image.naturalWidth === "number"
        ? image.naturalWidth
        : "width" in image
          ? Number(image.width)
          : 128;
    const h =
      "naturalHeight" in image && typeof image.naturalHeight === "number"
        ? image.naturalHeight
        : "height" in image
          ? Number(image.height)
          : 128;
    const scale = Math.min(1, maxSize / Math.max(w, h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    const idx = dataUrl.indexOf(",");
    return idx >= 0 ? dataUrl.slice(idx + 1) : null;
  } catch {
    return null;
  }
}

export { PeekPreview };
