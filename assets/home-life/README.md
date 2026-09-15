# Home Life assets

Home Life uses the original Blender source `home-furnishings.blend` for its furniture set: chair, table, rug and shelf. The public optimized GLB is approximately 3.824 MB with about 31,800 triangles. Exported files are regenerated with `tools/art/home_life`; generated outputs remain separate from the source artwork.

Unreal validation covered all four furniture assets at the intended scale. The MCP appended review scene was used to inspect the authored forms and placement. The runtime keeps collision and room logic in the build system, so the authored furniture does not replace the enclosure or navigation rules.

Home Life has no new animation set and no new combat type. Chairs, tables and rugs support the enclosed-room comfort rule; shelves provide the keepsake interaction surface. Keepsake IDs are validated against the campaign's known facts before they are accepted.

Route risk and weather are runtime systems described in the project README: broadcast salvage waits for a defended resolution. Dust fronts progress through forecast, front and clearing phases; extra hydration drain rises with their intensity and fades during clearing. Enclosed rooms prevent the extra drain.
