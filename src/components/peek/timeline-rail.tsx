import { useEffect, useState } from "react";
import { drawOrientedVideo } from "@/lib/peek/compositor";
import { useEditor } from "@/lib/peek/editor-store";
import { seekVideo } from "@/lib/peek/media";
import { useActiveClip, usePreviewPlan } from "@/lib/peek/plan";
import { cn, formatClock } from "@/lib/utils";

export function TimelineRail() {
  const clip = useActiveClip();
  const plan = usePreviewPlan();
  const cuts = useEditor((s) => s.cuts);
  const crop = useEditor((s) => s.crop);
  const selectedCut = useEditor((s) => s.selectedCut);
  const setSelectedCut = useEditor((s) => s.setSelectedCut);
  const setOutputMs = useEditor((s) => s.setOutputMs);
  const setPlaying = useEditor((s) => s.setPlaying);
  const [thumbs, setThumbs] = useState<string[]>([]);

  useEffect(() => {
    if (!clip || cuts.length === 0) {
      setThumbs([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void captureThumbs().then((urls) => {
        if (!cancelled) setThumbs(urls);
      });
    }, 280);

    async function captureThumbs() {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.crossOrigin = "anonymous";
      video.src = clip!.url;
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error("thumb"));
        });
        const urls: string[] = [];
        for (const cut of cuts) {
          await seekVideo(video, cut.startMs / 1000);
          const canvas = document.createElement("canvas");
          const w = 144;
          const h = Math.max(2, Math.round((clip!.height / clip!.width) * w));
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            drawOrientedVideo(ctx, video, clip!, crop, 0, 0, w, h);
            urls.push(canvas.toDataURL("image/jpeg", 0.68));
          } else {
            urls.push("");
          }
        }
        return urls;
      } catch {
        return [];
      } finally {
        video.removeAttribute("src");
        video.load();
      }
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clip, cuts, crop]);

  if (!clip || !plan) return null;

  return (
    <div className="border-t border-line bg-surface px-3 py-3 sm:px-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {plan.segments.map((segment, index) => {
          const selected = index === selectedCut;
          return (
            <button
              key={segment.index}
              type="button"
              onClick={() => {
                setSelectedCut(index);
                setPlaying(false);
                setOutputMs(segment.outputStartMs);
              }}
              className={cn(
                "w-28 shrink-0 overflow-hidden rounded-md text-left ring-1 transition-[box-shadow,background-color] duration-150 ease-out",
                selected ? "ring-accent" : "ring-line hover:ring-muted",
              )}
            >
              <div className="aspect-video bg-bg">
                {thumbs[index] ? (
                  <img
                    src={thumbs[index]}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-subtle">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-xs tabular-nums text-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-xs tabular-nums text-subtle">
                  {formatClock(segment.durationMs)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
