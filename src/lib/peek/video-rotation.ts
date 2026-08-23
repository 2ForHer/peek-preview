import type { CropRect } from "./timeline";

export type VideoRotation = 0 | 90 | 180 | 270;

function readBoxType(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function matrixToRotation(
  a: number,
  b: number,
  c: number,
  d: number,
): VideoRotation {
  const round = (value: number) => Math.round(value / 0x10000);
  const ra = round(a);
  const rb = round(b);
  const rc = round(c);
  const rd = round(d);
  if (ra === 0 && rb === 1 && rc === -1 && rd === 0) return 90;
  if (ra === -1 && rb === 0 && rc === 0 && rd === -1) return 180;
  if (ra === 0 && rb === -1 && rc === 1 && rd === 0) return 270;
  return 0;
}

function scanBoxes(
  view: DataView,
  start: number,
  end: number,
  onBox: (type: string, payloadStart: number, payloadEnd: number) => boolean | void,
): boolean {
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    const type = readBoxType(view, offset + 4);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      const hi = view.getUint32(offset + 8);
      const lo = view.getUint32(offset + 12);
      size = hi * 2 ** 32 + lo;
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) break;
    if (onBox(type, offset + header, offset + size)) return true;
    offset += size;
  }
  return false;
}

function rotationFromTkhd(
  view: DataView,
  start: number,
  end: number,
): VideoRotation | null {
  if (end - start < 84) return null;
  const version = view.getUint8(start);
  const matrixAt = version === 1 ? start + 52 : start + 40;
  if (matrixAt + 36 > end) return null;
  const a = view.getInt32(matrixAt);
  const b = view.getInt32(matrixAt + 4);
  const c = view.getInt32(matrixAt + 12);
  const d = view.getInt32(matrixAt + 16);
  return matrixToRotation(a, b, c, d);
}

export async function readMp4Rotation(source: Blob): Promise<VideoRotation> {
  const slice = source.slice(0, Math.min(source.size, 4 * 1024 * 1024));
  const buffer = await slice.arrayBuffer();
  const view = new DataView(buffer);
  let found: VideoRotation | null = null;

  scanBoxes(view, 0, view.byteLength, (type, start, end) => {
    if (type !== "moov") return;
    scanBoxes(view, start, end, (trakType, trakStart, trakEnd) => {
      if (trakType !== "trak") return;
      scanBoxes(view, trakStart, trakEnd, (tkType, tkStart, tkEnd) => {
        if (tkType !== "tkhd") return;
        found = rotationFromTkhd(view, tkStart, tkEnd);
        return true;
      });
      return found != null;
    });
    return found != null;
  });

  return found ?? 0;
}

export function displaySize(
  rawWidth: number,
  rawHeight: number,
  rotation: VideoRotation,
): { width: number; height: number } {
  if (rotation === 90 || rotation === 270) {
    return { width: rawHeight, height: rawWidth };
  }
  return { width: rawWidth, height: rawHeight };
}

export function canvasRotationNeeded(
  metadataRotation: VideoRotation,
  videoWidth: number,
  videoHeight: number,
): VideoRotation {
  const portraitMeta = metadataRotation === 90 || metadataRotation === 270;
  const portraitFrame = videoHeight > videoWidth;
  if (portraitMeta && portraitFrame) return 0;
  if (!portraitMeta && videoWidth >= videoHeight) return 0;
  return metadataRotation;
}

export function cropForRotation(crop: CropRect, rotation: VideoRotation): CropRect {
  if (rotation === 90) {
    return {
      left: crop.top,
      top: 100 - crop.right,
      right: crop.bottom,
      bottom: 100 - crop.left,
    };
  }
  if (rotation === 180) {
    return {
      left: 100 - crop.right,
      top: 100 - crop.bottom,
      right: 100 - crop.left,
      bottom: 100 - crop.top,
    };
  }
  if (rotation === 270) {
    return {
      left: 100 - crop.bottom,
      top: crop.left,
      right: 100 - crop.top,
      bottom: crop.right,
    };
  }
  return crop;
}
