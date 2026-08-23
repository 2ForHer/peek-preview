import { useMemo } from "react";
import { useEditor } from "./editor-store";
import { buildPlan, type PreviewPlan } from "./timeline";

export function useActiveClip() {
  const clips = useEditor((s) => s.clips);
  const activeClipId = useEditor((s) => s.activeClipId);
  return clips.find((c) => c.id === activeClipId) ?? null;
}

export function usePreviewPlan(): PreviewPlan | null {
  const clip = useActiveClip();
  const cuts = useEditor((s) => s.cuts);
  const transitionEnabled = useEditor((s) => s.transitionEnabled);
  const transitionDurationMs = useEditor((s) => s.transitionDurationMs);
  return useMemo(() => {
    if (!clip || cuts.length < 2) return null;
    try {
      return buildPlan({
        sourceDurationMs: clip.durationMs,
        cuts,
        transitionEnabled,
        transitionDurationMs,
      });
    } catch {
      return null;
    }
  }, [clip, cuts, transitionEnabled, transitionDurationMs]);
}
