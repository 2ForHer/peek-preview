import { useEditor } from "./editor-store";
import { loadVideoFile, loadVideoUrl } from "./media";

function isVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  return /\.(mp4|webm|mov|m4v|mkv|ogv)$/i.test(file.name);
}

export async function ingestVideoFiles(files: Iterable<File>) {
  const list = [...files].filter(isVideoFile);
  if (!list.length) {
    throw new Error("Choose a video file to start.");
  }
  const clips = [];
  for (const file of list) {
    clips.push(await loadVideoFile(file));
  }
  const { addClips, setMode, mode } = useEditor.getState();
  addClips(clips);
  if (mode === "home") setMode("preview");
  return clips;
}

export async function ingestDemoReel() {
  const clip = await loadVideoUrl("/demo-reel.mp4", "Demo reel");
  const { addClips, setMode, mode } = useEditor.getState();
  addClips([clip]);
  if (mode === "home") setMode("preview");
  return clip;
}
