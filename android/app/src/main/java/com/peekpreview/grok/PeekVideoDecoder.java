package com.peekpreview.grok;

import android.graphics.SurfaceTexture;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;
import android.view.Surface;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Single hardware MediaCodec decoder that outputs frames to a SurfaceTexture.
 * Designed for dual-decoder preview (two instances share a GL compositor).
 */
public final class PeekVideoDecoder {
    private static final String TAG = "PeekVideoDecoder";

    private final String path;
    private MediaExtractor extractor;
    private MediaCodec codec;
    private SurfaceTexture surfaceTexture;
    private Surface surface;
    private HandlerThread thread;
    private Handler handler;

    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicBoolean released = new AtomicBoolean(false);

    private long durationUs;
    private int width;
    private int height;
    private int rotation;
    private boolean hasVideo;

    private long targetUs = 0;
    private long lastPtsUs = 0;
    private boolean inputEos;
    private boolean outputEos;

    public interface FrameListener {
        void onFrameAvailable(long ptsUs);
    }

    private FrameListener frameListener;

    public PeekVideoDecoder(String path) {
        this.path = path;
    }

    public void setFrameListener(FrameListener listener) {
        this.frameListener = listener;
    }

    public synchronized void open(SurfaceTexture st) throws IOException {
        if (released.get()) throw new IllegalStateException("Decoder already released");
        this.surfaceTexture = st;
        this.surface = new Surface(st);

        extractor = new MediaExtractor();
        extractor.setDataSource(path);

        int track = -1;
        MediaFormat format = null;
        for (int i = 0; i < extractor.getTrackCount(); i++) {
            MediaFormat f = extractor.getTrackFormat(i);
            String mime = f.getString(MediaFormat.KEY_MIME);
            if (mime != null && mime.startsWith("video/")) {
                track = i;
                format = f;
                break;
            }
        }
        if (track < 0 || format == null) {
            throw new IOException("No video track in " + path);
        }
        extractor.selectTrack(track);

        durationUs = format.containsKey(MediaFormat.KEY_DURATION)
                ? format.getLong(MediaFormat.KEY_DURATION) : 0;
        width = format.containsKey(MediaFormat.KEY_WIDTH) ? format.getInteger(MediaFormat.KEY_WIDTH) : 0;
        height = format.containsKey(MediaFormat.KEY_HEIGHT) ? format.getInteger(MediaFormat.KEY_HEIGHT) : 0;
        rotation = format.containsKey(MediaFormat.KEY_ROTATION)
                ? format.getInteger(MediaFormat.KEY_ROTATION) : 0;

        String mime = format.getString(MediaFormat.KEY_MIME);
        codec = MediaCodec.createDecoderByType(mime);
        codec.configure(format, surface, null, 0);
        codec.start();

        thread = new HandlerThread("PeekDec-" + System.identityHashCode(this));
        thread.start();
        handler = new Handler(thread.getLooper());

        hasVideo = true;
        inputEos = false;
        outputEos = false;
        running.set(true);

        handler.post(this::drainLoop);
    }

    public int getWidth() { return width; }
    public int getHeight() { return height; }
    public int getRotation() { return rotation; }
    public long getDurationUs() { return durationUs; }

    public synchronized void seekTo(long us) {
        if (!running.get() || extractor == null) return;
        targetUs = Math.max(0, Math.min(us, durationUs));
        try {
            extractor.seekTo(targetUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            codec.flush();
            inputEos = false;
            outputEos = false;
            lastPtsUs = targetUs;
        } catch (Exception e) {
            Log.w(TAG, "seek failed", e);
        }
    }

    /** Advance decoder toward the given presentation time (microseconds). */
    public synchronized void playTo(long us, long deadlineMs) {
        if (!running.get()) return;
        targetUs = us;
        long start = System.currentTimeMillis();
        while (running.get() && !outputEos && lastPtsUs < us - 30_000) {
            if (System.currentTimeMillis() - start > deadlineMs) break;
            try {
                Thread.sleep(2);
            } catch (InterruptedException ignored) {
                break;
            }
        }
    }

    public long getLastPtsUs() {
        return lastPtsUs;
    }

    private void drainLoop() {
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        while (running.get() && !released.get()) {
            try {
                // Feed input
                if (!inputEos) {
                    int inIndex = codec.dequeueInputBuffer(5_000);
                    if (inIndex >= 0) {
                        ByteBuffer buf = codec.getInputBuffer(inIndex);
                        if (buf != null) {
                            int sample = extractor.readSampleData(buf, 0);
                            if (sample < 0) {
                                codec.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                                inputEos = true;
                            } else {
                                long pts = extractor.getSampleTime();
                                codec.queueInputBuffer(inIndex, 0, sample, pts, 0);
                                extractor.advance();
                            }
                        }
                    }
                }

                // Drain output
                int outIndex = codec.dequeueOutputBuffer(info, 5_000);
                if (outIndex >= 0) {
                    boolean render = info.size > 0 && (info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) == 0;
                    codec.releaseOutputBuffer(outIndex, render);
                    if (render) {
                        lastPtsUs = info.presentationTimeUs;
                        if (frameListener != null) {
                            frameListener.onFrameAvailable(lastPtsUs);
                        }
                    }
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        outputEos = true;
                    }
                } else if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    // ignore
                }
            } catch (Exception e) {
                if (running.get()) {
                    Log.w(TAG, "drain error", e);
                }
                break;
            }
        }
    }

    public synchronized void stop() {
        running.set(false);
        if (handler != null) {
            handler.removeCallbacksAndMessages(null);
        }
    }

    public synchronized void release() {
        if (released.getAndSet(true)) return;
        running.set(false);
        if (handler != null) {
            handler.removeCallbacksAndMessages(null);
        }
        if (thread != null) {
            thread.quitSafely();
            try {
                thread.join(500);
            } catch (InterruptedException ignored) {}
            thread = null;
            handler = null;
        }
        if (codec != null) {
            try {
                codec.stop();
            } catch (Exception ignored) {}
            try {
                codec.release();
            } catch (Exception ignored) {}
            codec = null;
        }
        if (extractor != null) {
            try {
                extractor.release();
            } catch (Exception ignored) {}
            extractor = null;
        }
        if (surface != null) {
            surface.release();
            surface = null;
        }
        surfaceTexture = null;
    }
}
