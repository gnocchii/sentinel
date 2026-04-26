"""
Mesh-based camera placement optimization.

Pipeline:
  1.  Load USDZ / OBJ / GLB / PLY mesh via trimesh
  2.  Detect floor (lowest horizontal plane) + walls (vertical faces)
  3.  Sample a grid of coverage points on the floor plane
  4.  Ask K2 Think V2 for M > N candidate camera positions (heuristic pass)
  5.  Raycast each candidate → boolean visibility set over coverage points
  6.  Greedy set-cover: pick N cameras that maximise total new coverage
  7.  Render a top-down coverage heatmap as a PNG

All units are metres.  Coordinate axes: X=east, Y=north, Z=up.
"""

from __future__ import annotations
import io
import math
import tempfile
from pathlib import Path
from typing import Optional

import numpy as np


# ─── Mesh loading ────────────────────────────────────────────────

def _load_usdz_pxr(path: str):
    """
    Load USDZ via OpenUSD (pxr). Requires: pip install usd-core
    Extracts all UsdGeom.Mesh prims, applies world transforms, triangulates, concatenates.
    """
    import trimesh
    from pxr import Usd, UsdGeom  # type: ignore[import]

    stage = Usd.Stage.Open(str(path))
    all_verts: list[np.ndarray] = []
    all_faces: list[np.ndarray] = []
    v_offset = 0

    for prim in stage.Traverse():
        if not prim.IsA(UsdGeom.Mesh):
            continue
        mesh_prim = UsdGeom.Mesh(prim)

        pts = mesh_prim.GetPointsAttr().Get()
        if pts is None or len(pts) == 0:
            continue

        verts        = np.array(pts, dtype=np.float64)
        face_counts  = np.array(mesh_prim.GetFaceVertexCountsAttr().Get(),  dtype=np.int32)
        face_indices = np.array(mesh_prim.GetFaceVertexIndicesAttr().Get(), dtype=np.int32)

        # Apply world transform
        try:
            xformable = UsdGeom.Xformable(prim)
            mat = xformable.ComputeLocalToWorldTransform(Usd.TimeCode.Default())
            m   = np.array(mat).reshape(4, 4)
            verts = (np.hstack([verts, np.ones((len(verts), 1))]) @ m)[:, :3]
        except Exception:
            pass

        # Triangulate (fan from first vertex for n-gons)
        cursor = 0
        for count in face_counts:
            idxs = face_indices[cursor : cursor + count]
            for k in range(1, count - 1):
                all_faces.append([idxs[0] + v_offset, idxs[k] + v_offset, idxs[k + 1] + v_offset])
            cursor += count

        all_verts.append(verts)
        v_offset += len(verts)

    if not all_verts:
        raise ValueError("No UsdGeom.Mesh prims found in USDZ")

    return trimesh.Trimesh(
        vertices = np.vstack(all_verts),
        faces    = np.array(all_faces, dtype=np.int32),
        process  = True,
    )


def _load_usdz_zip_fallback(path: str):
    """
    USDZ is a ZIP64 archive. If pxr is unavailable, extract and look for
    embedded OBJ / GLB / PLY files (some exporters include them).
    """
    import zipfile, tempfile
    loadable = {".obj", ".glb", ".gltf", ".ply", ".stl"}
    with zipfile.ZipFile(path, "r") as zf:
        for name in zf.namelist():
            ext = Path(name).suffix.lower()
            if ext in loadable:
                data = zf.read(name)
                with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                    tmp.write(data)
                    tmp_path = tmp.name
                try:
                    return load_mesh(tmp_path)
                except Exception:
                    pass
                finally:
                    Path(tmp_path).unlink(missing_ok=True)
    raise ValueError(
        "Could not load USDZ: pxr (usd-core) is not installed and no "
        "embedded OBJ/GLB was found.\n"
        "Fix: pip install usd-core"
    )


# Rotation matrices (4×4 homogeneous)
# +90° around X: Y-up  → Z-up  — (x,y,z) → (x,-z, y)
_Y_UP_TO_Z_UP = np.array([[1,0, 0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]], dtype=float)
# -90° around X: Z-up  → Y-up  — (x,y,z) → (x, z,-y)  (inverse / for GLB export)
_Z_UP_TO_Y_UP = np.array([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]], dtype=float)


