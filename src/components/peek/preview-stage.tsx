import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { usePreviewLoop } from "@/hooks/use-preview-loop";
import { useEditor } from "@/lib/peek/editor-store";
import { useActiveClip } from "@/lib/peek/plan";
import {
  MIN_CROP_SPAN,
  applyCropAspect,
  type CropAspect,
  type CropRect,
} from "@/lib/peek/timeline";
import { clamp, cn } from "@/lib/utils";

type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export function PreviewStage({
  cropEditing,
  moveOnly = false,
  markEditing = false,
  onChoose,
  onDemo,
  className,
}: {
  cropEditing: boolean;
  moveOnly?: boolean;
  markEditing?: boolean;
  onChoose?: () => void;
  onDemo?: () => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videosRef = useRef<Array<HTMLVideoElement | null>>([null, null]);
  const clip = useActiveClip();
  const crop = useEditor((s) => s.crop);
  const setCrop = useEditor((s) => s.setCrop);
  const snapshot = useEditor((s) => s.snapshot);
  const cropAspect = useEditor((s) => s.cropAspect);
  const setWatermark = useEditor((s) => s.setWatermark);
  const watermark = useEditor((s) => s.watermark);

  usePreviewLoop({ canvasRef, videosRef, cropEditing });

  useEffect(() => {
    if (!clip) return;
    for (const video of videosRef.current) {
      if (!video) continue;
      if (video.getAttribute("src") !== clip.url) {
        video.setAttribute("src", clip.url);
        video.load();
      }
    }
  }, [clip]);

  const ratio = clip
    ? cropEditing
      ? clip.width / Math.max(1, clip.height)
      : ((crop.right - crop.left) * clip.width) /
        Math.max(1, (crop.bottom - crop.top) * clip.height)
    : 9 / 16;

  return (
    <section className={cn("relative min-h-0 flex-1 overflow-hidden bg-bg", className)}>
      {clip ? (
        <div className="peek-stage absolute inset-0">
          <div
            className="absolute top-1/2 left-1/2 overflow-hidden rounded-md bg-surface -translate-x-1/2 -translate-y-1/2"
            style={{
              width: `min(calc(100cqw - 16px), calc((100cqh - 16px) * ${ratio}))`,
              height: `min(calc(100cqh - 16px), calc((100cqw - 16px) / ${ratio}))`,
            }}
          >
            <canvas
              ref={canvasRef}
              className="block h-full w-full bg-bg"
              aria-label="Preview"
            />
            {cropEditing ? (
              <CropOverlay
                crop={crop}
                aspect={cropAspect}
                frameW={clip.width}
                frameH={clip.height}
                moveOnly={moveOnly}
                onChange={(next, record) => setCrop(next, record)}
                onCommit={snapshot}
              />
            ) : null}
            {markEditing ? (
              <WatermarkHit
                x={watermark.x}
                y={watermark.y}
                onMove={(x, y) => setWatermark({ x, y })}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <h2 className="text-2xl font-medium tracking-tight text-fg">
            Add a clip
          </h2>
          <p className="text-sm text-muted">
            On this device. Nothing uploads.
          </p>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={onChoose}
              className="h-11 rounded-full bg-accent px-5 text-sm font-medium text-accent-fg transition-[scale] duration-150 ease-out active:scale-[0.96]"
            >
              Choose
            </button>
            <button
              type="button"
              onClick={onDemo}
              className="h-11 rounded-full px-5 text-sm font-medium text-fg ring-1 ring-line transition-[scale] duration-150 ease-out active:scale-[0.96]"
            >
              Demo
            </button>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0">
        <video
          ref={(node) => {
            videosRef.current[0] = node;
          }}
          playsInline
          preload="auto"
          crossOrigin="anonymous"
        />
        <video
          ref={(node) => {
            videosRef.current[1] = node;
          }}
          playsInline
          preload="auto"
          crossOrigin="anonymous"
        />
      </div>
    </section>
  );
}

function WatermarkHit({
  x,
  y,
  onMove,
}: {
  x: number;
  y: number;
  onMove: (x: number, y: number) => void;
}) {
  const boxRef = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={boxRef}
      type="button"
      className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
      aria-label="Move watermark"
      onPointerDown={(event) => {
        const box = boxRef.current?.getBoundingClientRect();
        if (!box) return;
        const move = (clientX: number, clientY: number) => {
          onMove(
            clamp(((clientX - box.left) / box.width) * 100, 4, 96),
            clamp(((clientY - box.top) / box.height) * 100, 4, 96),
          );
        };
        move(event.clientX, event.clientY);
        const onMovePtr = (e: PointerEvent) => move(e.clientX, e.clientY);
        const onUp = (e: PointerEvent) => {
          move(e.clientX, e.clientY);
          window.removeEventListener("pointermove", onMovePtr);
          window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMovePtr);
        window.addEventListener("pointerup", onUp);
      }}
    >
      <span
        aria-hidden="true"
        className="absolute size-11 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-accent"
        style={{ left: `${x}%`, top: `${y}%` }}
      />
    </button>
  );
}

function CropOverlay({
  crop,
  aspect,
  frameW,
  frameH,
  moveOnly,
  onChange,
  onCommit,
}: {
  crop: CropRect;
  aspect: CropAspect;
  frameW: number;
  frameH: number;
  moveOnly: boolean;
  onChange: (crop: CropRect, record?: boolean) => void;
  onCommit: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    handle: Handle;
    crop: CropRect;
    x: number;
    y: number;
  } | null>(null);

  function begin(event: ReactPointerEvent<HTMLElement>, handle: Handle) {
    event.preventDefault();
    event.stopPropagation();
    const box = rootRef.current?.getBoundingClientRect();
    if (!box) return;
    drag.current = {
      handle,
      crop: { ...crop },
      x: ((event.clientX - box.left) / box.width) * 100,
      y: ((event.clientY - box.top) / box.height) * 100,
    };
    const onMove = (e: PointerEvent) => {
      const start = drag.current;
      const rect = rootRef.current?.getBoundingClientRect();
      if (!start || !rect) return;
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      onChange(
        resizeCrop(
          start.crop,
          start.handle,
          x - start.x,
          y - start.y,
          aspect,
          frameW,
          frameH,
        ),
        false,
      );
    };
    const onUp = () => {
      drag.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      onCommit();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const handles: Handle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

  return (
    <div ref={rootRef} className="absolute inset-0 touch-none">
      <div
        className="absolute cursor-move ring-1 ring-accent"
        style={{
          left: `${crop.left}%`,
          top: `${crop.top}%`,
          width: `${crop.right - crop.left}%`,
          height: `${crop.bottom - crop.top}%`,
          boxShadow: "0 0 0 9999px rgb(10 10 11 / 0.55)",
        }}
        onPointerDown={(event) => begin(event, "move")}
      >
        {moveOnly
          ? null
          : handles.map((handle) => (
              <span
                key={handle}
                className={cn(
                  "absolute size-3 rounded-xs bg-accent",
                  handle === "n" &&
                    "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
                  handle === "s" &&
                    "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
                  handle === "e" &&
                    "top-1/2 right-0 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
                  handle === "w" &&
                    "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
                  handle === "ne" &&
                    "top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
                  handle === "nw" &&
                    "top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
                  handle === "se" &&
                    "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
                  handle === "sw" &&
                    "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
                )}
                onPointerDown={(event) => begin(event, handle)}
              />
            ))}
      </div>
    </div>
  );
}

function resizeCrop(
  start: CropRect,
  handle: Handle,
  dx: number,
  dy: number,
  aspect: CropAspect,
  frameW: number,
  frameH: number,
): CropRect {
  let { left, top, right, bottom } = start;
  if (handle === "move") {
    const w = right - left;
    const h = bottom - top;
    left = clamp(left + dx, 0, 100 - w);
    top = clamp(top + dy, 0, 100 - h);
    return { left, top, right: left + w, bottom: top + h };
  }
  if (handle.includes("w"))
    left = clamp(start.left + dx, 0, right - MIN_CROP_SPAN);
  if (handle.includes("e"))
    right = clamp(start.right + dx, left + MIN_CROP_SPAN, 100);
  if (handle.includes("n"))
    top = clamp(start.top + dy, 0, bottom - MIN_CROP_SPAN);
  if (handle.includes("s"))
    bottom = clamp(start.bottom + dy, top + MIN_CROP_SPAN, 100);
  return applyCropAspect({ left, top, right, bottom }, aspect, frameW, frameH);
}
