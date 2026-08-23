import { Film, ImagePlus, Scissors, Smartphone } from "lucide-react";
import { useEditor } from "@/lib/peek/editor-store";
import { ingestDemoReel } from "@/lib/peek/ingest";

export function HomeScreen({
  showInstall = false,
  onInstall,
}: {
  showInstall?: boolean;
  onInstall?: () => void;
}) {
  const setMode = useEditor((s) => s.setMode);
  const setError = useEditor((s) => s.setError);
  const error = useEditor((s) => s.error);
  const clips = useEditor((s) => s.clips);

  async function openDemo() {
    setError(null);
    try {
      await ingestDemoReel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the demo.");
    }
  }

  return (
    <main className="peek-shell flex w-full flex-col justify-center px-5">
      <div className="mx-auto flex w-full max-w-md flex-col gap-8">
        <header className="flex flex-col gap-4">
          <p className="text-xs tracking-widest text-muted uppercase">
            On-device
          </p>
          <h1 className="text-5xl leading-none font-medium tracking-tight text-fg">
            Peek
            <br />
            Preview
          </h1>
          <p className="max-w-sm text-base leading-relaxed text-muted">
            Sample a long clip. Stamp a mark. Export. Nothing leaves the phone.
          </p>
        </header>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setMode("preview")}
            className="flex items-center gap-4 rounded-xl bg-accent px-5 py-4 text-left text-accent-fg transition-[scale] duration-150 ease-out active:scale-[0.96]"
          >
            <Scissors className="size-6 shrink-0" strokeWidth={1.75} />
            <span className="flex min-w-0 flex-col">
              <span className="text-base font-medium">Preview</span>
              <span className="text-sm opacity-70">Cuts, crop, transitions</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode("watermark")}
            className="flex items-center gap-4 rounded-xl px-5 py-4 text-left text-fg ring-1 ring-line transition-[scale,background-color] duration-150 ease-out hover:bg-elevated active:scale-[0.96]"
          >
            <ImagePlus className="size-6 shrink-0" strokeWidth={1.75} />
            <span className="flex min-w-0 flex-col">
              <span className="text-base font-medium">Watermark</span>
              <span className="text-sm text-muted">
                Burn a logo through a batch
              </span>
            </span>
          </button>
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => void openDemo()}
            className="inline-flex items-center gap-2 text-sm text-muted transition-[color] duration-150 ease-out hover:text-fg"
          >
            <Film className="size-4" strokeWidth={1.75} />
            Open demo reel
          </button>
          {clips.length > 0 ? (
            <button
              type="button"
              onClick={() => setMode("preview")}
              className="text-sm text-muted hover:text-fg"
            >
              Continue editing
            </button>
          ) : null}
          {showInstall ? (
            <button
              type="button"
              onClick={onInstall}
              className="inline-flex items-center gap-2 text-sm text-subtle hover:text-fg"
            >
              <Smartphone className="size-3.5" strokeWidth={1.75} />
              Add to phone
            </button>
          ) : null}
          {error ? (
            <p className="text-center text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
