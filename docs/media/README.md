# Gameplay trailer

[Watch with playback controls](https://hwashburn1011.github.io/machine-move-forward/trailer/)
or open `machine-move-forward-trailer.mp4` in a media player.

The 46-second trailer shows the current browser build: the four-legged Iron
Nomad, playable S-07 gunner, Warden, Revenant, Bastion and Sovereign, rifle combat,
radio-chest recovery and the workshop deck. Encounters and camera angles are
staged for presentation, with invulnerability and random spawning disabled.
Character close-ups use actual in-game idle animation. Combat uses normal mouse
inputs; the salvage scene uses the game's reel state machine with an exterior
camera override. The HUD is hidden for the edit. This is in-development footage,
not a claim that the entire progression occurs within forty-six seconds.

The soundtrack is original synthesized audio made with NumPy. There are no
third-party music samples or stock video clips. Blender artwork provenance is
recorded in [ASSETS.md](../../ASSETS.md).

Final export: **46 seconds, 1280×720 at 30 FPS**, H.264 video and stereo 48 kHz
AAC audio, 12.55 MiB. Fast-start metadata supports streaming. The soundtrack
peaks at −7.0 dBFS and averages −25.3 dBFS. Playback, seeking, title layout and
sampled frames were checked in Chrome. Capture checks require loaded authored
models, advancing simulation, actual shots/hits/kills and a recovered radio chest.
See [capture evidence](capture-verification.json) and [playback checks](playback-verification.json).

## Reproduce on Windows

Requirements: the project's Node dependencies, Chrome, Python with NumPy,
FFmpeg/ffprobe, and Windows Bahnschrift. Start Vite on port 5193, then run:

```powershell
node tools/trailer/capture.mjs
python tools/trailer/soundtrack.py
node tools/trailer/compose.mjs
npm run build -- --base=/machine-move-forward/
node tools/build-media.mjs
npm run preview -- --port 5198 --base=/machine-move-forward/
# In another terminal:
node tools/trailer/verify.mjs
```

Capture uses hardware-accelerated Chrome at 1280×720. Run it without another
GPU test in parallel. Pass a scene name (`walker`, `hero`, `warden`, `revenant`,
`bastion`, `sovereign`, `combat`, `salvage` or `decks`) to recapture that scene.
Set `MMF_PORT` to capture a different dev server and `MMF_VERIFY_URL` to verify
a different deployment. Raw recordings, soundtrack WAV and
edit intermediates live under ignored `assets/trailer/`; the final H.264/AAC
MP4 and poster are versioned here. `tools/build-media.mjs` places the final
media beside the static video player for GitHub Pages deployment.
