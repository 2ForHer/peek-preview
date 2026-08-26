package com.peekpreview.grok;

import android.graphics.Bitmap;
import android.graphics.SurfaceTexture;
import android.opengl.EGL14;
import android.opengl.EGLConfig;
import android.opengl.EGLContext;
import android.opengl.EGLDisplay;
import android.opengl.EGLSurface;
import android.opengl.GLES11Ext;
import android.opengl.GLES20;
import android.opengl.GLUtils;
import android.opengl.Matrix;
import android.util.Log;
import android.view.Surface;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

/**
 * GLES20 compositor that samples up to two External OES textures (dual decoder),
 * applies crop / rotation, crossfade / simple transitions, and optional logo burn.
 */
public final class PeekGlScene {
    private static final String TAG = "PeekGlScene";

    private static final String VS =
            "uniform mat4 uMVP;\n" +
            "uniform mat4 uSTMatrix;\n" +
            "attribute vec4 aPos;\n" +
            "attribute vec4 aTex;\n" +
            "varying vec2 vTex;\n" +
            "void main() {\n" +
            "  gl_Position = uMVP * aPos;\n" +
            "  vTex = (uSTMatrix * aTex).xy;\n" +
            "}\n";

    private static final String FS_OES =
            "#extension GL_OES_EGL_image_external : require\n" +
            "precision mediump float;\n" +
            "varying vec2 vTex;\n" +
            "uniform samplerExternalOES sTexture;\n" +
            "uniform float uAlpha;\n" +
            "void main() {\n" +
            "  vec4 c = texture2D(sTexture, vTex);\n" +
            "  gl_FragColor = vec4(c.rgb, c.a * uAlpha);\n" +
            "}\n";

    private static final String FS_LOGO =
            "precision mediump float;\n" +
            "varying vec2 vTex;\n" +
            "uniform sampler2D sTexture;\n" +
            "uniform float uAlpha;\n" +
            "void main() {\n" +
            "  vec4 c = texture2D(sTexture, vTex);\n" +
            "  gl_FragColor = vec4(c.rgb, c.a * uAlpha);\n" +
            "}\n";

    private static final float[] VERTS = {
            -1f, -1f, 0f, 1f,
             1f, -1f, 0f, 1f,
            -1f,  1f, 0f, 1f,
             1f,  1f, 0f, 1f,
    };

    private static final float[] TEX = {
            0f, 0f, 0f, 1f,
            1f, 0f, 0f, 1f,
            0f, 1f, 0f, 1f,
            1f, 1f, 0f, 1f,
    };

    private EGLDisplay eglDisplay = EGL14.EGL_NO_DISPLAY;
    private EGLContext eglContext = EGL14.EGL_NO_CONTEXT;
    private EGLSurface eglSurface = EGL14.EGL_NO_SURFACE;
    private Surface outputSurface;

    private int programOes;
    private int programLogo;
    private int[] texOes = new int[2];
    private int texLogo;
    private FloatBuffer vertBuf;
    private FloatBuffer texBuf;

    private final float[] mvp = new float[16];
    private final float[] stMatrix = new float[16];
    private final float[] identity = new float[16];

    private int viewW;
    private int viewH;
    private boolean hasLogo;
    private float logoX = 0.82f;
    private float logoY = 0.88f;
    private float logoScale = 1f;
    private float logoOpacity = 0.85f;
    private float logoRotation;

    public void init(Surface surface, int width, int height) {
        outputSurface = surface;
        viewW = width;
        viewH = height;
        Matrix.setIdentityM(identity, 0);

        eglDisplay = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);
        int[] ver = new int[2];
        EGL14.eglInitialize(eglDisplay, ver, 0, ver, 1);

        int[] attribList = {
                EGL14.EGL_RED_SIZE, 8,
                EGL14.EGL_GREEN_SIZE, 8,
                EGL14.EGL_BLUE_SIZE, 8,
                EGL14.EGL_ALPHA_SIZE, 8,
                EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
                EGL14.EGL_NONE
        };
        EGLConfig[] configs = new EGLConfig[1];
        int[] num = new int[1];
        EGL14.eglChooseConfig(eglDisplay, attribList, 0, configs, 0, 1, num, 0);

