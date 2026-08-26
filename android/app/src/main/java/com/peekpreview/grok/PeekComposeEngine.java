package com.peekpreview.grok;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.SurfaceTexture;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.util.Log;
import android.view.Surface;

import java.io.File;
import java.nio.ByteBuffer;

/**
 * One-shot encode path: dual decoder + same GL compositor, output fed zero-copy
 * into a MediaCodec hardware encoder (COLOR_FormatSurface).
 */
public final class PeekComposeEngine {
    private static final String TAG = "PeekComposeEngine";

    public interface ProgressListener {
        void onProgress(float ratio);
        void onComplete(String outputPath);
        void onError(String message);
    }

    private final Context context;

    public PeekComposeEngine(Context context) {
        this.context = context.getApplicationContext();
    }

    public void encode(
            String inputPath,
            String outputPath,
            int outWidth,
            int outHeight,
            float cropL, float cropT, float cropR, float cropB,
            Bitmap logo,
            float logoX, float logoY, float logoScale, float logoRot, float logoOpacity,
            ProgressListener listener
    ) {
        new Thread(() -> {
            PeekVideoDecoder dec = null;
            PeekGlScene scene = null;
            MediaCodec encoder = null;
            MediaMuxer muxer = null;
            Surface encoderSurface = null;
            SurfaceTexture st = null;
            int trackIndex = -1;
            boolean muxerStarted = false;

            try {
                // Encoder
                MediaFormat format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, outWidth, outHeight);
                format.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
                format.setInteger(MediaFormat.KEY_BIT_RATE, 8_000_000);
                format.setInteger(MediaFormat.KEY_FRAME_RATE, 30);
                format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1);

                encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
                encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
                encoderSurface = encoder.createInputSurface();
                encoder.start();

                scene = new PeekGlScene();
                scene.init(encoderSurface, outWidth, outHeight);
                if (logo != null) {
                    scene.setLogo(logo, logoX, logoY, logoScale, logoRot, logoOpacity);
                }

                st = new SurfaceTexture(scene.getOesTextureId(0));
                st.setDefaultBufferSize(outWidth, outHeight);

                dec = new PeekVideoDecoder(inputPath);
                dec.open(st);
                long durationUs = dec.getDurationUs();
                int rotation = dec.getRotation();

                muxer = new MediaMuxer(outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);

                MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
                long ptsUs = 0;
                final long frameDurationUs = 33_333L; // ~30 fps

                while (ptsUs < durationUs) {
                    dec.seekTo(ptsUs);
                    dec.playTo(ptsUs, 60);
                    scene.draw(st, null, 0f, cropL, cropT, cropR, cropB, rotation);

                    // Drain encoder
                    while (true) {
                        int outIndex = encoder.dequeueOutputBuffer(info, 0);
                        if (outIndex == MediaCodec.INFO_TRY_AGAIN_LATER) break;
                        if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                            if (muxerStarted) throw new RuntimeException("format changed twice");
                            trackIndex = muxer.addTrack(encoder.getOutputFormat());
                            muxer.start();
                            muxerStarted = true;
                            continue;
                        }
                        if (outIndex >= 0) {
                            ByteBuffer buf = encoder.getOutputBuffer(outIndex);
                            if (buf != null && info.size > 0 && muxerStarted) {
                                buf.position(info.offset);
                                buf.limit(info.offset + info.size);
                                muxer.writeSampleData(trackIndex, buf, info);
                            }
                            encoder.releaseOutputBuffer(outIndex, false);
                            if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                                ptsUs = durationUs;
                                break;
                            }
                        }
                    }

                    ptsUs += frameDurationUs;
                    if (listener != null) {
                        float ratio = Math.min(1f, (float) ptsUs / Math.max(1, durationUs));
                        listener.onProgress(ratio);
                    }
                }

                // Signal end of stream
                encoder.signalEndOfInputStream();
                boolean eos = false;
                while (!eos) {
                    int outIndex = encoder.dequeueOutputBuffer(info, 10_000);
                    if (outIndex == MediaCodec.INFO_TRY_AGAIN_LATER) continue;
                    if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        if (!muxerStarted) {
                            trackIndex = muxer.addTrack(encoder.getOutputFormat());
                            muxer.start();
                            muxerStarted = true;
                        }
                        continue;
                    }
                    if (outIndex >= 0) {
                        ByteBuffer buf = encoder.getOutputBuffer(outIndex);
                        if (buf != null && info.size > 0 && muxerStarted) {
                            buf.position(info.offset);
                            buf.limit(info.offset + info.size);
                            muxer.writeSampleData(trackIndex, buf, info);
                        }
                        encoder.releaseOutputBuffer(outIndex, false);
                        if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                            eos = true;
                        }
                    }
                }

                if (listener != null) {
                    listener.onComplete(outputPath);
                }
            } catch (Exception e) {
                Log.e(TAG, "encode failed", e);
                if (listener != null) listener.onError(e.getMessage() != null ? e.getMessage() : "encode failed");
            } finally {
                if (dec != null) dec.release();
                if (st != null) st.release();
                if (scene != null) scene.release();
                if (encoder != null) {
                    try { encoder.stop(); } catch (Exception ignored) {}
                    try { encoder.release(); } catch (Exception ignored) {}
                }
                if (encoderSurface != null) encoderSurface.release();
                if (muxer != null) {
                    try {
                        if (muxerStarted) muxer.stop();
                    } catch (Exception ignored) {}
                    try { muxer.release(); } catch (Exception ignored) {}
                }
            }
        }, "PeekEncode").start();
    }
}
