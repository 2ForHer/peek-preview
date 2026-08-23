import { type RefObject, useEffect } from "react";
import { drawComposedFrame, bindSegmentTimes } from "@/lib/peek/compositor";
import { useEditor } from "@/lib/peek/editor-store";
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

  useEffect(() => {
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
