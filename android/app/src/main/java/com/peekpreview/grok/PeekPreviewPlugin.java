package com.peekpreview.grok;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.util.Base64;
import android.util.Log;
import android.view.Gravity;
import android.view.Surface;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PeekPreview")
public class PeekPreviewPlugin extends Plugin {
    private static final String TAG = "PeekPreviewPlugin";

    private PeekComposePlayer player;
    private PeekSurfaceHost surfaceHost;
    private Surface surface;
    private int surfaceW;
    private int surfaceH;
    private boolean surfaceReady;

    @PluginMethod
    public void attach(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (surfaceHost != null) {
                    call.resolve();
                    return;
                }
                surfaceHost = new PeekSurfaceHost(getContext());
                surfaceHost.setCallback(new PeekSurfaceHost.Callback() {
                    @Override
                    public void onSurfaceReady(Surface s, int width, int height) {
                        surface = s;
                        surfaceW = width;
                        surfaceH = height;
                        surfaceReady = true;
                        JSObject ev = new JSObject();
                        ev.put("width", width);
                        ev.put("height", height);
                        notifyListeners("surfaceReady", ev);
                    }

                    @Override
                    public void onSurfaceDestroyed() {
                        surface = null;
                        surfaceReady = false;
                        if (player != null) {
                            player.pause();
                        }
                        notifyListeners("surfaceDestroyed", new JSObject());
                    }
                });

                FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        Gravity.CENTER);
                surfaceHost.setLayoutParams(lp);
                surfaceHost.setBackgroundColor(Color.BLACK);

                // Insert behind the WebView so the React chrome stays on top
                ViewGroup content = (ViewGroup) getBridge().getWebView().getParent();
                if (content != null) {
                    content.addView(surfaceHost, 0);
                }

                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "attach failed", e);
                call.reject(e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void detach(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (player != null) {
                player.release();
                player = null;
            }
            if (surfaceHost != null) {
                ViewGroup parent = (ViewGroup) surfaceHost.getParent();
                if (parent != null) parent.removeView(surfaceHost);
                surfaceHost = null;
            }
            surface = null;
            surfaceReady = false;
            call.resolve();
        });
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        String path = call.getString("path");
        Integer width = call.getInt("width", 1080);
        Integer height = call.getInt("height", 1920);
        if (path == null || path.isEmpty()) {
            call.reject("path required");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                if (!surfaceReady || surface == null) {
                    call.reject("surface not ready — call attach first");
                    return;
                }
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
                int w = surfaceW > 0 ? surfaceW : width;
                int h = surfaceH > 0 ? surfaceH : height;
                player.prepare(path, surface, w, h);
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
    public void setJoinAlpha(PluginCall call) {
        float alpha = call.getFloat("alpha", 0f);
        getActivity().runOnUiThread(() -> {
            if (player != null) player.setJoinAlpha(alpha);
            call.resolve();
        });
    }

    @PluginMethod
    public void setNeedsDual(PluginCall call) {
        boolean on = call.getBoolean("on", false);
        getActivity().runOnUiThread(() -> {
            if (player != null) player.setNeedsDual(on);
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
        if (surfaceHost != null) {
            ViewGroup parent = (ViewGroup) surfaceHost.getParent();
            if (parent != null) parent.removeView(surfaceHost);
            surfaceHost = null;
        }
        surface = null;
        surfaceReady = false;
    }
}