def _normalize_to_z_up(mesh):
    """
    Detect if the mesh is Y-up (Apple USDZ default) and rotate to Z-up
    so downstream floor/wall detection (which assumes Z-up) works correctly.
    Uses face normals: the axis with the highest average absolute alignment
    across all faces is the 'up' axis.
    """
    avg = np.abs(mesh.face_normals).mean(axis=0)  # [avg_x, avg_y, avg_z]
    up_axis = int(np.argmax(avg))
    if up_axis == 1:  # Y-up → rotate to Z-up
        mesh = mesh.copy()
        mesh.apply_transform(_Y_UP_TO_Z_UP)
    return mesh


def export_mesh_glb(mesh) -> bytes:
    """
    Convert the Z-up analysis mesh back to Y-up (Three.js / GLTF standard)
    and export as GLB bytes.
    """
    display = mesh.copy()
    display.apply_transform(_Z_UP_TO_Y_UP)
    buf = io.BytesIO()
    display.export(buf, file_type="glb")
    return buf.getvalue()


def load_mesh(path: str | Path):
    """
    Load any mesh into a single trimesh.Trimesh, normalised to Z-up.
    USDZ: tries pxr/OpenUSD first, then ZIP extraction.
    Everything else: uses trimesh directly.
    """
    import trimesh

    path = Path(path)
    ext  = path.suffix.lower()

    if ext == ".usdz":
        try:
            mesh = _load_usdz_pxr(str(path))
        except ImportError:
            mesh = _load_usdz_zip_fallback(str(path))
        except Exception:
            mesh = _load_usdz_zip_fallback(str(path))
    else:
        loaded = trimesh.load(str(path), force="scene")
        if isinstance(loaded, trimesh.Scene):
            geos = [g for g in loaded.geometry.values() if len(g.faces) > 0]
            if not geos:
                raise ValueError("Mesh file contains no geometry")
            mesh = trimesh.util.concatenate(geos)
        elif isinstance(loaded, trimesh.Trimesh):
            mesh = loaded
        else:
            raise ValueError(f"Unexpected trimesh type: {type(loaded)}")

        if not mesh.is_volume:
            mesh.fill_holes()

    return _normalize_to_z_up(mesh)


# ─── Floor detection ─────────────────────────────────────────────

def detect_floor(mesh) -> dict:
    """
    Find the floor: faces whose normal is nearly +Z and whose centroid Z is
    near the mesh minimum.  Returns floor metadata dict.
    """
    normals  = mesh.face_normals
    verts    = mesh.vertices
    faces    = mesh.faces

    up_mask  = np.abs(normals[:, 2]) > 0.85
    face_z   = verts[faces].mean(axis=1)[:, 2]
    min_z    = face_z.min()

    floor_mask = up_mask & (face_z < min_z + 0.15)

    if floor_mask.sum() < 3:
        # Fallback: use absolute minimum Z of all vertices
        z_floor    = float(verts[:, 2].min())
        floor_verts = verts
    else:
        z_floor     = float(verts[faces[floor_mask]].reshape(-1, 3)[:, 2].mean())
        floor_verts = verts[faces[floor_mask]].reshape(-1, 3)

    return {
        "z_elevation": round(z_floor, 3),
        "bounds": {
            "xmin": round(float(floor_verts[:, 0].min()), 3),
            "xmax": round(float(floor_verts[:, 0].max()), 3),
            "ymin": round(float(floor_verts[:, 1].min()), 3),
            "ymax": round(float(floor_verts[:, 1].max()), 3),
        },
    }


# ─── Wall detection ──────────────────────────────────────────────

