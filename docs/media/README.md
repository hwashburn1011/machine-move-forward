# Gameplay trailer

[Watch with playback controls](https://hwashburn1011.github.io/machine-move-forward/trailer/)
or open `machine-move-forward-trailer.mp4` in a media player.

The 40-second trailer shows the actual browser build: the walking machine,
salvage reel, gunboat combat, Relay Foundry and automatic equipment. Scene setups
and an external camera are used for presentation; gameplay inputs, animation,
physics and rendering run in the game. This is in-development footage, not a
claim that the entire progression occurs within forty seconds.

The soundtrack is original synthesized audio made with NumPy. There are no
third-party music samples or stock video clips. Blender artwork provenance is
recorded in [ASSETS.md](../../ASSETS.md).

Final export: 40 seconds, 1280×720 at 30 FPS, H.264 video and 48 kHz AAC audio,
8.18 MiB. Playback, seeking, title layout and sampled frames were checked in
Chrome. Audio peaks at −3.3 dBFS. The combat scene was recaptured after fixing
the stationary character's aiming direction.

## Reproduce on Windows

Requirements: the project's Node dependencies, Chrome, Python with NumPy,
FFmpeg/ffprobe, and Windows Bahnschrift. Start Vite on port 5193, then run:

```powershell
node tools/trailer/capture.mjs
python tools/trailer/soundtrack.py
node tools/trailer/compose.mjs
npm run build
node tools/build-media.mjs
```

Capture uses hardware-accelerated Chrome at 1280×720. Run it without another
GPU test in parallel. Pass a scene name (`walker`, `salvage`, `combat`, `foundry`
or `automation`) to recapture that scene. Raw recordings, soundtrack WAV and
edit intermediates live under ignored `assets/trailer/`; the final H.264/AAC
MP4 and poster are versioned here. `tools/build-media.mjs` places the final
media beside the static video player for GitHub Pages deployment.
