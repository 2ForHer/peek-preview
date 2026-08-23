import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { decodeAudio, spliceAudio } from "./audio-splice";
import { drawComposedFrame, type WatermarkDraw } from "./compositor";
import { seekVideo, type LoadedClip } from "./media";
import {
  activeLayers,
  resolveOutputSize,
  sourceTimeSec,
  type CropRect,
  type PreviewPlan,
  type TransitionType,
} from "./timeline";

export interface ExportOptions {
  clip: LoadedClip;
  plan: PreviewPlan;
  crop: CropRect;
  transitionType: TransitionType;
  watermark: WatermarkDraw | null;
  signal?: AbortSignal;
  onProgress?: (ratio: number) => void;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
}

async function prepareVideos(
  videos: HTMLVideoElement[],
  plan: PreviewPlan,
  outputMs: number,
) {
  const layers = activeLayers(plan, outputMs);
  await Promise.all(
    layers.map(async (segment) => {
      const video = videos[segment.index % videos.length];
      if (!video) return;
      await seekVideo(video, sourceTimeSec(segment, outputMs));
    }),
  );
}

function attachSource(url: string): HTMLVideoElement {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.src = url;
  return video;
}

async function waitReady(video: HTMLVideoElement) {
  if (video.readyState >= 2) return;
  await new Promise<void>((resolve, reject) => {
    const onOk = () => {
      video.removeEventListener("loadeddata", onOk);
      video.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener("loadeddata", onOk);
      video.removeEventListener("error", onErr);
      reject(new Error("Video failed to load for export."));
    };
    video.addEventListener("loadeddata", onOk);
    video.addEventListener("error", onErr);
  });
}

async function encodeAudioTrack(
  muxer: Muxer<ArrayBufferTarget>,
  buffer: AudioBuffer,
  signal?: AbortSignal,
) {
  if (typeof AudioEncoder === "undefined") return;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (err) => console.warn("audio encode", err),
  });
  encoder.configure({
    codec: "mp4a.40.2",
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
    bitrate: 128_000,
  });
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    buffer.getChannelData(i),
  );
  const hop = 1024;
  for (let i = 0; i < buffer.length; i += hop) {
    throwIfAborted(signal);
    const frames = Math.min(hop, buffer.length - i);
    const planes = channels.map((ch) => ch.slice(i, i + frames));
    const data = new Float32Array(frames * planes.length);
    planes.forEach((plane, c) => data.set(plane, c * frames));
    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate: buffer.sampleRate,
      numberOfFrames: frames,
      numberOfChannels: planes.length,
      timestamp: (i / buffer.sampleRate) * 1_000_000,
      data,
    });
    encoder.encode(audioData);
    audioData.close();
  }
  await encoder.flush();
  encoder.close();
}

async function exportWithWebCodecs(options: ExportOptions): Promise<Blob> {
  const { clip, plan, crop, transitionType, watermark, signal, onProgress } =
    options;
  const size = resolveOutputSize(clip.width, clip.height, crop);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not open a drawing surface.");

  const videos = [attachSource(clip.url), attachSource(clip.url)];
  await Promise.all(videos.map(waitReady));

  const target = new ArrayBufferTarget();
  const audioSource = await decodeAudio(clip.url);
  const spliced = audioSource ? spliceAudio(audioSource, plan) : null;

  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width: size.width,
      height: size.height,
      frameRate: 30,
    },
    audio: spliced
      ? {
          codec: "aac",
          numberOfChannels: spliced.numberOfChannels,
          sampleRate: spliced.sampleRate,
        }
      : undefined,
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      throw err;
    },
  });
  encoder.configure({
    codec: "avc1.42001f",
    width: size.width,
    height: size.height,
    bitrate: 2_400_000,
    framerate: 30,
    avc: { format: "avc" },
    hardwareAcceleration: "prefer-hardware",
  });

  const fps = 30;
  const total = Math.max(1, Math.round((plan.outputDurationMs / 1000) * fps));
  const frameDuration = 1_000_000 / fps;

  try {
    for (let i = 0; i < total; i += 1) {
      throwIfAborted(signal);
      const outputMs = (i / fps) * 1000;
      await prepareVideos(videos, plan, outputMs);
      drawComposedFrame(
        ctx,
        {
          clip,
          plan,
          crop,
          transitionType,
          videos,
          watermark,
        },
        outputMs,
      );
      const frame = new VideoFrame(canvas, {
        timestamp: i * frameDuration,
        duration: frameDuration,
      });
      encoder.encode(frame, { keyFrame: i % 30 === 0 });
      frame.close();
      onProgress?.(i / total);
    }
    await encoder.flush();
    if (spliced) await encodeAudioTrack(muxer, spliced, signal);
    muxer.finalize();
    onProgress?.(1);
    return new Blob([target.buffer], { type: "video/mp4" });
  } finally {
    try {
      encoder.close();
    } catch {
      /* already closed */
    }
    for (const video of videos) {
      video.removeAttribute("src");
      video.load();
    }
  }
}

async function exportWithRecorder(options: ExportOptions): Promise<Blob> {
  const { clip, plan, crop, transitionType, watermark, signal, onProgress } =
    options;
  const size = resolveOutputSize(clip.width, clip.height, crop);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not open a drawing surface.");

  const videos = [attachSource(clip.url), attachSource(clip.url)];
  await Promise.all(videos.map(waitReady));

  const canvasStream = canvas.captureStream(30);
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const sourceBuffer = await decodeAudio(clip.url);
  if (sourceBuffer) {
    const spliced = spliceAudio(sourceBuffer, plan);
    const node = audioCtx.createBufferSource();
    node.buffer = spliced;
    node.connect(dest);
    node.start();
  }
  const mixed = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : "video/webm";
  const recorder = new MediaRecorder(mixed, { mimeType: mime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("Recorder failed."));
    recorder.onstop = () =>
      resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
  });

  recorder.start(200);
  const start = performance.now();
  await new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (signal?.aborted) {
        recorder.stop();
        reject(new DOMException("Export cancelled", "AbortError"));
        return;
      }
      const elapsed = performance.now() - start;
      const outputMs = Math.min(elapsed, plan.outputDurationMs);
      void prepareVideos(videos, plan, outputMs).then(() => {
        drawComposedFrame(
          ctx,
          { clip, plan, crop, transitionType, videos, watermark },
          outputMs,
        );
        onProgress?.(outputMs / plan.outputDurationMs);
        if (outputMs >= plan.outputDurationMs - 8) {
          recorder.stop();
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      });
    };
    tick();
  });

  const blob = await done;
  await audioCtx.close();
  for (const video of videos) {
    video.removeAttribute("src");
    video.load();
  }
  return blob;
}

export async function exportPreview(options: ExportOptions): Promise<Blob> {
  if (typeof VideoEncoder !== "undefined") {
    try {
      return await exportWithWebCodecs(options);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      console.warn("WebCodecs export failed, falling back", error);
    }
  }
  return exportWithRecorder(options);
}
