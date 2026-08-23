import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallPlatform = "ios" | "android" | "other";

function detectPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function detectInstalled(): boolean {
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  const fullscreen = window.matchMedia("(display-mode: fullscreen)").matches;
  const iosStandalone = Boolean(
    (navigator as Navigator & { standalone?: boolean }).standalone,
  );
  return standalone || fullscreen || iosStandalone;
}

export function usePwaInstall() {
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>("other");
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setInstalled(detectInstalled());
    setPlatform(detectPlatform());

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    setPromptEvent(null);
    return outcome === "accepted";
  }

  function openIosGuide() {
    window.location.assign("/?install=1&platform=ios");
  }

  async function shareLink() {
    const url = `${window.location.origin}/`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Peek Preview",
          text: "On-device video preview editor",
          url,
        });
        return "shared";
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return "cancelled";
        }
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      return "copied";
    } catch {
      return "failed";
    }
  }

  return {
    installed,
    platform,
    canPrompt: Boolean(promptEvent),
    promptInstall,
    openIosGuide,
    shareLink,
  };
}
