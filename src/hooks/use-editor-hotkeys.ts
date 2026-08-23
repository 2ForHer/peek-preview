import { useEffect } from "react";
import { useEditor } from "@/lib/peek/editor-store";

export function useEditorHotkeys() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = useEditor.getState();
      if (state.mode === "home" || state.exporting) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
        return;
      }

      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        state.setPlaying(!state.playing);
        return;
      }

      if (event.key === "Escape") {
        if (state.playing) {
          state.setPlaying(false);
          return;
        }
        if (state.mode === "watermark") {
          state.setMode("preview");
        }
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const delta = event.key === "ArrowLeft" ? -200 : 200;
        state.setPlaying(false);
        state.setOutputMs(Math.max(0, state.outputMs + delta));
        return;
      }

      if (/^[1-9]$/.test(event.key)) {
        const index = Number(event.key) - 1;
        if (index < state.cuts.length) {
          state.setSelectedCut(index);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
