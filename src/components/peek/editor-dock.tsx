import {
  Crop,
  ImagePlus,
  Minus,
  Move,
  Pause,
  Play,
  Plus,
  Scissors,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/lib/peek/editor-store";
import { loadImageFile } from "@/lib/peek/media";
import { useActiveClip, usePreviewPlan } from "@/lib/peek/plan";
import {
  CROP_ASPECTS,
  FULL_CROP,
  MAX_SEGMENT_DURATION_MS,
  MIN_SEGMENT_COUNT,
  MIN_SEGMENT_DURATION_MS,
  SEGMENT_STEP_MS,
  TRANSITION_TYPES,
  maxSegmentCount,
} from "@/lib/peek/timeline";
import { cn, formatClock, formatDurationLabel } from "@/lib/utils";

export type DockTab = "cuts" | "crop" | "move" | "mark";

const TABS: Array<{
  id: DockTab;
  label: string;
  icon: typeof Scissors;
}> = [
  { id: "cuts", label: "Cuts", icon: Scissors },
  { id: "crop", label: "Crop", icon: Crop },
  { id: "move", label: "Move", icon: Move },
  { id: "mark", label: "Mark", icon: ImagePlus },
];

export function EditorDock({
  tab,
  onTab,
}: {
  tab: DockTab;
  onTab: (tab: DockTab) => void;
}) {
  const clip = useActiveClip();
  const plan = usePreviewPlan();
  const playing = useEditor((s) => s.playing);
  const setPlaying = useEditor((s) => s.setPlaying);
  const outputMs = useEditor((s) => s.outputMs);
  const setOutputMs = useEditor((s) => s.setOutputMs);

  return (
    <div className="shrink-0 border-t border-line bg-bg px-3 pt-2 pb-2">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          disabled={!clip}
          onClick={() => setPlaying(!playing)}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-elevated text-fg transition-[scale] duration-150 ease-out active:not-disabled:scale-[0.96] disabled:opacity-40"
        >
          {playing ? (
            <Pause className="size-4" strokeWidth={1.75} />
          ) : (
            <Play className="ml-0.5 size-4" strokeWidth={1.75} />
          )}
        </button>
        <input
          type="range"
          className="peek-range min-w-0 flex-1"
          min={0}
          max={Math.max(1, plan?.outputDurationMs ?? 1)}
          step={50}
          value={Math.min(outputMs, plan?.outputDurationMs ?? 0)}
          aria-label="Preview time"
          disabled={!plan}
          onChange={(event) => {
            setPlaying(false);
            setOutputMs(Number(event.target.value));
          }}
        />
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {formatClock(outputMs)}
          <span className="text-subtle">
            {" / "}
            {formatClock(plan?.outputDurationMs ?? 0)}
          </span>
        </span>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1">
        {TABS.map((item) => {
          const Icon = item.icon;
          const on = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTab(item.id)}
              className={cn(
                "flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-xs transition-[background-color,color] duration-150 ease-out",
                on ? "bg-elevated text-fg" : "text-subtle",
              )}
            >
              <Icon className="size-4" strokeWidth={1.75} />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2 h-32 overflow-hidden">
        {tab === "cuts" ? <CutsPad /> : null}
        {tab === "crop" ? <CropPad /> : null}
        {tab === "move" ? <MovePad /> : null}
        {tab === "mark" ? <MarkPad /> : null}
      </div>
    </div>
  );
}

function CutsPad() {
  const clip = useActiveClip();
  const cuts = useEditor((s) => s.cuts);
  const selectedCut = useEditor((s) => s.selectedCut);
  const setSelectedCut = useEditor((s) => s.setSelectedCut);
  const setCutCount = useEditor((s) => s.setCutCount);
  const patchCut = useEditor((s) => s.patchCut);
  const snapshot = useEditor((s) => s.snapshot);
  const setOutputMs = useEditor((s) => s.setOutputMs);
  const setPlaying = useEditor((s) => s.setPlaying);
  const transitionType = useEditor((s) => s.transitionType);
  const setTransitionType = useEditor((s) => s.setTransitionType);
  const plan = usePreviewPlan();
  const cut = cuts[selectedCut] ?? cuts[0];
  const maxCuts = clip ? maxSegmentCount(clip.durationMs) : 5;

  function select(index: number) {
    setSelectedCut(index);
    setPlaying(false);
    const start = plan?.segments[index]?.outputStartMs ?? 0;
    setOutputMs(start);
  }

  function step(delta: number) {
    const next = selectedCut + delta;
    if (next >= 0 && next < cuts.length) {
      select(next);
      return;
    }
    if (delta > 0 && cuts.length < maxCuts) {
      setCutCount(cuts.length + 1);
      select(cuts.length);
      return;
    }
    if (delta < 0 && cuts.length > MIN_SEGMENT_COUNT) {
      setCutCount(cuts.length - 1);
    }
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="subtle"
          size="icon-sm"
          aria-label="Previous cut"
          onClick={() => step(-1)}
        >
          <Minus className="size-4" />
        </Button>
        <span className="w-10 text-center text-sm tabular-nums text-fg">
          {cuts.length ? selectedCut + 1 : 1}/{Math.max(cuts.length, 5)}
        </span>
        <Button
          variant="subtle"
          size="icon-sm"
          aria-label="Next cut"
          onClick={() => step(1)}
        >
          <Plus className="size-4" />
        </Button>
        <input
          type="range"
          className="peek-range min-w-0 flex-1"
          min={MIN_SEGMENT_DURATION_MS}
          max={MAX_SEGMENT_DURATION_MS}
          step={SEGMENT_STEP_MS}
          value={cut?.durationMs ?? 1500}
          disabled={!cut}
          aria-label="Cut length"
          onChange={(event) => {
            if (!cut) return;
            patchCut(selectedCut, { durationMs: Number(event.target.value) });
          }}
          onPointerUp={() => snapshot()}
        />
        <span className="w-10 text-right text-xs tabular-nums text-muted">
          {formatDurationLabel(cut?.durationMs ?? 1500)}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-xs text-subtle">
          From {formatClock(cut?.startMs ?? 0)}
        </span>
        <input
          type="range"
          className="peek-range min-w-0 flex-1"
          min={0}
          max={Math.max(0, (clip?.durationMs ?? 0) - (cut?.durationMs ?? 0))}
          step={100}
          value={cut?.startMs ?? 0}
          disabled={!cut || !clip}
          aria-label="Cut start"
          onChange={(event) => {
            patchCut(selectedCut, { startMs: Number(event.target.value) });
          }}
          onPointerUp={() => snapshot()}
        />
      </div>
      <div className="flex min-w-0 items-center gap-1">
        {TRANSITION_TYPES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTransitionType(item.id)}
            className={cn(
              "h-8 min-w-0 flex-1 rounded-md text-xs",
              transitionType === item.id
                ? "bg-elevated text-fg"
                : "text-subtle ring-1 ring-line",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CropPad() {
  const cropAspect = useEditor((s) => s.cropAspect);
  const setCropAspect = useEditor((s) => s.setCropAspect);
  const setCrop = useEditor((s) => s.setCrop);
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-4 gap-1">
        {CROP_ASPECTS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setCropAspect(item.id)}
            className={cn(
              "h-9 rounded-md text-xs",
              cropAspect === item.id
                ? "bg-elevated text-fg"
                : "text-subtle ring-1 ring-line",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="self-start text-sm text-muted"
        onClick={() => {
          setCropAspect("free");
          setCrop({ ...FULL_CROP });
        }}
      >
        Reset crop
      </button>
    </div>
  );
}

function MovePad() {
  return (
    <p className="pt-2 text-sm leading-relaxed text-muted">
      Drag the frame on the stage to reposition the crop.
    </p>
  );
}

function MarkPad() {
  const showWatermark = useEditor((s) => s.showWatermark);
  const setShowWatermark = useEditor((s) => s.setShowWatermark);
  const watermark = useEditor((s) => s.watermark);
  const setWatermark = useEditor((s) => s.setWatermark);

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const loaded = await loadImageFile(file);
    if (watermark.url?.startsWith("blob:")) URL.revokeObjectURL(watermark.url);
    setWatermark({
      image: loaded.image,
      url: loaded.url,
      name: loaded.name,
    });
    setShowWatermark(true);
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg">Show mark</span>
        <button
          type="button"
          role="switch"
          aria-checked={showWatermark}
          onClick={() => setShowWatermark(!showWatermark)}
          className={cn(
            "relative h-7 w-11 rounded-full transition-[background-color] duration-150 ease-out",
            showWatermark ? "bg-accent" : "bg-line",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 size-6 rounded-full bg-bg transition-transform duration-150 ease-out",
              showWatermark && "translate-x-4",
            )}
          />
        </button>
      </div>
      <label className="text-sm text-muted">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          onChange={(event) => {
            void onFile(event.target.files);
            event.target.value = "";
          }}
        />
        Replace mark
      </label>
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-12 shrink-0 text-xs text-subtle">Scale</span>
        <input
          type="range"
          className="peek-range min-w-0 flex-1"
          min={0.3}
          max={2.4}
          step={0.05}
          value={watermark.scale}
          onChange={(event) =>
            setWatermark({ scale: Number(event.target.value) })
          }
        />
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-12 shrink-0 text-xs text-subtle">Opacity</span>
        <input
          type="range"
          className="peek-range min-w-0 flex-1"
          min={0.1}
          max={1}
          step={0.05}
          value={watermark.opacity}
          onChange={(event) =>
            setWatermark({ opacity: Number(event.target.value) })
          }
        />
      </div>
    </div>
  );
}
