import { useState } from "react";
import { Smartphone, Share, Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { usePwaInstall } from "@/hooks/use-pwa-install";

type InstallApi = ReturnType<typeof usePwaInstall>;

export function InstallSheet({
  install,
  onClose,
}: {
  install: InstallApi;
  onClose: () => void;
}) {
  const { platform, canPrompt, promptInstall, openIosGuide, shareLink } = install;
  const [shareNote, setShareNote] = useState<string | null>(null);

  async function onShare() {
    const result = await shareLink();
    if (result === "copied") {
      setShareNote("Link copied. Open it in Safari or Chrome on your phone.");
    } else if (result === "shared") {
      setShareNote(
        "Sent. Open that link on your phone, then add it to Home Screen.",
      );
    } else if (result === "failed") {
      setShareNote("Could not copy the link from here.");
    }
  }

  async function onAndroidInstall() {
    const ok = await promptInstall();
    if (ok) onClose();
  }

  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-bg/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-elevated p-5 ring-1 ring-line sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-surface ring-1 ring-line">
            <Smartphone className="size-5 text-accent" strokeWidth={1.75} />
          </span>
          <div className="flex flex-col gap-1">
            <h2 id="install-title" className="font-display text-2xl text-fg">
              Add Peek to your phone
            </h2>
            <p className="text-sm leading-relaxed text-muted">
              Home Screen app. Not the App Store. Opens full screen, and your
              videos stay on the device.
            </p>
          </div>
        </div>

        {platform === "ios" ? (
          <ol className="mt-5 flex flex-col gap-3 text-sm text-muted">
            <Step n="1" body="Open Peek in Safari — not inside another app." />
            <Step
              n="2"
              body="Tap Share in the toolbar, then Add to Home Screen."
            />
            <Step n="3" body="Confirm. Peek lands next to your other apps." />
          </ol>
        ) : platform === "android" ? (
          <ol className="mt-5 flex flex-col gap-3 text-sm text-muted">
            <Step n="1" body="Open Peek in Chrome on your phone." />
            <Step
              n="2"
              body="Tap Install when it appears, or Chrome menu → Install app."
            />
          </ol>
        ) : (
          <p className="mt-5 text-sm leading-relaxed text-muted">
            Open this page in Safari on iPhone or Chrome on Android, then add it
            to the Home Screen. Send the link to your phone first if you are on
            a computer.
          </p>
        )}

        {shareNote ? (
          <p className="mt-4 text-sm text-fg" role="status">
            {shareNote}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          {platform === "ios" ? (
            <Button variant="primary" onClick={openIosGuide}>
              <Plus className="size-4" strokeWidth={1.75} />
              Show Home Screen steps
            </Button>
          ) : null}
          {platform === "android" && canPrompt ? (
            <Button variant="primary" onClick={() => void onAndroidInstall()}>
              <Smartphone className="size-4" strokeWidth={1.75} />
              Install Peek
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => void onShare()}>
            {canNativeShare ? (
              <Share className="size-4" strokeWidth={1.75} />
            ) : (
              <Copy className="size-4" strokeWidth={1.75} />
            )}
            Send link to your phone
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step({ n, body }: { n: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="w-5 shrink-0 tabular-nums text-subtle">{n}</span>
      <span>{body}</span>
    </li>
  );
}
