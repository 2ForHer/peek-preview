package com.peekpreview.grok;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.util.Log;
import android.view.Surface;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PeekPreview")
public class PeekPreviewPlugin extends Plugin {
    private static final String TAG = "PeekPreviewPlugin";

    private PeekComposePlayer player;
    private Surface surface;

    @PluginMethod
    public void prepare(PluginCall call) {
        String path = call.getString("path");
        Integer width = call.getInt("width", 1080);
        Integer height = call.getInt("height", 1920);
        if (path == null || path.isEmpty()) {
            call.reject("path required");
            return;
        }
        if (surface == null) {
            call.reject("surface not set — call setSurface first from native view");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                if (player != null) {
                    player.release();
                }
                player = new PeekComposePlayer(getContext());
                player.setListener(new PeekComposePlayer.Listener() {
                    @Override
                    public void onPosition(long ptsUs, boolean isPlaying) {
                        JSObject ev = new JSObject();
                        ev.put("ptsUs", ptsUs);
                        ev.put("playing", isPlaying);
                        notifyListeners("position", ev);
                    }

                    @Override
                    public void onError(String message) {
                        JSObject ev = new JSObject();
                        ev.put("message", message);
                        notifyListeners("error", ev);
                    }
                });
                player.prepare(path, surface, width, height);
                JSObject ret = new JSObject();
                ret.put("durationUs", player.getDurationUs());
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "prepare failed", e);
                call.reject(e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (player != null) player.play();
            call.resolve();
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (player != null) player.pause();
            call.resolve();
        });
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Double us = call.getDouble("us", 0.0);
        getActivity().runOnUiThread(() -> {
            if (player != null) player.seekTo(us.longValue());
            call.resolve();
        });
    }

    @PluginMethod
    public void setCrop(PluginCall call) {
        float l = call.getFloat("l", 0f);
        float t = call.getFloat("t", 0f);
        float r = call.getFloat("r", 1f);
        float b = call.getFloat("b", 1f);
        getActivity().runOnUiThread(() -> {
            if (player != null) player.setCrop(l, t, r, b);
            call.resolve();
        });
    }

    @PluginMethod
    public void setLogo(PluginCall call) {
        String b64 = call.getString("pngBase64");
        float x = call.getFloat("x", 82f);
        float y = call.getFloat("y", 88f);
        float scale = call.getFloat("scale", 1f);
        float rotation = call.getFloat("rotation", 0f);
        float opacity = call.getFloat("opacity", 0.85f);

        getActivity().runOnUiThread(() -> {
            if (player == null) {
                call.resolve();
                return;
            }
            if (b64 == null || b64.isEmpty()) {
                player.clearLogo();
                call.resolve();
                return;
            }
            try {
                byte[] raw = Base64.decode(b64, Base64.DEFAULT);
                BitmapFactory.Options opts = new BitmapFactory.Options();
                opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
                Bitmap bmp = BitmapFactory.decodeByteArray(raw, 0, raw.length, opts);
                if (bmp != null) {
                    player.setLogo(bmp, x / 100f, y / 100f, scale, rotation, opacity);
                }
            } catch (Exception e) {
                Log.w(TAG, "logo decode failed", e);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void release(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (player != null) {
                player.release();
                player = null;
            }
            call.resolve();
        });
    }

    /** Called from a future native SurfaceView / TextureView host when the surface is ready. */
    public void setSurface(Surface surface) {
        this.surface = surface;
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (player != null) player.pause();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
