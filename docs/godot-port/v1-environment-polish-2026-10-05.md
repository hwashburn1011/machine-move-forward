# V1 environment polish — 5 October 2026



Completed P3/P4 on source `c084dfa83351dfb6449ce9221e70cf2b675e948300ebdd65dc13f9de8fdfe2b8`. Final native capture kept that source and all environment inputs stable. This pass changes roadside composition and three equipment finishes; it adds no enemies, resources, rewards or interaction rules.



## Composition



Existing foreground assets now form six recognizable uses: a motor service yard, motel stop, parcel yard, maintenance convoy, old checkpoint and pump service stop. Matching support replaces unrelated random support. Initial 18m/15m offsets still looked scattered in native deck views; the final 11m/7m offsets use outward fallback whenever real footprints require more space. Shop fronts angle toward the approaching machine, fixing the Cinder lift's blank side wall dominating its first view. Signs retain their roadside orientation.



Two or three adjacent quiet rows occur at varying offsets in each nine-row region. These retain one lone foreground silhouette rather than filling every stretch. The existing shuffled foreground bag still gives every authored model a turn. Across three seeds and 720 rows, **201 quiet rows** and **3886 landmarks** were observed, within **1–11 landmarks per row**. No new geometry, global tint or scatter noise was introduced.



## Purposeful finish



Three pre-baked vertex-color refinements add lower support grime, residue beside the auto lift's working guide, oxide at the water crane's lower flange/valve, and localized compressor fitting residue. Existing lettering, masonry, palette, paint textures and bevels remain intact. Structural steel now has a less polished response; aged alloy remains distinct. The final close comparisons show the lower crane flange weathered while its upper flange remains cleaner, and darker residue beside the lift guide. Compressor treatment is subtler.



The first wide comparison was too weak to justify the change visually. The final review includes matched approach-distance details, and tests confirm the vertex colors are active in the native material. Wide before/after pairs include material response plus wear; detail pairs use the same response to isolate the wear. No claim is made that fine fitting wear is readable from the top deck.



The three resources total **379,650 bytes** compressed, with **686,744 bytes** of base vertex/attribute/index buffers (original source meshes remain cached), including **70,856 additional color bytes**. Existing materials, shadow meshes, surface counts, packed vertices, normals, tangents, UVs, indices and every LOD buffer are retained. No per-instance material, extra surface, shader pass or collision is added. Baking is offline via `godot/tools/bake_roadside_wear.gd`; runtime only loads/binds the shared resources during world setup. Headless warm-OS-cache load/bind samples were {'art200-cinder-auto-lift': 0.876, 'art200-crosswind-compressor-house': 1.866, 'art200-rail-water-crane': 1.175}; these are not gameplay frame timings.



## Validation and review



- **28,152 focused checks**: three seeds/720 rows, complete foreground catalog, deterministic placement, actual transformed travel/dock/seam clearance, separated footprints, one-sign cap, all six uses, byte-identical mesh/LOD geometry, current provenance, active vertex colors and shared materials.

- **18 streaming lifecycle checks**: prepared forward/lateral crossings, bounded caches, course reversal and teardown.

- **6,616 exact Art200/collision checks** passed earlier in this pass, before final spacing/yaw/color-strength adjustment. Final focused checks separately validate the adjusted placements and unchanged geometry.

- **25 final native PNGs**: upper/lower deck views for six uses, quiet interval, three wide before/after pairs and three detail pairs. No native diagnostics. This is a static visual review, not a campaign or human-play test.



Streaming budget stays **800 microseconds per preparation slice**, 27 active chunks, existing prepared-cache limits, **72m/96m collision activation/removal** and **32 cached collision assemblies**. Collision assets and source GLBs were not changed. Final integrated performance/release validation is recorded separately when completed.



Evidence: [portable receipt](results/v1-environment-polish-2026-10-05.json); native files under `test-results/v1-environment-polish-20261005/`. Rejected embedded-resource duplication and the primitive-floor review fixture were corrected and retained in the evidence directory. First native spacing/finish captures remain under `first-native-spacing/`.
