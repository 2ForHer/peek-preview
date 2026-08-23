export type SaveResult = "shared" | "downloaded" | "saved" | "cancelled";

export async function saveExportedVideo(
  blob: Blob,
  filename: string,
): Promise<SaveResult> {
  const type = blob.type || "video/mp4";
  const file = new File([blob], filename, { type });

  const w = window as Window & {
    showSaveFilePicker?: (opts: {
      suggestedName: string;
      types: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<FileSystemFileHandle>;
  };
  if (typeof w.showSaveFilePicker === "function") {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "Video",
            accept: { [type]: [`.${filename.split(".").pop() || "mp4"}`] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        return "cancelled";
    }
  }

  if (
    typeof navigator.share === "function" &&
    navigator.canShare?.({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        return "cancelled";
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 12_000);
  return "downloaded";
}

export function filenameFor(
  name: string,
  mime: string,
  index?: number,
): string {
  const base = name.replace(/\.[^.]+$/, "") || "peek";
  const ext = mime.includes("mp4")
    ? "mp4"
    : mime.includes("webm")
      ? "webm"
      : "mp4";
  const suffix = index == null ? "" : `-${index + 1}`;
  return `${base}-peek${suffix}.${ext}`;
}