def detect_walls(mesh) -> list[dict]:
    """
    Find wall surfaces: faces with near-vertical normals (|normal.z| < 0.25).
    Groups them into distinct planes by quantising the normal direction and
    perpendicular position — no sklearn dependency needed.
    """
    normals = mesh.face_normals
    verts   = mesh.vertices
    faces   = mesh.faces

    vert_mask = np.abs(normals[:, 2]) < 0.25
    if vert_mask.sum() < 5:
        return []

    idxs     = np.where(vert_mask)[0]
    centroids = verts[faces[idxs]].mean(axis=1)

    # Quantise: bin normal angle into 16 directions + perp position in 0.5 m bins
    angles = np.degrees(np.arctan2(normals[idxs, 0], normals[idxs, 1])) % 360
    angle_bin = (angles / 22.5).astype(int)

    perp = (centroids[:, 0] * normals[idxs, 0] +
            centroids[:, 1] * normals[idxs, 1])
    perp_bin = (perp / 0.5).astype(int)

    key = angle_bin * 10000 + perp_bin
    walls = []
    for k in np.unique(key):
        mask   = key == k
        if mask.sum() < 5:
            continue
        fverts = verts[faces[idxs[mask]].flatten()]
        avg_n  = normals[idxs[mask]].mean(axis=0)
        walls.append({
            "id": f"wall_{len(walls)}",
            "normal": [round(float(x), 3) for x in avg_n],
            "bounds": {
                "xmin": round(float(fverts[:, 0].min()), 3),
                "xmax": round(float(fverts[:, 0].max()), 3),
                "ymin": round(float(fverts[:, 1].min()), 3),
                "ymax": round(float(fverts[:, 1].max()), 3),
                "zmin": round(float(fverts[:, 2].min()), 3),
                "zmax": round(float(fverts[:, 2].max()), 3),
            },
        })

    return walls


# ─── Coverage grid ───────────────────────────────────────────────

def sample_coverage_grid(
    floor: dict,
    resolution: float = 0.5,
) -> np.ndarray:
    """
    Return an (N, 3) array of sample points across the floor at knee height.
    These are the ground-truth points used to compute % area covered.
    """
    b  = floor["bounds"]
    z  = floor["z_elevation"] + 0.5   # knee height — representative for coverage

    xs = np.arange(b["xmin"] + resolution / 2, b["xmax"], resolution)
    ys = np.arange(b["ymin"] + resolution / 2, b["ymax"], resolution)
    xx, yy = np.meshgrid(xs, ys)
    pts = np.column_stack([xx.ravel(), yy.ravel(), np.full(xx.size, z)])
    return pts.astype(np.float64)


# ─── Visibility raycasting ───────────────────────────────────────

def compute_visibility(
    mesh,
    camera_pos: np.ndarray,
    coverage_points: np.ndarray,
    fov_h_deg: float = 90.0,
    fov_v_deg: float = 60.0,
    pan_deg: float   = 0.0,
    tilt_deg: float  = -30.0,
    max_dist: float  = 12.0,
) -> np.ndarray:
    """
    Returns a boolean array (len == len(coverage_points)).
    True  → point is within FOV and has an unobstructed line of sight.
    False → out of FOV or occluded by mesh geometry.
    """
    # ── Camera forward vector ─────────────────────────────────────
    pan_r  = math.radians(pan_deg)
    tilt_r = math.radians(tilt_deg)
    fwd = np.array([
        math.sin(pan_r) * math.cos(tilt_r),
        math.cos(pan_r) * math.cos(tilt_r),
        math.sin(tilt_r),
    ])
    fwd /= np.linalg.norm(fwd) + 1e-9

    # ── Vectors to each coverage point ───────────────────────────
    to_pts = coverage_points - camera_pos
    dists  = np.linalg.norm(to_pts, axis=1)

    in_range = dists <= max_dist
    safe_d   = np.where(dists > 0, dists, 1.0)
    dirs     = to_pts / safe_d[:, np.newaxis]

    # ── FOV cone test ─────────────────────────────────────────────
    # Use half-diagonal of the FOV rectangle as the cone half-angle
    half_diag = math.radians(math.sqrt(fov_h_deg ** 2 + fov_v_deg ** 2) / 2) / 2
    cos_thresh = math.cos(half_diag)
    dot_fwd   = dirs @ fwd
    in_fov    = (dot_fwd >= cos_thresh) & in_range

    candidate_idx = np.where(in_fov)[0]
    if len(candidate_idx) == 0:
        return np.zeros(len(coverage_points), dtype=bool)

    # ── Raycasting ────────────────────────────────────────────────
    # Offset origin slightly along ray to avoid self-intersection on mesh surface
    eps = 0.02
    origins    = camera_pos + eps * dirs[candidate_idx]
    directions = dirs[candidate_idx]

    hit_pts, ray_idx, _ = mesh.ray.intersects_location(
        origins, directions, multiple_hits=False
    )

    occluded = set()
    for hit_pos, ridx in zip(hit_pts, ray_idx):
        # Distance from original camera_pos to hit
        hit_dist    = float(np.linalg.norm(hit_pos - camera_pos))
        target_dist = float(dists[candidate_idx[ridx]])
        if hit_dist < target_dist - 0.08:
            occluded.add(int(ridx))

    visible_local = np.array(
        [i not in occluded for i in range(len(candidate_idx))], dtype=bool
    )

    result = np.zeros(len(coverage_points), dtype=bool)
    result[candidate_idx[visible_local]] = True
    return result


