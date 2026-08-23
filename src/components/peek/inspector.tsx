import { type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/lib/peek/editor-store";
import { loadImageFile } from "@/lib/peek/media";
import { useActiveClip, usePreviewPlan } from "@/lib/peek/plan";
import {
  CROP_ASPECTS,
  FULL_CROP,
  LONG_VIDEO_THRESHOLD_MS,
  MAX_SEGMENT_COUNT,
  MAX_SEGMENT_DURATION_MS,
  MIN_SEGMENT_COUNT,
  MIN_SEGMENT_DURATION_MS,
  MIN_TRANSITION_MS,
  SEGMENT_STEP_MS,
  TRANSITION_STEP_MS,
  TRANSITION_TYPES,
  defaultCuts,
  maxSegmentCount,
  maxTransitionMs,
} from "@/lib/peek/timeline";
import { clamp, cn, formatDurationLabel } from "@/lib/utils";

export type InspectorTab = "cuts" | "crop" | "mark";

export function Inspector({
  tab,
  onTab,
  className,
}: {
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col border-t border-line bg-surface lg:border-t-0 lg:border-l",
        className,
      )}
    >
      <div className="p-3 pb-0 sm:px-4">
        <div className="flex rounded-lg bg-bg p-1 ring-1 ring-line">
          {(
            [
              ["cuts", "Cuts"],
              ["crop", "Crop"],
              ["mark", "Mark"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onTab(id)}
              className={cn(
                "h-10 flex-1 rounded-md text-sm font-medium transition-[background-color,color] duration-150 ease-out",
                tab === id ? "bg-elevated text-fg" : "text-muted hover:text-fg",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-16">
        {tab === "cuts" ? <CutsPanel /> : null}
        {tab === "crop" ? <CropPanel /> : null}
        {tab === "mark" ? <MarkPanel /> : null}
      </div>
    </aside>
  );
}

function CutsPanel() {
  const clip = useActiveClip();
  const plan = usePreviewPlan();
  const cuts = useEditor((s) => s.cuts);
  const selectedCut = useEditor((s) => s.selectedCut);
  const setCutCount = useEditor((s) => s.setCutCount);
  const patchCut = useEditor((s) => s.patchCut);
  const setCuts = useEditor((s) => s.setCuts);
  const snapshot = useEditor((s) => s.snapshot);
  const transitionEnabled = useEditor((s) => s.transitionEnabled);
  const setTransitionEnabled = useEditor((s) => s.setTransitionEnabled);
  const transitionType = useEditor((s) => s.transitionType);
  const setTransitionType = useEditor((s) => s.setTransitionType);
  const transitionDurationMs = useEditor((s) => s.transitionDurationMs);
  const setTransitionDurationMs = useEditor((s) => s.setTransitionDurationMs);

  if (!clip) return null;
  const maxCuts = maxSegmentCount(clip.durationMs);
  const cut = cuts[selectedCut] ?? cuts[0];
  const shortest = Math.min(
    ...cuts.map((c) => c.durationMs),
    MAX_SEGMENT_DURATION_MS,
  );
  const transMax = maxTransitionMs(shortest);

  return (
    <div className="flex flex-col gap-5">
      {clip.durationMs > LONG_VIDEO_THRESHOLD_MS ? (
        <p className="text-sm text-muted">
          Long clip — default cuts skip the intro and hold a little off the end.
        </p>
      ) : null}

      <Field label="Segments">
        <div className="flex items-center gap-2">
          <Button
            variant="subtle"
            size="icon-sm"
            aria-label="Fewer cuts"
            disabled={cuts.length <= MIN_SEGMENT_COUNT}
            onClick={() => setCutCount(cuts.length - 1)}
          >
            <Minus className="size-4" />
          </Button>
          <span className="min-w-10 text-center text-sm tabular-nums text-fg">
            {cuts.length}
          </span>
          <Button
            variant="subtle"
            size="icon-sm"
            aria-label="More cuts"
            disabled={cuts.length >= Math.min(MAX_SEGMENT_COUNT, maxCuts)}
            onClick={() => setCutCount(cuts.length + 1)}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() =>
              setCuts(
                defaultCuts(
                  clip.durationMs,
                  cuts.length,
                  cut?.durationMs ?? 1500,
                ),
              )
            }
          >
            Space evenly
          </Button>
        </div>
      </Field>

      {cut ? (
        <>
          <Field
            label={`Cut ${String(selectedCut + 1).padStart(2, "0")} start`}
            value={formatDurationLabel(cut.startMs)}
          >
            <input
              type="range"
              className="peek-range"
              min={0}
              max={Math.max(0, clip.durationMs - cut.durationMs)}
              step={100}
              value={cut.startMs}
              onChange={(event) =>
                patchCut(selectedCut, { startMs: Number(event.target.value) })
              }
              onPointerUp={snapshot}
            />
          </Field>
          <Field label="Cut length" value={formatDurationLabel(cut.durationMs)}>
            <input
              type="range"
              className="peek-range"
              min={MIN_SEGMENT_DURATION_MS}
              max={MAX_SEGMENT_DURATION_MS}
              step={SEGMENT_STEP_MS}
              value={cut.durationMs}
              onChange={(event) =>
                patchCut(selectedCut, {
                  durationMs: Number(event.target.value),
                })
              }
              onPointerUp={snapshot}
            />
            <button
              type="button"
              className="mt-2 text-sm text-muted hover:text-fg"
              onClick={() =>
                setCuts(
                  cuts.map((item) => ({
                    ...item,
                    durationMs: cut.durationMs,
                  })),
                )
              }
            >
              Apply length to all cuts
            </button>
          </Field>
        </>
      ) : null}

      <Field label="Transition">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">Blend between cuts</span>
          <Toggle
            checked={transitionEnabled}
            onChange={setTransitionEnabled}
            label="Enable transitions"
          />
        </div>
        {transitionEnabled ? (
          <div className="mt-3 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              {TRANSITION_TYPES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTransitionType(item.id)}
                  className={cn(
                    "h-10 rounded-md text-sm ring-1 transition-[background-color,box-shadow] duration-150 ease-out",
                    transitionType === item.id
                      ? "bg-elevated text-fg ring-accent"
                      : "bg-bg text-muted ring-line hover:text-fg",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <Field
              label="Blend"
              value={formatDurationLabel(transitionDurationMs)}
            >
              <input
                type="range"
                className="peek-range"
                min={MIN_TRANSITION_MS}
                max={transMax}
                step={TRANSITION_STEP_MS}
                value={clamp(transitionDurationMs, MIN_TRANSITION_MS, transMax)}
                onChange={(event) =>
                  setTransitionDurationMs(Number(event.target.value))
                }
              />
            </Field>
          </div>
        ) : null}
      </Field>

      {plan ? (
        <p className="text-sm text-subtle">
          Preview runs {formatDurationLabel(plan.outputDurationMs)}.
        </p>
      ) : null}
    </div>
  );
}

function CropPanel() {
  const clip = useActiveClip();
  const cropAspect = useEditor((s) => s.cropAspect);
  const setCropAspect = useEditor((s) => s.setCropAspect);
  const setCrop = useEditor((s) => s.setCrop);

  if (!clip) return null;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm leading-relaxed text-muted">
        Drag the frame on the stage. Lock an aspect when you need a story or a
        square.
      </p>
      <Field label="Aspect">
        <div className="grid grid-cols-4 gap-2">
          {CROP_ASPECTS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCropAspect(item.id)}
              className={cn(
                "h-10 rounded-md text-sm ring-1 transition-[background-color,box-shadow] duration-150 ease-out",
                cropAspect === item.id
                  ? "bg-elevated text-fg ring-accent"
                  : "bg-bg text-muted ring-line hover:text-fg",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Field>
      <Button variant="outline" onClick={() => setCrop({ ...FULL_CROP })}>
        Reset crop
      </Button>
    </div>
  );
}

function MarkPanel() {
  const watermark = useEditor((s) => s.watermark);
  const setWatermark = useEditor((s) => s.setWatermark);
  const showWatermark = useEditor((s) => s.showWatermark);
  const setShowWatermark = useEditor((s) => s.setShowWatermark);
  const setError = useEditor((s) => s.setError);

  async function onMark(file: File | undefined) {
    if (!file) return;
    try {
      const loaded = await loadImageFile(file);
      if (watermark.url?.startsWith("blob:")) URL.revokeObjectURL(watermark.url);
      setWatermark({
        image: loaded.image,
        url: loaded.url,
        name: loaded.name,
      });
      setShowWatermark(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not read that image.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted">Show mark on export</span>
        <Toggle
          checked={showWatermark}
          onChange={setShowWatermark}
          label="Show watermark"
        />
      </div>
      <p className="text-sm leading-relaxed text-muted">
        Drag on the stage to place it. Use a PNG or SVG with a clear silhouette.
      </p>
      <label className="flex h-11 cursor-pointer items-center justify-center rounded-md bg-elevated text-sm font-medium text-fg">
        Replace mark
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          onChange={(event) => {
            void onMark(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      <p className="truncate text-xs text-subtle">{watermark.name}</p>
      <Field label="Scale" value={`${Math.round(watermark.scale * 100)}%`}>
        <input
          type="range"
          className="peek-range"
          min={0.35}
          max={2.2}
          step={0.05}
          value={watermark.scale}
          onChange={(event) =>
            setWatermark({ scale: Number(event.target.value) })
          }
        />
      </Field>
      <Field label="Rotate" value={`${Math.round(watermark.rotation)}°`}>
        <input
          type="range"
          className="peek-range"
          min={-180}
          max={180}
          step={1}
          value={watermark.rotation}
          onChange={(event) =>
            setWatermark({ rotation: Number(event.target.value) })
          }
        />
      </Field>
      <Field label="Opacity" value={`${Math.round(watermark.opacity * 100)}%`}>
        <input
          type="range"
          className="peek-range"
          min={0.15}
          max={1}
          step={0.01}
          value={watermark.opacity}
          onChange={(event) =>
            setWatermark({ opacity: Number(event.target.value) })
          }
        />
      </Field>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-11 rounded-full transition-[background-color] duration-150 ease-out",
        checked ? "bg-accent" : "bg-line",
      )}
    >
      <span
        className={cn(
          "absolute top-1 left-1 size-5 rounded-full bg-accent-fg transition-transform duration-150 ease-out",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-fg">{label}</span>
        {value ? (
          <span className="text-xs tabular-nums text-subtle">{value}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
