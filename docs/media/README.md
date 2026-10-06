# Native Windows beta gameplay trailer

[Watch with playback controls](https://hwashburn1011.github.io/machine-move-forward/trailer/)
or open `machine-move-forward-trailer.mp4` locally.

The 56-second edit contains moving footage from the current native Godot game:
the walking Iron Nomad, a successful hook catch, real construction placement,
a drone collecting and returning cargo, Glass Orchard exploration, close combat
and a Gatekeeper salvo. The final title remains over the moving machine.
There is no intro footage, still-image montage or artificial slow/fast motion.

Checkpoints, encounters and camera positions are staged for presentation. The
actor is invulnerable and the HUD is hidden. Production action/state authorities
handle the catch, placement, drone cycle and combat; this is not a continuous
playthrough. Fixed-rate Movie Maker capture is not performance evidence.
The shipping runtime remains `6076494f06c0976fb2005eaf4642b9f6d0bb3c236a02579ff98a9f35e986a975`.

The trailer mixes recorded native game sounds with an original 90 BPM score
synthesized using NumPy. No music samples, stock footage, paid APIs or new
runtime audio are used. The selected intro voice B and in-game mix are unchanged.
Artwork provenance is in [ASSETS.md](../../ASSETS.md).

Export: **56 seconds, 1920 x 1080, 30 FPS, H.264/AAC stereo 48 kHz**, with fast-start
metadata. Source events, edit in-points and final file hash are retained in
[capture-verification.json](capture-verification.json). Browser playback and
seeking checks are in [playback-verification.json](playback-verification.json).
The webpage clearly distinguishes this native beta from the older browser game.
Public itch.io distribution remains deferred until its account/project is set up.

## Reproduce on Windows

Requirements: Godot 4.7.2 at the path in `native_capture.py`, Python with NumPy,
FFmpeg/ffprobe, Windows Bahnschrift, project Node dependencies and Chrome.
Run native captures sequentially on the GPU. They use an isolated temporary
save profile and a temporary resolution override, removed on completion.

```powershell
python tools/trailer/native_capture.py
python tools/trailer/native_score.py
python tools/trailer/native_compose.py
npm run build -- --base=/machine-move-forward/
node tools/build-media.mjs
npm run preview -- --port 5198 --base=/machine-move-forward/
# In another terminal:
node tools/trailer/native_verify.mjs
```

Pass individual shot names to `native_capture.py` to recapture a scene. Native
masters, score WAV and edit intermediates live in ignored `assets/trailer/native-v1/`.
Large temporary AVIs are retired after their compressed masters are created.
Only the finished video, poster, documentation and portable receipts are tracked.
The earlier browser capture/compose/verify scripts remain historical tooling;
use the `native_*` workflow for this trailer.