# ─── Greedy set-cover selection ──────────────────────────────────

def greedy_select(
    visibility_sets: list[np.ndarray],
    n_cameras: int,
) -> list[int]:
    """
    Greedy set cover: at each step pick the candidate that adds the most
    previously-uncovered points.  O(M * N) — fast enough for M ≤ 20.
    """
    n_pts   = visibility_sets[0].shape[0]
    covered = np.zeros(n_pts, dtype=bool)
    chosen  = []

    for _ in range(min(n_cameras, len(visibility_sets))):
        best_i, best_gain = -1, -1
        for i, vis in enumerate(visibility_sets):
            if i in chosen:
                continue
            gain = int((vis & ~covered).sum())
            if gain > best_gain:
                best_gain, best_i = gain, i
        if best_i < 0:
            break
        chosen.append(best_i)
        covered |= visibility_sets[best_i]

    return chosen


# ─── K2 manifest builder ─────────────────────────────────────────

def build_mesh_manifest(mesh, floor: dict, walls: list[dict]) -> dict:
    """Convert mesh-derived geometry into the Spatial Manifest format K2 expects."""
    v    = mesh.vertices
    b    = floor["bounds"]
    area = (b["xmax"] - b["xmin"]) * (b["ymax"] - b["ymin"])
    ceil = round(float(v[:, 2].max() - floor["z_elevation"]), 2)

    manifest_walls = []
    for w in walls:
        wb = w["bounds"]
        dx, dy = wb["xmax"] - wb["xmin"], wb["ymax"] - wb["ymin"]
        manifest_walls.append({
            "id":        w["id"],
            "direction": "x-axis" if dx > dy else "y-axis",
            "length_m":  round(max(dx, dy), 2),
            "height_m":  round(wb["zmax"] - wb["zmin"], 2),
            "extent":    wb,
        })

    return {
        "scene_metadata": {
            "point_count":                  len(v),
            "estimated_floor_area_m2":      round(area, 1),
            "estimated_ceiling_height_m":   ceil,
            "bounds": {
                "xmin": round(float(v[:, 0].min()), 3),
                "xmax": round(float(v[:, 0].max()), 3),
                "ymin": round(float(v[:, 1].min()), 3),
                "ymax": round(float(v[:, 1].max()), 3),
                "zmin": round(float(v[:, 2].min()), 3),
                "zmax": round(float(v[:, 2].max()), 3),
            },
        },
        "structural_planes": {
            "floor": {"z_elevation_m": floor["z_elevation"]},
            "walls": manifest_walls,
        },
        "obstacles":        [],
        "entry_candidates": [],
        "sight_line_summary": {
            "estimated_open_sightlines_pct": 80.0,
            "total_occlusion_area_m2":       0.0,
            "largest_obstacle":              None,
        },
    }


# ─── Floor plan renderer ─────────────────────────────────────────

_PALETTE = [
    "#00ff88", "#00d4ff", "#ff9f0a", "#ff375f",
    "#bf5af2", "#ffd60a", "#32d74b", "#ff8c00",
]


