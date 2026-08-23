# Peek Preview

On-device highlight sampler. Cut clips, crop, add transitions and a watermark, then export an MP4 — all in the browser. Nothing is uploaded.

## Install on your phone

GitHub is the **source code**, not the live app.

1. Open the published Peek Preview link from Grok (the `*.grok.me` share URL) in **Chrome**
2. Chrome menu → **Install app** / Add to Home Screen

Do not try to install from the in-chat preview. Chrome will not offer a real install there.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints and use it as a PWA from a normal browser tab.

## What it does

- Import clips or load the demo reel
- Cut, crop, and move the frame
- Fade / slide / zoom / twist between cuts
- Drag a watermark
- Export a composed MP4 on-device
