import { useEffect, useState } from "react";
import { EditorShell } from "@/components/peek/editor-shell";
import { HomeScreen } from "@/components/peek/home-screen";
import { InstallSheet } from "@/components/peek/install-sheet";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useEditor } from "@/lib/peek/editor-store";
import { loadImageUrl } from "@/lib/peek/media";

export function PeekApp() {
  const mode = useEditor((s) => s.mode);
  const install = usePwaInstall();
  const [installOpen, setInstallOpen] = useState(false);

  useEffect(() => {
    void loadImageUrl("/mark.svg")
      .then((image) => {
        useEditor.getState().setWatermark({
          image,
          url: "/mark.svg",
          name: "Peek mark",
        });
      })
      .catch(() => undefined);
  }, []);

  const installProps = {
    showInstall: !install.installed,
    onInstall: () => setInstallOpen(true),
  };

  return (
    <>
      {mode === "home" ? (
        <HomeScreen {...installProps} />
      ) : (
        <EditorShell {...installProps} />
      )}
      {installOpen ? (
        <InstallSheet install={install} onClose={() => setInstallOpen(false)} />
      ) : null}
    </>
  );
}