def render_floorplan_png(mesh, walls: list[dict], cameras: list[dict], floor: dict) -> bytes:
    """
    Floor-plan PNG rendered from the actual mesh geometry.

    Uses a horizontal section cut at 1 m above the floor — exactly how
    architects produce floor plans.  Every wall face the cutting plane
    intersects becomes a crisp line segment, so the result looks like
    the original room diagram.  Camera FOV wedges are drawn on top.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    import trimesh.intersections as _ti

    fb   = floor["bounds"]
    fw   = fb["xmax"] - fb["xmin"]
    fh   = fb["ymax"] - fb["ymin"]
    if fw <= 0 or fh <= 0:
        fw = fh = 1.0

    aspect = fh / fw
    fig_w  = 11.0
    fig_h  = max(5.0, fig_w * aspect)
    fig, axes = plt.subplots(figsize=(fig_w, fig_h), facecolor="#080d11")
    axes.set_facecolor("#080d11")

    # ── Floor rectangle ───────────────────────────────────────────
    axes.add_patch(mpatches.Rectangle(
        (fb["xmin"], fb["ymin"]), fw, fh,
        fc="#0d1f18", ec="#1f4030", lw=2.5, zorder=0,
    ))

    # ── Section cut at 1 m above floor ───────────────────────────
    # mesh_plane returns (N, 2, 3): N line segments, each with 2 endpoints.
    # We draw the XY components — Z is constant at the cut height.
    cut_z = floor["z_elevation"] + 1.0
    section_drawn = False
    try:
        segs = _ti.mesh_plane(
            mesh,
            plane_normal  = np.array([0.0, 0.0, 1.0]),
            plane_origin  = np.array([0.0, 0.0, cut_z]),
        )
        # segs: (N, 2, 3) or None / empty
        if segs is not None and len(segs) > 0:
            xs: list = []
            ys: list = []
            for seg in segs:
                xs.extend([seg[0, 0], seg[1, 0], None])
                ys.extend([seg[0, 1], seg[1, 1], None])
            axes.plot(xs, ys, color="#4aaa6e", lw=2.2, alpha=0.9,
                      solid_capstyle="round", zorder=1)
            section_drawn = True
    except Exception:
        pass

    # ── Fallback: wall bounding-box rectangles ────────────────────
    if not section_drawn and walls:
        for w in walls:
            wb = w["bounds"]
            axes.add_patch(mpatches.Rectangle(
                (wb["xmin"], wb["ymin"]),
                wb["xmax"] - wb["xmin"], wb["ymax"] - wb["ymin"],
                fc="#1a3527", ec="#4aaa6e", lw=2.0, zorder=1,
            ))

    # ── Camera FOV wedges + icons ─────────────────────────────────
    fov_dist = min(7.0, max(fw, fh) * 0.38)

    for idx, cam in enumerate(cameras):
        color  = _PALETTE[idx % len(_PALETTE)]
        cx     = cam["position_xyz"][0]
        cy     = cam["position_xyz"][1]
        pan    = cam.get("pan_deg",   0)
        fov_h  = cam.get("fov_h_deg", 90)

        # matplotlib Wedge angles are CCW from the +X axis.
        # Backend pan=0 → north (+Y) → matplotlib angle = 90°.
        mpl_angle = 90.0 - pan

        axes.add_patch(mpatches.Wedge(
            (cx, cy), fov_dist,
            mpl_angle - fov_h / 2, mpl_angle + fov_h / 2,
            color=color, alpha=0.18, zorder=3,
        ))
        axes.add_patch(mpatches.Wedge(
            (cx, cy), fov_dist,
            mpl_angle - fov_h / 2, mpl_angle + fov_h / 2,
            fill=False, edgecolor=color, lw=1.8, alpha=0.9, zorder=3,
        ))

        # Camera dot (ring + inner hole)
        axes.plot(cx, cy, "o", ms=13, color=color, zorder=5,
                  markeredgecolor="#080d11", markeredgewidth=2)
        axes.plot(cx, cy, "o", ms=5, color="#080d11", zorder=6)

        # Label
        axes.annotate(
            cam.get("id", f"C{idx + 1}"), (cx, cy),
            xytext=(10, 10), textcoords="offset points",
            fontsize=9, color=color, fontfamily="monospace", fontweight="bold",
            bbox=dict(boxstyle="round,pad=0.3", fc="#080d11",
                      ec=color, alpha=0.92, lw=1.2),
            zorder=7,
        )

    # ── Axes styling ──────────────────────────────────────────────
    axes.set_xlim(fb["xmin"] - 0.8, fb["xmax"] + 0.8)
    axes.set_ylim(fb["ymin"] - 0.8, fb["ymax"] + 0.8)
    axes.set_aspect("equal")
    axes.tick_params(colors="#4b7a5e", labelsize=7)
    for spine in axes.spines.values():
        spine.set_edgecolor("#2d5e40")
    axes.set_xlabel("X (m)", color="#4b7a5e", fontsize=8)
    axes.set_ylabel("Y (m)", color="#4b7a5e", fontsize=8)

    axes.set_title(
        f"Camera Placement Plan  ·  {len(cameras)} cameras  ·  {fw:.1f} × {fh:.1f} m",
        color="#00ff88", fontsize=11, fontfamily="monospace", pad=12,
    )
    axes.legend(
        handles=[
            mpatches.Patch(color=_PALETTE[i % len(_PALETTE)], label=c.get("id", f"C{i+1}"))
            for i, c in enumerate(cameras)
        ],
        loc="lower right", facecolor="#0d1f18", edgecolor="#2d5e40",
        labelcolor="#ccc", fontsize=8,
    )

    plt.tight_layout(pad=1.5)
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor="#080d11")
    plt.close(fig)
    buf.seek(0)
    return buf.read()


# ─── Heatmap renderer ────────────────────────────────────────────

def render_heatmap_png(heatmap: dict, cameras: list[dict]) -> bytes:
    """
    Render a dark-theme top-down coverage heatmap.
    Returns raw PNG bytes (base64-encode for JSON transport).
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches

    pts     = np.array(heatmap["coverage_points"])
    covered = np.array(heatmap["covered_mask"])
    b       = heatmap["floor_bounds"]

    fig, ax = plt.subplots(figsize=(10, 8), facecolor="#0d1117")
    ax.set_facecolor("#0d1117")

    colors = np.where(covered, "#00ff88", "#ff3333")
    ax.scatter(pts[:, 0], pts[:, 1], c=colors, s=18, alpha=0.75, linewidths=0)

    for cam in cameras:
        cx, cy = cam["position_xyz"][0], cam["position_xyz"][1]
        pan    = cam.get("pan_deg",  0)
        fov    = cam.get("fov_h_deg", 90)
        dist   = 5.0

        left_r  = math.radians(pan - fov / 2)
        right_r = math.radians(pan + fov / 2)
        lx = cx + dist * math.sin(left_r);  ly = cy + dist * math.cos(left_r)
        rx = cx + dist * math.sin(right_r); ry = cy + dist * math.cos(right_r)

        ax.fill([cx, lx, rx], [cy, ly, ry], color="#00ff88", alpha=0.08)
        ax.plot([cx, lx], [cy, ly], color="#00ff88", lw=0.8, alpha=0.5)
        ax.plot([cx, rx], [cy, ry], color="#00ff88", lw=0.8, alpha=0.5)
        ax.plot(cx, cy, "w^", ms=9, zorder=6)
        ax.annotate(cam.get("id", "CAM"), (cx, cy),
                    xytext=(5, 5), textcoords="offset points",
                    fontsize=7, color="white", fontfamily="monospace")

    ax.set_xlim(b["xmin"] - 1, b["xmax"] + 1)
    ax.set_ylim(b["ymin"] - 1, b["ymax"] + 1)
    ax.set_aspect("equal")
    ax.tick_params(colors="#555")
    for spine in ax.spines.values():
        spine.set_edgecolor("#333")
    ax.set_xlabel("X (m)", color="#888", fontsize=9)
    ax.set_ylabel("Y (m)", color="#888", fontsize=9)

    pct = covered.mean() * 100
    ax.set_title(
        f"Coverage Heatmap — {pct:.1f}% covered  ({len(cameras)} cameras)",
        color="#00ff88", fontsize=11, fontfamily="monospace",
    )
    ax.legend(
        handles=[
            mpatches.Patch(color="#00ff88", label="Covered"),
            mpatches.Patch(color="#ff3333", label="Blind spot"),
        ],
        loc="upper right",
        facecolor="#111", edgecolor="#333", labelcolor="#ccc", fontsize=8,
    )

    plt.tight_layout(pad=1.0)
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=130, bbox_inches="tight", facecolor="#0d1117")
    plt.close(fig)
    buf.seek(0)
    return buf.read()


