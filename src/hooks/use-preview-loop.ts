import { type RefObject, useEffect, useRef } from "react";
import { drawComposedFrame, bindSegmentTimes } from "@/lib/peek/compositor";
import { useEditor } from "@/lib/peek/editor-store";
import {
  isNativePreviewAvailable,
  nativeAttach,
  nativeDetach,
  nativeOnPosition,
  nativePause,
  nativePlay,
  nativePrepare,
  nativeRelease,
  nativeSeek,
  nativeSetCrop,
  nativeSetLogo,
  nativeSetNeedsDual,
  watermarkToNativePng,
} from "@/lib/peek/peek-native";
import {
  FULL_CROP,
  buildPlan,
  resolveOutputSize,
} from "@/lib/peek/timeline";

export function usePreviewLoop(options: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  videosRef: RefObject<Array<HTMLVideoElement | null>>;
  cropEditing: boolean;
}) {
  const { canvasRef, videosRef, cropEditing } = options;
  const nativeReady = useRef(false);
  const lastNativePlaying = useRef(false);

  // Native path (Android)
  useEffect(() => {
    if (!isNativePreviewAvailable()) return;

    let cancelled = false;
    let removePos: (() => void) | null = null;

    async function boot() {
      try {
        await nativeAttach();
        if (cancelled) return;
        nativeReady.current = true;

        removePos = nativeOnPosition((ptsUs, isPlaying) => {
          const state = useEditor.getState();
          state.setOutputMs(ptsUs / 1000);
          if (state.playing !== isPlaying) {
            state.setPlaying(isPlaying);
          }
        });
      } catch {
        nativeReady.current = false;
      }
    }

    void boot();

    return () => {
      cancelled = true;
      removePos?.();
      void nativePause();
      void nativeRelease();
      void nativeDetach();
      nativeReady.current = false;
    };
  }, []);

  // Drive native player from editor state
  useEffect(() => {
    if (!isNativePreviewAvailable()) return;

    const unsub = useEditor.subscribe((state, prev) => {
      if (!nativeReady.current) return;

      const clip = state.clips.find((c) => c.id === state.activeClipId);
      if (!clip) return;

      // Prepare when clip changes
      if (state.activeClipId !== prev.activeClipId || !prev.activeClipId) {
        const path = clip.file ? clip.url : clip.url;
        void nativePrepare(path, clip.width, clip.height).then(() => {
          void nativeSetCrop(
            state.crop.left / 100,
            state.crop.top / 100,
            state.crop.right / 100,
            state.crop.bottom / 100,
          );
          if (state.showWatermark && state.watermark.image) {
            const png = watermarkToNativePng(state.watermark.image);
            if (png) {
              void nativeSetLogo({
                pngBase64: png,
                x: state.watermark.x,
                y: state.watermark.y,
                scale: state.watermark.scale,
                rotation: state.watermark.rotation,
                opacity: state.watermark.opacity,
              });
            }
          }
        });
      }

      // Play / pause
      if (state.playing !== prev.playing) {
        if (state.playing) {
          void nativePlay();
          lastNativePlaying.current = true;
        } else {
          void nativePause();
          lastNativePlaying.current = false;
        }
      }

      // Seek when outputMs jumps while paused
      if (!state.playing && Math.abs(state.outputMs - prev.outputMs) > 30) {
        void nativeSeek(state.outputMs * 1000);
      }

      // Crop changes
      if (state.crop !== prev.crop) {
        void nativeSetCrop(
          state.crop.left / 100,
          state.crop.top / 100,
          state.crop.right / 100,
          state.crop.bottom / 100,
        );
      }

      // Watermark changes
      if (
        state.showWatermark !== prev.showWatermark ||
        state.watermark !== prev.watermark
      ) {
        if (state.showWatermark && state.watermark.image) {
          const png = watermarkToNativePng(state.watermark.image);
          if (png) {
            void nativeSetLogo({
              pngBase64: png,
              x: state.watermark.x,
              y: state.watermark.y,
              scale: state.watermark.scale,
              rotation: state.watermark.rotation,
              opacity: state.watermark.opacity,
            });
          }
        } else {
          void nativeSetLogo({});
        }
      }

      // Dual decoder for transitions
      const needsDual =
        state.transitionEnabled && state.cuts.length > 1 && !cropEditing;
      void nativeSetNeedsDual(needsDual);
    });

    return () => unsub();
  }, [cropEditing]);

  // Fallback JS canvas path (web / when native not ready)
  useEffect(() => {
    if (isNativePreviewAvailable() && nativeReady.current) {
      // Native owns the picture; still keep a minimal RAF for UI time if needed
      return;
    }

    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    let outputMs = useEditor.getState().outputMs;

    const tick = (now: number) => {
      const state = useEditor.getState();
      const clip = state.clips.find((c) => c.id === state.activeClipId);
      const canvas = canvasRef.current;
      const videos = videosRef.current;

      if (!clip || !canvas || state.cuts.length < 2) {
        last = now;
        raf = requestAnimationFrame(tick);
        return;
      }

      let plan;
      try {
        plan = buildPlan({
          sourceDurationMs: clip.durationMs,
          cuts: state.cuts,
          transitionEnabled: cropEditing ? false : state.transitionEnabled,
          transitionDurationMs: state.transitionDurationMs,
        });
      } catch {
        last = now;
        raf = requestAnimationFrame(tick);
        return;
      }

      if (state.playing) {
        outputMs += now - last;
        if (outputMs >= plan.outputDurationMs) {
          outputMs %= plan.outputDurationMs;
        }
      } else {
        outputMs = Math.min(
          state.outputMs,
          Math.max(0, plan.outputDurationMs - 1),
        );
      }
      last = now;

      const crop = cropEditing ? FULL_CROP : state.crop;
      const size = resolveOutputSize(clip.width, clip.height, crop);
      if (canvas.width !== size.width) canvas.width = size.width;
      if (canvas.height !== size.height) canvas.height = size.height;

      bindSegmentTimes(videos, plan, outputMs, state.playing);
      for (const video of videos) {
        if (video) video.muted = !state.playing;
      }

      const ctx = canvas.getContext("2d", { alpha: false });
      if (ctx) {
        const mark = state.watermark;
        const watermark =
          !cropEditing &&
          state.showWatermark &&
          mark.image &&
          mark.opacity > 0.01
            ? {
                image: mark.image,
                x: mark.x,
                y: mark.y,
                scale: mark.scale,
                rotation: mark.rotation,
                opacity: mark.opacity,
              }
            : null;
        drawComposedFrame(
          ctx,
          {
            clip,
            plan,
            crop,
            transitionType: state.transitionType,
            videos,
            watermark,
          },
          outputMs,
        );
      }

      if (state.playing && now - lastUi > 80) {
        state.setOutputMs(outputMs);
        lastUi = now;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, videosRef, cropEditing]);
}
