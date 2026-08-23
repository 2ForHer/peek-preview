import { aspectGroup, type AspectGroup } from "./timeline";
import {
  canvasRotationNeeded,
  displaySize,
  readMp4Rotation,
  type VideoRotation,
} from "./video-rotation";

export interface LoadedClip {
  id: string;
  name: string;
  url: string;
  file: File | null;
  durationMs: number;
  width: number;
  height: number;
  rawWidth: number;
  rawHeight: number;
  rotation: VideoRotation;
  aspect: AspectGroup;
  size: number | null;
  hasAudio: boolean;
}

function makeId(): string {
  return `clip_${Math.random().toString(36).slice(2, 10)}`;
}

export function loadVideoFile(file: File): Promise<LoadedClip> {
  const url = URL.createObjectURL(file);
  return probeVideo(url, {
    id: makeId(),
    name: file.name,
    file,
    size: file.size,
  }).catch((error) => {
    URL.revokeObjectURL(url);
    throw error;
  });
}

export async function loadVideoUrl(
  url: string,
  name: string,
): Promise<LoadedClip> {
  return probeVideo(url, {
    id: makeId(),
    name,
    file: null,
    size: null,
  });
}

function probeVideo(
  url: string,
  meta: { id: string; name: string; file: File | null; size: number | null },
): Promise<LoadedClip> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };

    video.onloadedmetadata = () => {
      void (async () => {
        const durationMs = Math.max(0, (video.duration || 0) * 1000);
        const rawWidth = video.videoWidth || 0;
        const rawHeight = video.videoHeight || 0;
        if (!durationMs || !rawWidth || !rawHeight) {
          cleanup();
          reject(new Error("Could not read that video."));
          return;
        }
        let metadataRotation: VideoRotation = 0;
        if (meta.file) {
          try {
            metadataRotation = await readMp4Rotation(meta.file);
          } catch {
            metadataRotation = 0;
          }
        }
        const rotation = canvasRotationNeeded(
          metadataRotation,
          rawWidth,
          rawHeight,
        );
        const oriented = displaySize(rawWidth, rawHeight, rotation);
        const clip: LoadedClip = {
          id: meta.id,
          name: meta.name,
          url,
          file: meta.file,
          durationMs,
          width: oriented.width,
          height: oriented.height,
          rawWidth,
          rawHeight,
          rotation,
          aspect: aspectGroup(oriented.width, oriented.height),
          size: meta.size,
          hasAudio: true,
        };
        cleanup();
        resolve(clip);
      })();
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("This video could not be opened."));
    };

    video.src = url;
  });
}

export function loadImageFile(file: File): Promise<{
  url: string;
  name: string;
  width: number;
  height: number;
  image: HTMLImageElement;
}> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      resolve({
        url,
        name: file.name,
        width: image.naturalWidth,
        height: image.naturalHeight,
        image,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    image.src = url;
  });
}

export async function loadImageUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load mark."));
    image.src = url;
  });
}

export async function seekVideo(
  video: HTMLVideoElement,
  timeSec: number,
): Promise<void> {
  const target = Math.max(0, Math.min(timeSec, (video.duration || 0) - 0.001));
  if (Math.abs(video.currentTime - target) < 0.025) return;
  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("Seek failed."));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    try {
      video.currentTime = target;
    } catch (error) {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(error instanceof Error ? error : new Error("Seek failed."));
    }
  });
}
