import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Plus, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorDock, type DockTab } from "@/components/peek/editor-dock";
import { PreviewStage } from "@/components/peek/preview-stage";
import { useEditorHotkeys } from "@/hooks/use-editor-hotkeys";
import { useEditor } from "@/lib/peek/editor-store";
import { exportPreview } from "@/lib/peek/export-preview";
import { ingestDemoReel, ingestVideoFiles } from "@/lib/peek/ingest";
import { useActiveClip, usePreviewPlan } from "@/lib/peek/plan";
import { filenameFor, saveExportedVideo } from "@/lib/peek/save-export";
import {
  EXPORT_HARD_CAP_MS,
  EXPORT_SOFT_CAP_MS,
  buildPlan,
  defaultCuts,
} from "@/lib/peek/timeline";
import { formatDurationLabel } from "@/lib/utils";
import type { LoadedClip } from "@/lib/peek/media";

export function EditorShell({
  showInstall = false,
  onInstall,
}: {
  showInstall?: boolean;
  onInstall?: () => void;
}) {
  const clip = useActiveClip();
  const plan = usePreviewPlan();
  const clips = useEditor((s) => s.clips);
  const mode = useEditor((s) => s.mode);
  const setMode = useEditor((s) => s.setMode);
  const undo = useEditor((s) => s.undo);
  const history = useEditor((s) => s.history);
  const error = useEditor((s) => s.error);
  const notice = useEditor((s) => s.notice);
  const setError = useEditor((s) => s.setError);
  const setNotice = useEditor((s) => s.setNotice);
  const exporting = useEditor((s) => s.exporting);
  const exportProgress = useEditor((s) => s.exportProgress);
  const confirmLongExport = useEditor((s) => s.confirmLongExport);
  const setConfirmLongExport = useEditor((s) => s.setConfirmLongExport);
  const batch = useEditor((s) => s.batch);
  const addInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<"one" | "all">("one");
  const [tab, setTab] = useState<DockTab>(
    mode === "watermark" ? "mark" : "cuts",
  );

  useEditorHotkeys();

  useEffect(() => {
    if (mode === "watermark") setTab("mark");
  }, [mode]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice, setNotice]);

  function onTab(next: DockTab) {
    setTab(next);
  }

  async function handleAdd(files: FileList | null) {
    if (!files?.length) return;
    try {
      await ingestVideoFiles(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that video.");
    }
  }

  async function handleDemo() {
    try {
      await ingestDemoReel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the demo.");
    }
  }

  function requestExport(kind: "one" | "all") {
    pendingRef.current = kind;
    const duration =
      kind === "all"
        ? clips.reduce((sum, item) => {
            const cuts = defaultCuts(
              item.durationMs,
              useEditor.getState().cuts.length,
              useEditor.getState().cuts[0]?.durationMs ?? 1500,
            );
            try {
              return (
                sum +
                buildPlan({
                  sourceDurationMs: item.durationMs,
                  cuts,
                  transitionEnabled: useEditor.getState().transitionEnabled,
                  transitionDurationMs:
                    useEditor.getState().transitionDurationMs,
                }).outputDurationMs
              );
            } catch {
              return sum;
            }
          }, 0)
        : (plan?.outputDurationMs ?? 0);
    if (duration > EXPORT_HARD_CAP_MS) {
      setError("That preview is too long to encode here.");
      return;
    }
    if (duration > EXPORT_SOFT_CAP_MS) {
      setConfirmLongExport(true);
      return;
    }
    void runExport(kind);
  }

  async function runExport(kind: "one" | "all") {
    const state = useEditor.getState();
    state.setConfirmLongExport(false);
    state.setPlaying(false);
    state.setError(null);
    abortRef.current = new AbortController();
    state.setBatchCancel(false);

    const mark =
      state.showWatermark && state.watermark.image
        ? {
            image: state.watermark.image,
            x: state.watermark.x,
            y: state.watermark.y,
            scale: state.watermark.scale,
            rotation: state.watermark.rotation,
            opacity: state.watermark.opacity,
          }
        : null;

    try {
      if ((kind === "all" || mode === "watermark") && clips.length > 1) {
        await exportBatch(clips, mark, abortRef.current.signal);
      } else if (clip && plan) {
        state.setExporting(true, 0);
        const blob = await exportPreview({
          clip,
          plan,
          crop: state.crop,
          transitionType: state.transitionType,
          watermark: mark,
          signal: abortRef.current.signal,
          onProgress: (ratio) => state.setExporting(true, ratio),
        });
        const result = await saveExportedVideo(
          blob,
          filenameFor(clip.name, blob.type),
        );
        if (result !== "cancelled") {
          state.setNotice(
            result === "shared"
              ? "Preview shared."
              : result === "saved"
                ? "Preview saved."
                : "Preview downloaded.",
          );
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        state.setNotice("Export cancelled.");
      } else {
        state.setError(err instanceof Error ? err.message : "Export failed.");
      }
    } finally {
      state.setExporting(false, null);
      state.setBatch([]);
    }
  }

  async function exportBatch(
    list: LoadedClip[],
    mark: Parameters<typeof exportPreview>[0]["watermark"],
    signal: AbortSignal,
  ) {
    const state = useEditor.getState();
    state.setBatch(list.map((item) => ({ clipId: item.id, status: "pending" })));
    state.setExporting(true, 0);
    for (let i = 0; i < list.length; i += 1) {
      if (signal.aborted || useEditor.getState().batchCancel) break;
      const item = list[i]!;
      state.setBatch(
        useEditor.getState().batch.map((row) =>
          row.clipId === item.id ? { ...row, status: "running" } : row,
        ),
      );
      const cuts = defaultCuts(
        item.durationMs,
        state.cuts.length,
        state.cuts[0]?.durationMs ?? 1500,
      );
      const itemPlan = buildPlan({
        sourceDurationMs: item.durationMs,
        cuts,
        transitionEnabled: state.transitionEnabled,
        transitionDurationMs: state.transitionDurationMs,
      });
      try {
        const blob = await exportPreview({
          clip: item,
          plan: itemPlan,
          crop: state.crop,
          transitionType: state.transitionType,
          watermark: mark,
          signal,
          onProgress: (ratio) =>
            state.setExporting(true, (i + ratio) / list.length),
        });
        const result = await saveExportedVideo(
          blob,
          filenameFor(item.name, blob.type, i),
        );
        state.setBatch(
          useEditor.getState().batch.map((row) =>
            row.clipId === item.id
              ? {
                  ...row,
                  status: result === "cancelled" ? "cancelled" : "done",
                }
              : row,
          ),
        );
      } catch (err) {
        state.setBatch(
          useEditor.getState().batch.map((row) =>
            row.clipId === item.id
              ? {
                  ...row,
                  status: "error",
                  message:
                    err instanceof Error ? err.message : "Export failed.",
                }
              : row,
          ),
        );
      }
    }
    state.setNotice("Batch finished.");
  }

  function cancelExport() {
    useEditor.getState().setBatchCancel(true);
    abortRef.current?.abort();
  }

  const title = mode === "watermark" ? "Watermark" : "Preview";

  return (
    <div className="peek-shell flex w-full max-w-full flex-col overflow-hidden bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-1 px-2">
        <button
          type="button"
          onClick={() => setMode("home")}
          className="flex min-w-0 items-center gap-1 px-2 text-base text-fg"
        >
          <ChevronLeft className="size-5 shrink-0" strokeWidth={1.75} />
          <span className="truncate">{title}</span>
        </button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Undo"
            disabled={history.length === 0}
            onClick={undo}
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Add video"
            onClick={() => addInputRef.current?.click()}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="rounded-full"
            onClick={() =>
              requestExport(mode === "watermark" && clips.length > 1 ? "all" : "one")
            }
            disabled={!clip || exporting}
          >
            Export
          </Button>
        </div>
        <input
          ref={addInputRef}
          type="file"
          accept="video/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            void handleAdd(event.target.files);
            event.target.value = "";
          }}
        />
      </header>

      {(error || notice) && (
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-1 text-sm">
          <p className={error ? "text-danger" : "text-muted"}>
            {error ?? notice}
          </p>
          <button
            type="button"
            className="text-subtle"
            aria-label="Dismiss"
            onClick={() => {
              setError(null);
              setNotice(null);
            }}
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <PreviewStage
        cropEditing={tab === "crop" || tab === "move"}
        moveOnly={tab === "move"}
        markEditing={tab === "mark"}
        onChoose={() => addInputRef.current?.click()}
        onDemo={() => void handleDemo()}
      />

      <EditorDock tab={tab} onTab={onTab} />

      {confirmLongExport ? (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-bg/70 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl bg-surface p-5 ring-1 ring-line">
            <h2 className="text-xl font-medium text-fg">Long encode</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              This preview is {formatDurationLabel(plan?.outputDurationMs ?? 0)}.
              Encoding stays on your device and may take a while.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setConfirmLongExport(false)}
              >
                Cancel
              </Button>
              <Button onClick={() => void runExport(pendingRef.current)}>
                Encode anyway
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {exporting ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-bg/80 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl bg-surface p-5 ring-1 ring-line">
            <h2 className="text-xl font-medium text-fg">Encoding</h2>
            <p className="mt-2 text-sm text-muted">
              Drawing the preview on this device.
            </p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full bg-accent transition-[width] duration-150 ease-out"
                style={{
                  width: `${Math.round((exportProgress ?? 0) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-2 text-sm tabular-nums text-subtle">
              {Math.round((exportProgress ?? 0) * 100)}%
            </p>
            {batch.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1 text-sm text-muted">
                {batch.map((row) => (
                  <li key={row.clipId} className="flex justify-between gap-3">
                    <span className="truncate">
                      {clips.find((c) => c.id === row.clipId)?.name}
                    </span>
                    <span className="tabular-nums text-subtle">{row.status}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-5 flex justify-end">
              <Button variant="outline" onClick={cancelExport}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
