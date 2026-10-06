# V1 beta integration and native gameplay trailer

This delivery gathers the completed local beta work for main: the accepted
intro interception and blue swords, selected Qwen voice B and reproducible local
voice tooling, story recordings, campaign/onboarding follow-ups, five presentation
improvements, and the full-playthrough fixes. The original journals and their
historical local-only status statements remain as dated evidence.

The runtime is still `6076494f06c0976fb2005eaf4642b9f6d0bb3c236a02579ff98a9f35e986a975`.
Trailer tooling only adds an export-excluded test harness, capture/edit scripts
and media/docs. It does not change game audio, personal saves or the shipping
runtime. The existing validated Windows ZIP and its release receipt remain valid.
Itch.io account/project setup is still deferred by the user.

Git's existing LF policy normalizes 42 runtime text files on a fresh checkout.
The equivalent Git checkout fingerprint is
`dc54b605254dafc2c3fc316ae250cd7eccaf1283cc85045bba55d282e0337fc0`.
Every difference was checked to be CRLF-to-LF only; the exported package and
captures retain their original measured identity. See the
[integration receipt](results/v1-trailer-integration-2026-10-05.json).

## Trailer

- 56 seconds of normal-speed native footage at 1920 x 1080 / 30 FPS.
- Hook catch recovers 18 scrap; construction succeeds through normal placement;
  the drone passes pickup, lift, home and settlement phases; three staged enemies
  are defeated; Gatekeeper fires and withdraws after return fire.
- Prepared checkpoints, invulnerability, hidden HUD and external cameras are
  disclosed. No intro footage, still-image shots or cloned-frame padding.
- Original NumPy score mixed with captured native effects. Final measured
  loudness is -16.83 LUFS, true peak -1.28 dBTP, stereo 48 kHz AAC.
- Final video is 97,755,392 bytes, SHA-256
  `909087d53176937b8941fb0b4907d9184f2d72b18215957902f3b7c2b17b9d82`.
- Full decoding, 1,680-frame count, sampled framing/title inspection, Chrome
  playback, twelve seeks, served-file hash and desktop/mobile player layout pass.
  Automated playback was muted; this does not claim human listening review.

See [media documentation](../media/README.md), [capture/edit evidence](../media/capture-verification.json),
[media checks](../media/media-verification.json) and [browser checks](../media/playback-verification.json).

Review discarded obstructed salvage/home camera angles and an early title with
Windows newline artifacts; replacements were inspected before export. A trial
port-crane take lost the claw/cargo framing and recorded only its reach phase
within 14 seconds. It was omitted, not presented as a successful pickup. The
final automation shot uses the verified complete drone cycle. No production
crane defect is established by that short presentation fixture.

## Integration checks

- 1,786 browser-project tests pass, lint passes, galley/workshop/progression
  asset validators pass, and production build passes. Its existing large-bundle
  warning remains a warning.
- The prior native acceptance remains 1,207 focused checks plus 280 native UI
  checks, five affected performance workloads and Windows package verification.
  These are recorded in the [playthrough follow-up](v1-playthrough-fixes-2026-10-05.md),
  not claimed as a new full campaign run during trailer production.
- Finished `codex/mobile-model-gallery` documentation is included. Other old
  feature branches have merged PRs; August WIP worktrees contain superseded
  browser experiments/debug probes and are preserved rather than replayed over
  the current native game. Unrelated dealer/VPC project folders are excluded.
