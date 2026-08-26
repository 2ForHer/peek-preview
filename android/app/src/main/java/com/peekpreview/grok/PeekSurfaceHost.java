package com.peekpreview.grok;

import android.content.Context;
import android.graphics.SurfaceTexture;
import android.util.AttributeSet;
import android.view.Surface;
import android.view.TextureView;

/**
 * TextureView that owns the output Surface for the GL compositor.
 * When the surface becomes available it is handed to the registered plugin.
 */
public final class PeekSurfaceHost extends TextureView implements TextureView.SurfaceTextureListener {

    public interface Callback {
        void onSurfaceReady(Surface surface, int width, int height);
        void onSurfaceDestroyed();
    }

    private Callback callback;
    private Surface surface;
    private int surfaceWidth;
    private int surfaceHeight;

    public PeekSurfaceHost(Context context) {
        super(context);
        init();
    }

    public PeekSurfaceHost(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        setSurfaceTextureListener(this);
        setOpaque(true);
    }

    public void setCallback(Callback callback) {
        this.callback = callback;
        if (surface != null && callback != null) {
            callback.onSurfaceReady(surface, surfaceWidth, surfaceHeight);
        }
    }

    @Override
    public void onSurfaceTextureAvailable(SurfaceTexture st, int width, int height) {
        if (surface != null) {
            surface.release();
        }
        surface = new Surface(st);
        surfaceWidth = width;
        surfaceHeight = height;
        if (callback != null) {
            callback.onSurfaceReady(surface, width, height);
        }
    }

    @Override
    public void onSurfaceTextureSizeChanged(SurfaceTexture st, int width, int height) {
        surfaceWidth = width;
        surfaceHeight = height;
        if (callback != null && surface != null) {
            callback.onSurfaceReady(surface, width, height);
        }
    }

    @Override
    public boolean onSurfaceTextureDestroyed(SurfaceTexture st) {
        if (callback != null) {
            callback.onSurfaceDestroyed();
        }
        if (surface != null) {
            surface.release();
            surface = null;
        }
        return true;
    }

    @Override
    public void onSurfaceTextureUpdated(SurfaceTexture st) {
        // frame drawn by GL
    }

    public Surface getSurface() {
        return surface;
    }

    public int getSurfaceWidth() {
        return surfaceWidth;
    }

    public int getSurfaceHeight() {
        return surfaceHeight;
    }
}
