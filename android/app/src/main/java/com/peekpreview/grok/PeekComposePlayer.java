package com.peekpreview.grok;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.SurfaceTexture;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Choreographer;
import android.view.Surface;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Dual MediaCodec decoder + GL compositor player for real-time preview.
 * Owns two PeekVideoDecoder instances, one PeekGlScene, and a Choreographer loop.
 */
public final class PeekComposePlayer implements Choreographer.FrameCallback {
    private static final String TAG = "PeekComposePlayer";

    private final Context context;
    private PeekVideoDecoder dec0;
    private PeekVideoDecoder dec1;
    private PeekGlScene scene;
    private SurfaceTexture st0;
    private SurfaceTexture st1;
    private Surface outputSurface;

    private final AtomicBoolean playing = new AtomicBoolean(false);
    private final AtomicBoolean released = new AtomicBoolean(false);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private long startWallMs;
    private long startPtsUs;
    private long currentPtsUs;
    private long durationUs;
    private boolean needsDual;

    private String path;
    private float cropL = 0f, cropT = 0f, cropR = 1f, cropB = 1f;
    private int rotation;
    private float joinAlpha;
    private int viewW;
    private int viewH;

    private AudioManager audioManager;
    private AudioManager.OnAudioFocusChangeListener focusListener;

    public interface Listener {
        void onPosition(long ptsUs, boolean isPlaying);
        void onError(String message);
    }

    private Listener listener;

    public PeekComposePlayer(Context context) {
        this.context = context.getApplicationContext();
        this.audioManager = (AudioManager) this.context.getSystemService(Context.AUDIO_SERVICE);
    }

    public void setListener(Listener listener) {
        this.listener = listener;
    }

    public synchronized void prepare(String videoPath, Surface surface, int width, int height) throws Exception {
        if (released.get()) throw new IllegalStateException("released");
        releaseInternal();

        this.path = videoPath;
        this.outputSurface = surface;
        this.viewW = width;
        this.viewH = height;

        scene = new PeekGlScene();
        scene.init(surface, width, height);

        st0 = new SurfaceTexture(scene.getOesTextureId(0));
        st0.setDefaultBufferSize(width, height);
        st1 = new SurfaceTexture(scene.getOesTextureId(1));
        st1.setDefaultBufferSize(width, height);

        dec0 = new PeekVideoDecoder(videoPath);
        dec0.open(st0);
        rotation = dec0.getRotation();
        durationUs = dec0.getDurationUs();

        needsDual = false;
        currentPtsUs = 0;
        joinAlpha = 0f;

        requestFocus();
    }

    public synchronized void setNeedsDual(boolean on) {
        if (on == needsDual) return;
        needsDual = on;
        if (on && dec1 == null && path != null && st1 != null) {
            try {
                dec1 = new PeekVideoDecoder(path);
                dec1.open(st1);
                dec1.seekTo(currentPtsUs);
            } catch (Exception e) {
                Log.w(TAG, "failed to open second decoder", e);
                needsDual = false;
                if (dec1 != null) {
                    dec1.release();
                    dec1 = null;
                }
            }
        } else if (!on && dec1 != null) {
            dec1.release();
            dec1 = null;
            joinAlpha = 0f;
        }
    }

    public synchronized void setJoinAlpha(float alpha) {
        joinAlpha = Math.max(0f, Math.min(1f, alpha));
    }

    public synchronized void setCrop(float l, float t, float r, float b) {
        cropL = l;
        cropT = t;
        cropR = r;
        cropB = b;
    }

    public synchronized void setLogo(Bitmap bmp, float x, float y, float scale, float rotationDeg, float opacity) {
        if (scene != null) {
            scene.setLogo(bmp, x, y, scale, rotationDeg, opacity);
        }
    }

    public synchronized void clearLogo() {
        if (scene != null) scene.clearLogo();
    }