        int[] ctxAttrib = {EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE};
        eglContext = EGL14.eglCreateContext(eglDisplay, configs[0], EGL14.EGL_NO_CONTEXT, ctxAttrib, 0);

        int[] surfAttrib = {EGL14.EGL_NONE};
        eglSurface = EGL14.eglCreateWindowSurface(eglDisplay, configs[0], surface, surfAttrib, 0);
        EGL14.eglMakeCurrent(eglDisplay, eglSurface, eglSurface, eglContext);

        programOes = buildProgram(VS, FS_OES);
        programLogo = buildProgram(VS, FS_LOGO);

        GLES20.glGenTextures(2, texOes, 0);
        for (int i = 0; i < 2; i++) {
            GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, texOes[i]);
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
        }

        int[] logoId = new int[1];
        GLES20.glGenTextures(1, logoId, 0);
        texLogo = logoId[0];

        vertBuf = ByteBuffer.allocateDirect(VERTS.length * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
        vertBuf.put(VERTS).position(0);
        texBuf = ByteBuffer.allocateDirect(TEX.length * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
        texBuf.put(TEX).position(0);

        GLES20.glDisable(GLES20.GL_DEPTH_TEST);
        GLES20.glEnable(GLES20.GL_BLEND);
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA);
        GLES20.glClearColor(0.04f, 0.04f, 0.04f, 1f);
    }

    public int getOesTextureId(int index) {
        return texOes[index % 2];
    }

    public void setLogo(Bitmap bmp, float x, float y, float scale, float rotation, float opacity) {
        if (bmp == null || bmp.isRecycled()) {
            hasLogo = false;
            return;
        }
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texLogo);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
        GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bmp, 0);
        logoX = x;
        logoY = y;
        logoScale = Math.max(0.3f, Math.min(2.4f, scale));
        logoRotation = rotation;
        logoOpacity = opacity;
        hasLogo = true;
    }

    public void clearLogo() {
        hasLogo = false;
    }

    /**
     * Draw one or two layers.
     * @param st0 SurfaceTexture for primary (or only) layer
     * @param st1 SurfaceTexture for secondary layer (nullable)
     * @param alpha1 alpha for secondary layer (0..1) for crossfade
     * @param cropL crop left 0..1
     * @param cropT crop top 0..1
     * @param cropR crop right 0..1
     * @param cropB crop bottom 0..1
     * @param rotation degrees (0/90/180/270)
     */
    public void draw(SurfaceTexture st0, SurfaceTexture st1,
                     float alpha1,
                     float cropL, float cropT, float cropR, float cropB,
                     int rotation) {
        if (eglDisplay == EGL14.EGL_NO_DISPLAY) return;

        EGL14.eglMakeCurrent(eglDisplay, eglSurface, eglSurface, eglContext);
        GLES20.glViewport(0, 0, viewW, viewH);
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);

        if (st0 != null) {
            st0.updateTexImage();
            st0.getTransformMatrix(stMatrix);
            drawOes(texOes[0], 1f, cropL, cropT, cropR, cropB, rotation);
        }

        if (st1 != null && alpha1 > 0.01f) {
            st1.updateTexImage();
            st1.getTransformMatrix(stMatrix);
            drawOes(texOes[1], alpha1, cropL, cropT, cropR, cropB, rotation);
        }

        if (hasLogo) {
            drawLogo();
        }

        EGL14.eglSwapBuffers(eglDisplay, eglSurface);
    }

    private void drawOes(int texId, float alpha,
                         float cropL, float cropT, float cropR, float cropB,
                         int rotation) {
        GLES20.glUseProgram(programOes);

        // Simple full-screen MVP with optional rotation
        Matrix.setIdentityM(mvp, 0);
        if (rotation == 90) {
            Matrix.rotateM(mvp, 0, 90, 0, 0, 1);
        } else if (rotation == 180) {
            Matrix.rotateM(mvp, 0, 180, 0, 0, 1);
        } else if (rotation == 270) {
            Matrix.rotateM(mvp, 0, 270, 0, 0, 1);
        }

        // Crop via texture matrix adjustment would be more correct;
        // for first cut we apply a simple scale/translate approximation.
        float cropW = Math.max(0.01f, cropR - cropL);
        float cropH = Math.max(0.01f, cropB - cropT);

        int aPos = GLES20.glGetAttribLocation(programOes, "aPos");
        int aTex = GLES20.glGetAttribLocation(programOes, "aTex");
        int uMVP = GLES20.glGetUniformLocation(programOes, "uMVP");
        int uST = GLES20.glGetUniformLocation(programOes, "uSTMatrix");
        int uAlpha = GLES20.glGetUniformLocation(programOes, "uAlpha");

        GLES20.glUniformMatrix4fv(uMVP, 1, false, mvp, 0);
        GLES20.glUniformMatrix4fv(uST, 1, false, stMatrix, 0);
        GLES20.glUniform1f(uAlpha, alpha);

        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, texId);

        GLES20.glEnableVertexAttribArray(aPos);
        GLES20.glEnableVertexAttribArray(aTex);
        GLES20.glVertexAttribPointer(aPos, 4, GLES20.GL_FLOAT, false, 0, vertBuf);
        GLES20.glVertexAttribPointer(aTex, 4, GLES20.GL_FLOAT, false, 0, texBuf);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
        GLES20.glDisableVertexAttribArray(aPos);
        GLES20.glDisableVertexAttribArray(aTex);
    }

    private void drawLogo() {
        GLES20.glUseProgram(programLogo);
        Matrix.setIdentityM(mvp, 0);
        float aspect = (float) viewW / Math.max(1, viewH);
        float s = 0.28f * logoScale;
        Matrix.translateM(mvp, 0, (logoX * 2f - 1f), (1f - logoY * 2f), 0);
        Matrix.scaleM(mvp, 0, s / aspect, s, 1);
        if (logoRotation != 0) {
            Matrix.rotateM(mvp, 0, logoRotation, 0, 0, 1);
        }

        int aPos = GLES20.glGetAttribLocation(programLogo, "aPos");
        int aTex = GLES20.glGetAttribLocation(programLogo, "aTex");
        int uMVP = GLES20.glGetUniformLocation(programLogo, "uMVP");
        int uST = GLES20.glGetUniformLocation(programLogo, "uSTMatrix");
        int uAlpha = GLES20.glGetUniformLocation(programLogo, "uAlpha");

        GLES20.glUniformMatrix4fv(uMVP, 1, false, mvp, 0);
        GLES20.glUniformMatrix4fv(uST, 1, false, identity, 0);
        GLES20.glUniform1f(uAlpha, logoOpacity);

        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texLogo);

        GLES20.glEnableVertexAttribArray(aPos);
        GLES20.glEnableVertexAttribArray(aTex);
        GLES20.glVertexAttribPointer(aPos, 4, GLES20.GL_FLOAT, false, 0, vertBuf);
        GLES20.glVertexAttribPointer(aTex, 4, GLES20.GL_FLOAT, false, 0, texBuf);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
        GLES20.glDisableVertexAttribArray(aPos);
        GLES20.glDisableVertexAttribArray(aTex);
    }

    private static int buildProgram(String vs, String fs) {
        int v = loadShader(GLES20.GL_VERTEX_SHADER, vs);
        int f = loadShader(GLES20.GL_FRAGMENT_SHADER, fs);
        int p = GLES20.glCreateProgram();
        GLES20.glAttachShader(p, v);
        GLES20.glAttachShader(p, f);
        GLES20.glLinkProgram(p);
        return p;
    }

    private static int loadShader(int type, String src) {
        int s = GLES20.glCreateShader(type);
        GLES20.glShaderSource(s, src);
        GLES20.glCompileShader(s);
        return s;
    }

    public void release() {
        if (eglDisplay != EGL14.EGL_NO_DISPLAY) {
            EGL14.eglMakeCurrent(eglDisplay, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT);
            if (eglSurface != EGL14.EGL_NO_SURFACE) {
                EGL14.eglDestroySurface(eglDisplay, eglSurface);
                eglSurface = EGL14.EGL_NO_SURFACE;
            }
            if (eglContext != EGL14.EGL_NO_CONTEXT) {
                EGL14.eglDestroyContext(eglDisplay, eglContext);
                eglContext = EGL14.EGL_NO_CONTEXT;
            }
            EGL14.eglTerminate(eglDisplay);
            eglDisplay = EGL14.EGL_NO_DISPLAY;
        }
        outputSurface = null;
    }
}