# ─── Full pipeline ───────────────────────────────────────────────

async def run_full_pipeline(
    mesh_path: str | Path,
    n_cameras: int        = 5,
    coverage_resolution:  float = 0.5,
    camera_height:        float = 2.5,
    n_candidates:         int   = 12,
) -> dict:
    """
    End-to-end: mesh file → optimal N camera placements + coverage metrics.

    Steps:
      1. Load mesh
      2. Detect floor + walls
      3. Sample coverage grid
      4. Build manifest → ask K2 for n_candidates positions
      5. Raycast each candidate
      6. Greedy selection of N best
      7. Return results + heatmap data
    """
    from app.services.k2_spatial import stream_k2_placement, parse_placements

    mesh  = load_mesh(mesh_path)
    floor = detect_floor(mesh)
    walls = detect_walls(mesh)

    coverage_pts = sample_coverage_grid(floor, coverage_resolution)
    manifest     = build_mesh_manifest(mesh, floor, walls)

    # ── K2 candidate pass ─────────────────────────────────────────
    full_text = ""
    async for _phase, chunk in stream_k2_placement(manifest, n_candidates):
        full_text += chunk

    try:
        k2_result  = parse_placements(full_text)
        candidates = k2_result.get("cameras", [])
    except ValueError:
        candidates = []

    # Fallback: if K2 fails or returns too few, pad with grid corners
    b = floor["bounds"]
    z = floor["z_elevation"] + camera_height
    cx, cy = (b["xmin"] + b["xmax"]) / 2, (b["ymin"] + b["ymax"]) / 2
    fallback = [
        {"id": "FB_NW", "position_xyz": [b["xmin"]+0.5, b["ymax"]-0.5, z], "pan_deg": 135, "tilt_deg": -30, "fov_h_deg": 90, "fov_v_deg": 60, "type": "Dome 4K"},
        {"id": "FB_NE", "position_xyz": [b["xmax"]-0.5, b["ymax"]-0.5, z], "pan_deg": 225, "tilt_deg": -30, "fov_h_deg": 90, "fov_v_deg": 60, "type": "Dome 4K"},
        {"id": "FB_SE", "position_xyz": [b["xmax"]-0.5, b["ymin"]+0.5, z], "pan_deg": 315, "tilt_deg": -30, "fov_h_deg": 90, "fov_v_deg": 60, "type": "Dome 4K"},
        {"id": "FB_SW", "position_xyz": [b["xmin"]+0.5, b["ymin"]+0.5, z], "pan_deg":  45, "tilt_deg": -30, "fov_h_deg": 90, "fov_v_deg": 60, "type": "Dome 4K"},
        {"id": "FB_C",  "position_xyz": [cx, cy, z],                        "pan_deg":   0, "tilt_deg": -30, "fov_h_deg":120, "fov_v_deg": 90, "type": "PTZ"},
        {"id": "FB_N",  "position_xyz": [cx, b["ymax"]-0.5, z],             "pan_deg": 180, "tilt_deg": -30, "fov_h_deg": 90, "fov_v_deg": 60, "type": "Dome 4K"},
        {"id": "FB_S",  "position_xyz": [cx, b["ymin"]+0.5, z],             "pan_deg":   0, "tilt_deg": -30, "fov_h_deg": 90, "fov_v_deg": 60, "type": "Dome 4K"},
    ]
    while len(candidates) < n_candidates and fallback:
        candidates.append(fallback.pop(0))

    # Clamp all candidates to proper mount height
    for c in candidates:
        if c["position_xyz"][2] < floor["z_elevation"] + 1.5:
            c["position_xyz"][2] = floor["z_elevation"] + camera_height

    # ── Compute visibility per candidate ─────────────────────────
    visibility_sets = [
        compute_visibility(
            mesh, np.array(c["position_xyz"]),
            coverage_pts,
            fov_h_deg = c.get("fov_h_deg", 90),
            fov_v_deg = c.get("fov_v_deg", 60),
            pan_deg   = c.get("pan_deg",   0),
            tilt_deg  = c.get("tilt_deg", -30),
        )
        for c in candidates
    ]

    # ── Greedy selection ─────────────────────────────────────────
    chosen_idx   = greedy_select(visibility_sets, n_cameras)
    chosen_cams  = [candidates[i] for i in chosen_idx]

    covered = np.zeros(len(coverage_pts), dtype=bool)
    for i in chosen_idx:
        covered |= visibility_sets[i]

    coverage_pct = round(float(covered.mean()) * 100, 1)

    return {
        "cameras":           chosen_cams,
        "coverage_pct":      coverage_pct,
        "n_coverage_points": int(len(coverage_pts)),
        "n_covered":         int(covered.sum()),
        "manifest":          manifest,
        "glb_bytes":         export_mesh_glb(mesh),
        "floorplan_bytes":   render_floorplan_png(mesh, walls, chosen_cams, floor),
        "heatmap": {
            "coverage_points": coverage_pts.tolist(),
            "covered_mask":    covered.tolist(),
            "floor_bounds":    floor["bounds"],
            "floor_z":         floor["z_elevation"],
        },
    }