    public synchronized void play() {
        if (released.get() || dec0 == null) return;
        if (playing.getAndSet(true)) return;
        startWallMs = System.currentTimeMillis();
        startPtsUs = currentPtsUs;
        requestFocus();
        Choreographer.getInstance().postFrameCallback(this);
    }

    public synchronized void pause() {
        if (!playing.getAndSet(false)) return;
        Choreographer.getInstance().removeFrameCallback(this);
        drawFrame();
        abandonFocus();
        if (listener != null) {
            mainHandler.post(() -> listener.onPosition(currentPtsUs, false));
        }
    }

    public synchronized void seekTo(long us) {
        boolean wasPlaying = playing.get();
        if (wasPlaying) pause();
        currentPtsUs = Math.max(0, Math.min(us, durationUs));
        if (dec0 != null) dec0.seekTo(currentPtsUs);
        if (dec1 != null) dec1.seekTo(currentPtsUs);
        drawFrame();
        if (wasPlaying) play();
        if (listener != null) {
            mainHandler.post(() -> listener.onPosition(currentPtsUs, playing.get()));
        }
    }

    public synchronized long getPositionUs() {
        return currentPtsUs;
    }

    public synchronized boolean isPlaying() {
        return playing.get();
    }

    public synchronized long getDurationUs() {
        return durationUs;
    }

    @Override
    public void doFrame(long frameTimeNanos) {
        if (!playing.get() || released.get()) return;

        long elapsedMs = System.currentTimeMillis() - startWallMs;
        long targetUs = startPtsUs + elapsedMs * 1000L;
        // Prevent large jumps after blocking decoder work
        if (targetUs - currentPtsUs > 80_000L) {
            targetUs = currentPtsUs + 33_000L;
            startWallMs = System.currentTimeMillis() - (targetUs - startPtsUs) / 1000L;
        }

        if (targetUs >= durationUs) {
            targetUs = durationUs;
            currentPtsUs = targetUs;
            playing.set(false);
            drawFrame();
            if (listener != null) {
                mainHandler.post(() -> listener.onPosition(currentPtsUs, false));
            }
            return;
        }

        currentPtsUs = targetUs;

        if (dec0 != null) {
            dec0.playTo(currentPtsUs, 40);
        }
        if (needsDual && dec1 != null) {
            dec1.playTo(currentPtsUs, 40);
        }

        drawFrame();

        if (listener != null) {
            mainHandler.post(() -> listener.onPosition(currentPtsUs, true));
        }

        if (playing.get()) {
            Choreographer.getInstance().postFrameCallback(this);
        }
    }

    private void drawFrame() {
        if (scene == null) return;
        try {
            scene.draw(st0, needsDual ? st1 : null, joinAlpha,
                    cropL, cropT, cropR, cropB, rotation);
        } catch (Exception e) {
            Log.w(TAG, "draw failed", e);
        }
    }

    private void requestFocus() {
        if (audioManager == null) return;
        if (focusListener == null) {
            focusListener = focusChange -> {
                if (focusChange == AudioManager.AUDIOFOCUS_LOSS
                        || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                    pause();
                }
            };
        }
        audioManager.requestAudioFocus(focusListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
    }

    private void abandonFocus() {
        if (audioManager != null && focusListener != null) {
            audioManager.abandonAudioFocus(focusListener);
        }
    }

    private void releaseInternal() {
        Choreographer.getInstance().removeFrameCallback(this);
        playing.set(false);
        if (dec0 != null) {
            dec0.release();
            dec0 = null;
        }
        if (dec1 != null) {
            dec1.release();
            dec1 = null;
        }
        if (st0 != null) {
            st0.release();
            st0 = null;
        }
        if (st1 != null) {
            st1.release();
            st1 = null;
        }
        if (scene != null) {
            scene.release();
            scene = null;
        }
        abandonFocus();
    }

    public synchronized void release() {
        if (released.getAndSet(true)) return;
        releaseInternal();
        outputSurface = null;
    }
}
