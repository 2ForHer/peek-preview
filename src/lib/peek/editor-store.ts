import { create } from "zustand";
import {
  FULL_CROP,
  applyCropAspect,
  clampCut,
  defaultCuts,
  maxSegmentCount,
  resizeCutList,
  type CropAspect,
  type CropRect,
  type CutSpec,
  type TransitionType,
} from "./timeline";
import type { LoadedClip } from "./media";

export type EditorMode = "home" | "preview" | "watermark";

export interface WatermarkState {
  image: HTMLImageElement | null;
  url: string | null;
  name: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export interface Snapshot {
  cuts: CutSpec[];
  crop: CropRect;
  cropAspect: CropAspect;
  transitionEnabled: boolean;
  transitionType: TransitionType;
  transitionDurationMs: number;
  watermark: Omit<WatermarkState, "image" | "url" | "name">;
}

export interface BatchItem {
  clipId: string;
  status: "pending" | "running" | "done" | "error" | "cancelled";
  message?: string;
}

interface EditorState {
  mode: EditorMode;
  clips: LoadedClip[];
  activeClipId: string | null;
  cuts: CutSpec[];
  crop: CropRect;
  cropAspect: CropAspect;
  transitionEnabled: boolean;
  transitionType: TransitionType;
  transitionDurationMs: number;
  playing: boolean;
  outputMs: number;
  selectedCut: number;
  watermark: WatermarkState;
  showWatermark: boolean;
  history: Snapshot[];
  future: Snapshot[];
  error: string | null;
  notice: string | null;
  exporting: boolean;
  exportProgress: number | null;
  confirmLongExport: boolean;
  batch: BatchItem[];
  batchCancel: boolean;
  setMode: (mode: EditorMode) => void;
  addClips: (clips: LoadedClip[]) => void;
  setActiveClip: (id: string) => void;
  setCuts: (cuts: CutSpec[], record?: boolean) => void;
  setCutCount: (count: number) => void;
  patchCut: (index: number, patch: Partial<CutSpec>) => void;
  setSelectedCut: (index: number) => void;
  setCrop: (crop: CropRect, record?: boolean) => void;
  setCropAspect: (aspect: CropAspect) => void;
  setTransitionEnabled: (on: boolean) => void;
  setTransitionType: (type: TransitionType) => void;
  setTransitionDurationMs: (ms: number) => void;
  setPlaying: (playing: boolean) => void;
  setOutputMs: (ms: number) => void;
  setWatermark: (patch: Partial<WatermarkState>) => void;
  setShowWatermark: (on: boolean) => void;
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
  setExporting: (exporting: boolean, progress?: number | null) => void;
  setConfirmLongExport: (on: boolean) => void;
  setBatch: (batch: BatchItem[]) => void;
  setBatchCancel: (on: boolean) => void;
  undo: () => void;
  redo: () => void;
  snapshot: () => void;
  resetSession: () => void;
}

function defaultWatermark(): WatermarkState {
  return {
    image: null,
    url: null,
    name: "mark",
    x: 82,
    y: 88,
    scale: 1,
    rotation: 0,
    opacity: 0.85,
  };
}

function takeSnapshot(state: EditorState): Snapshot {
  return {
    cuts: state.cuts.map((c) => ({ ...c })),
    crop: { ...state.crop },
    cropAspect: state.cropAspect,
    transitionEnabled: state.transitionEnabled,
    transitionType: state.transitionType,
    transitionDurationMs: state.transitionDurationMs,
    watermark: {
      x: state.watermark.x,
      y: state.watermark.y,
      scale: state.watermark.scale,
      rotation: state.watermark.rotation,
      opacity: state.watermark.opacity,
    },
  };
}

function applySnapshot(
  state: EditorState,
  snap: Snapshot,
): Partial<EditorState> {
  return {
    cuts: snap.cuts.map((c) => ({ ...c })),
    crop: { ...snap.crop },
    cropAspect: snap.cropAspect,
    transitionEnabled: snap.transitionEnabled,
    transitionType: snap.transitionType,
    transitionDurationMs: snap.transitionDurationMs,
    watermark: { ...state.watermark, ...snap.watermark },
  };
}

export const useEditor = create<EditorState>((set, get) => ({
  mode: "home",
  clips: [],
  activeClipId: null,
  cuts: [],
  crop: { ...FULL_CROP },
  cropAspect: "free",
  transitionEnabled: true,
  transitionType: "crossfade",
  transitionDurationMs: 350,
  playing: false,
  outputMs: 0,
  selectedCut: 0,
  watermark: defaultWatermark(),
  showWatermark: true,
  history: [],
  future: [],
  error: null,
  notice: null,
  exporting: false,
  exportProgress: null,
  confirmLongExport: false,
  batch: [],
  batchCancel: false,

  setMode: (mode) => set({ mode }),

  addClips: (incoming) =>
    set((state) => {
      const clips = [...state.clips, ...incoming];
      const active = state.activeClipId ?? incoming[0]?.id ?? null;
      const clip = clips.find((c) => c.id === active) ?? incoming[0];
      const cuts =
        state.cuts.length > 0
          ? state.cuts
          : clip
            ? defaultCuts(clip.durationMs)
            : [];
      return {
        clips,
        activeClipId: active,
        cuts,
        selectedCut: 0,
        error: null,
      };
    }),

  setActiveClip: (id) =>
    set((state) => {
      const clip = state.clips.find((c) => c.id === id);
      if (!clip) return {};
      return {
        activeClipId: id,
        cuts: defaultCuts(clip.durationMs),
        selectedCut: 0,
        outputMs: 0,
        playing: false,
      };
    }),

  setCuts: (cuts, record = true) =>
    set((state) => {
      const clip = state.clips.find((c) => c.id === state.activeClipId);
      const next = clip
        ? cuts.map((c) => clampCut(c, clip.durationMs))
        : cuts;
      return {
        cuts: next,
        history: record
          ? [...state.history.slice(-39), takeSnapshot(state)]
          : state.history,
        future: record ? [] : state.future,
      };
    }),

  setCutCount: (count) =>
    set((state) => {
      const clip = state.clips.find((c) => c.id === state.activeClipId);
      if (!clip) return {};
      return {
        cuts: resizeCutList(state.cuts, count, clip.durationMs),
        selectedCut: Math.min(state.selectedCut, count - 1),
        history: [...state.history.slice(-39), takeSnapshot(state)],
        future: [],
      };
    }),

  patchCut: (index, patch) =>
    set((state) => {
      const clip = state.clips.find((c) => c.id === state.activeClipId);
      if (!clip) return {};
      const cuts = state.cuts.map((cut, i) =>
        i === index ? clampCut({ ...cut, ...patch }, clip.durationMs) : cut,
      );
      return { cuts };
    }),

  setSelectedCut: (index) => set({ selectedCut: index }),

  setCrop: (crop, record = true) =>
    set((state) => ({
      crop,
      history: record
        ? [...state.history.slice(-39), takeSnapshot(state)]
        : state.history,
      future: record ? [] : state.future,
    })),

  setCropAspect: (aspect) =>
    set((state) => {
      const clip = state.clips.find((c) => c.id === state.activeClipId);
      const crop = clip
        ? applyCropAspect(state.crop, aspect, clip.width, clip.height)
        : state.crop;
      return {
        cropAspect: aspect,
        crop,
        history: [...state.history.slice(-39), takeSnapshot(state)],
        future: [],
      };
    }),

  setTransitionEnabled: (on) =>
    set((state) => ({
      transitionEnabled: on,
      history: [...state.history.slice(-39), takeSnapshot(state)],
      future: [],
    })),

  setTransitionType: (type) => set({ transitionType: type }),

  setTransitionDurationMs: (ms) => set({ transitionDurationMs: ms }),

  setPlaying: (playing) => set({ playing }),
  setOutputMs: (ms) => set({ outputMs: ms }),

  setWatermark: (patch) =>
    set((state) => ({
      watermark: { ...state.watermark, ...patch },
    })),

  setShowWatermark: (on) => set({ showWatermark: on }),
  setError: (error) => set({ error }),
  setNotice: (notice) => set({ notice }),
  setExporting: (exporting, progress = null) =>
    set({ exporting, exportProgress: progress }),
  setConfirmLongExport: (on) => set({ confirmLongExport: on }),
  setBatch: (batch) => set({ batch }),
  setBatchCancel: (on) => set({ batchCancel: on }),

  snapshot: () =>
    set((state) => ({
      history: [...state.history.slice(-39), takeSnapshot(state)],
      future: [],
    })),

  undo: () =>
    set((state) => {
      const prev = state.history[state.history.length - 1];
      if (!prev) return {};
      return {
        ...applySnapshot(state, prev),
        history: state.history.slice(0, -1),
        future: [takeSnapshot(state), ...state.future].slice(0, 40),
      };
    }),

  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return {};
      return {
        ...applySnapshot(state, next),
        future: state.future.slice(1),
        history: [...state.history, takeSnapshot(state)].slice(-40),
      };
    }),

  resetSession: () =>
    set((state) => {
      for (const clip of state.clips) {
        if (clip.url.startsWith("blob:")) URL.revokeObjectURL(clip.url);
      }
      const keepDefaultMark = state.watermark.url === "/mark.svg";
      if (state.watermark.url?.startsWith("blob:")) {
        URL.revokeObjectURL(state.watermark.url);
      }
      return {
        mode: "home",
        clips: [],
        activeClipId: null,
        cuts: [],
        crop: { ...FULL_CROP },
        cropAspect: "free",
        transitionEnabled: true,
        transitionType: "crossfade" as const,
        transitionDurationMs: 350,
        playing: false,
        outputMs: 0,
        selectedCut: 0,
        watermark: {
          ...defaultWatermark(),
          image: keepDefaultMark ? state.watermark.image : null,
          url: keepDefaultMark ? "/mark.svg" : null,
          name: keepDefaultMark ? state.watermark.name : "mark",
        },
        showWatermark: true,
        history: [],
        future: [],
        error: null,
        notice: null,
        exporting: false,
        exportProgress: null,
        confirmLongExport: false,
        batch: [],
        batchCancel: false,
      };
    }),
}));

export function activeClip(): LoadedClip | null {
  const { clips, activeClipId } = useEditor.getState();
  return clips.find((c) => c.id === activeClipId) ?? null;
}

export function maxCutsForActive(): number {
  const clip = activeClip();
  return clip ? maxSegmentCount(clip.durationMs) : 2;
}
