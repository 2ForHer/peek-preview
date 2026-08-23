import type { PreviewPlan } from "./timeline";

export async function decodeAudio(url: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    const context = new AudioContext();
    try {
      return await context.decodeAudioData(data.slice(0));
    } finally {
      await context.close();
    }
  } catch {
    return null;
  }
}

export function spliceAudio(
  source: AudioBuffer,
  plan: PreviewPlan,
): AudioBuffer {
  const rate = source.sampleRate;
  const channels = source.numberOfChannels || 1;
  const outSamples = Math.max(
    1,
    Math.ceil((plan.outputDurationMs / 1000) * rate),
  );
  const output = new AudioBuffer({
    length: outSamples,
    numberOfChannels: channels,
    sampleRate: rate,
  });
  const fade = plan.transitionEnabled
    ? Math.max(1, Math.floor((plan.transitionDurationMs / 1000) * rate))
    : 0;
  const last = plan.segments.length - 1;

  for (let ch = 0; ch < channels; ch += 1) {
    const src = source.getChannelData(ch);
    const dest = output.getChannelData(ch);
    for (const segment of plan.segments) {
      const srcStart = Math.floor((segment.startMs / 1000) * rate);
      const dstStart = Math.floor((segment.outputStartMs / 1000) * rate);
      const len = Math.floor((segment.durationMs / 1000) * rate);
      for (let i = 0; i < len; i += 1) {
        const di = dstStart + i;
        if (di < 0 || di >= dest.length) continue;
        const si = srcStart + i;
        const sample = si >= 0 && si < src.length ? src[si]! : 0;
        let gain = 1;
        if (fade && segment.index > 0 && i < fade) gain *= i / fade;
        if (fade && segment.index < last && i > len - fade) {
          gain *= (len - i) / fade;
        }
        dest[di] += sample * gain;
      }
    }
  }
  return output;
}
