"""
Sentinel Spatial Pipeline — standalone CLI

Usage:
    python pipeline.py <path/to/scene.ply> [--cameras N] [--out manifest.json] [--no-viz]

Steps:
    1. Load PLY → RANSAC + DBSCAN → Spatial Manifest JSON
    2. Print manifest summary
    3. Stream K2 Think V2 → camera placements
    4. Open Open3D window with colourised cloud + frustums
    5. (Optional) render each camera's POV and save as PNG

Set K2_THINK_API_KEY in .env or as an environment variable before running.
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Add backend root to path so services import cleanly
sys.path.insert(0, str(Path(__file__).parent))

from app.services.spatial_analysis import analyze_pointcloud, save_manifest
from app.services.k2_spatial import stream_k2_placement, parse_placements
from app.services.visualization import show_scene, render_camera_view, save_render

import open3d as o3d


# ─── CLI ─────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Sentinel spatial pipeline")
    p.add_argument("ply",              help="Path to input .ply file")
    p.add_argument("--cameras", "-n",  type=int, default=5, help="Number of cameras K2 should place")
    p.add_argument("--out",    "-o",   default="manifest.json", help="Output manifest JSON path")
    p.add_argument("--no-viz",         action="store_true", help="Skip Open3D visualisation window")
    p.add_argument("--render-pov",     action="store_true", help="Render POV images for each camera")
    p.add_argument("--render-dir",     default="renders",   help="Directory to save POV renders")
    p.add_argument("--skip-k2",        action="store_true", help="Skip K2 call (only run spatial analysis)")
    return p.parse_args()


def print_manifest_summary(manifest: dict) -> None:
    meta   = manifest.get("scene_metadata", {})
    walls  = manifest.get("structural_planes", {}).get("walls", [])
    obs    = manifest.get("obstacles", [])
    ents   = manifest.get("entry_candidates", [])
    sight  = manifest.get("sight_line_summary", {})

    print("\n" + "═" * 60)
    print("  SPATIAL MANIFEST SUMMARY")
    print("═" * 60)
    print(f"  Points        : {meta.get('point_count', '?'):,}")
    print(f"  Floor area    : {meta.get('estimated_floor_area_m2', '?')} m²")
    print(f"  Ceiling height: {meta.get('estimated_ceiling_height_m', '?')} m")
    print(f"  Walls found   : {len(walls)}")
    print(f"  Obstacles     : {len(obs)}")
    print(f"  Entry points  : {len(ents)}")
    print(f"  Open sightlines: {sight.get('estimated_open_sightlines_pct', '?')}%")
    if obs:
        print(f"\n  Largest obstacle: {sight.get('largest_obstacle', '?')}")
    if ents:
        print("\n  Entry candidates:")
        for e in ents:
            print(f"    {e['id']} ({e['type']}): {e['position_xyz']}, width {e['gap_width_m']}m")
    print("═" * 60 + "\n")


async def run_k2(manifest: dict, n_cameras: int) -> list[dict]:
    """Stream K2, print tokens live, return parsed placements."""
    api_key = os.getenv("K2_THINK_API_KEY", "")
    if not api_key:
        print("\n[!] K2_THINK_API_KEY not set. Skipping K2 placement.\n")
        return []

    print("\n" + "─" * 60)
    print("  K2 Think V2 — Reasoning\n")

    full_text = ""
    async for _phase, chunk in stream_k2_placement(manifest, n_cameras):
        print(chunk, end="", flush=True)
        full_text += chunk

    print("\n" + "─" * 60)

    try:
        result = parse_placements(full_text)
        cameras = result.get("cameras", [])
        print(f"\n✓ Parsed {len(cameras)} camera placements")
        print(f"  Estimated coverage: {result.get('estimated_total_coverage_pct', '?')}%\n")
        for cam in cameras:
            print(f"  {cam['id']}: {cam['position_xyz']}  pan={cam.get('pan_deg','?')}°  tilt={cam.get('tilt_deg','?')}°  {cam.get('type','?')}")
            print(f"    → {cam.get('rationale','')}")
        return cameras
    except ValueError as e:
        print(f"\n[!] Could not parse placements: {e}")
        return []


def main():
    args = parse_args()

    # ── Step 1: Spatial analysis ───────────────────────────────
    ply_path = Path(args.ply)
    if not ply_path.exists():
        print(f"[!] File not found: {ply_path}")
        sys.exit(1)

    print(f"\n→ Loading point cloud: {ply_path}")
    pcd = o3d.io.read_point_cloud(str(ply_path))
    print(f"  {len(pcd.points):,} points loaded")

    print("→ Running spatial analysis (RANSAC + DBSCAN)…")
    manifest = analyze_pointcloud(ply_path)
    save_manifest(manifest, args.out)
    print(f"  Manifest saved → {args.out}")

    print_manifest_summary(manifest)

    # ── Step 2: K2 placement ───────────────────────────────────
    camera_placements = []
    if not args.skip_k2:
        camera_placements = asyncio.run(run_k2(manifest, args.cameras))

    # ── Step 3: Optional POV renders ──────────────────────────
    if args.render_pov and camera_placements:
        render_dir = Path(args.render_dir)
        render_dir.mkdir(exist_ok=True)
        print(f"\n→ Rendering camera POV images → {render_dir}/")
        for cam in camera_placements:
            print(f"  Rendering {cam['id']}…", end=" ", flush=True)
            rgba = render_camera_view(pcd, manifest, cam)
            out  = render_dir / f"{cam['id']}_pov.png"
            save_render(rgba, out)
            print(f"saved {out.name}")

    # ── Step 4: Visualisation window ──────────────────────────
    if not args.no_viz:
        print("\n→ Opening Open3D visualisation window…")
        print("  Colours: grey=floor  blue=walls  amber=obstacles  red=entries")
        print("  Green wireframes = K2-placed cameras (frustums)\n")
        show_scene(pcd, manifest, camera_placements)


if __name__ == "__main__":
    main()
