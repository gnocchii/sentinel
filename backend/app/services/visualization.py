"""
Task 3 — Visualization Loop

Functions:
  colorize_pointcloud()   — color by semantic label (floor/wall/obstacle)
  build_frustum()         — Open3D LineSet representing a camera's FOV cone
  build_scene_vis()       — combine cloud + all frustums for o3d.visualization.draw_geometries()
  render_camera_view()    — BONUS: project point cloud from a camera's POV → PIL Image
  save_render()           — save render to PNG

All camera placements use the same dict schema K2 outputs:
  { position_xyz, pan_deg, tilt_deg, fov_h_deg, fov_v_deg, id, type }
"""

import math
import numpy as np
import open3d as o3d
from pathlib import Path


# ─── Semantic colours (RGB 0–1) ──────────────────────────────────

COLOURS = {
    "floor":        [0.55, 0.57, 0.60],   # neutral grey
    "wall":         [0.40, 0.55, 0.75],   # steel blue
    "obstacle":     [0.90, 0.55, 0.15],   # amber
    "unclassified": [0.85, 0.87, 0.89],   # near-white
    "entry":        [0.95, 0.30, 0.25],   # red marker
}

# Frustum line colours per camera status
FRUSTUM_COLOUR_ACTIVE  = [0.00, 1.00, 0.53]   # cyan-green
FRUSTUM_COLOUR_WARNING = [1.00, 0.67, 0.00]   # amber
FRUSTUM_COLOUR_OFFLINE = [1.00, 0.27, 0.27]   # red


# ─── Point cloud colourisation ───────────────────────────────────

def colorize_pointcloud(
    pcd: o3d.geometry.PointCloud,
    manifest: dict,
) -> o3d.geometry.PointCloud:
    """
    Returns a new point cloud with per-point colours assigned by semantic label.
    """
    pts      = np.asarray(pcd.points)
    colours  = np.tile(COLOURS["unclassified"], (len(pts), 1))
    floor_z  = manifest.get("structural_planes", {}).get("floor", {}).get("z_elevation_m", None)

    # Floor: points near the floor elevation
    if floor_z is not None:
        floor_mask = np.abs(pts[:, 2] - floor_z) < 0.05
        colours[floor_mask] = COLOURS["floor"]

    # Walls: points inside each wall's bounding box (rough)
    for wall in manifest.get("structural_planes", {}).get("walls", []):
        ext = wall.get("extent", {})
        mask = (
            (pts[:, 0] >= ext.get("xmin", -1e9) - 0.05) & (pts[:, 0] <= ext.get("xmax", 1e9) + 0.05) &
            (pts[:, 1] >= ext.get("ymin", -1e9) - 0.05) & (pts[:, 1] <= ext.get("ymax", 1e9) + 0.05) &
            (pts[:, 2] >= ext.get("zmin", -1e9) - 0.05) & (pts[:, 2] <= ext.get("zmax", 1e9) + 0.05)
        )
        colours[mask] = COLOURS["wall"]

    # Obstacles: points inside each obstacle's bounding box
    for obs in manifest.get("obstacles", []):
        bb = obs.get("bounding_box", {})
        mask = (
            (pts[:, 0] >= bb.get("xmin", 0) - 0.03) & (pts[:, 0] <= bb.get("xmax", 0) + 0.03) &
            (pts[:, 1] >= bb.get("ymin", 0) - 0.03) & (pts[:, 1] <= bb.get("ymax", 0) + 0.03) &
            (pts[:, 2] >= bb.get("zmin", 0) - 0.03) & (pts[:, 2] <= bb.get("zmax", 0) + 0.03)
        )
        colours[mask] = COLOURS["obstacle"]

    coloured = o3d.geometry.PointCloud()
    coloured.points = pcd.points
    coloured.colors = o3d.utility.Vector3dVector(colours)
    return coloured


# ─── Camera frustum geometry ─────────────────────────────────────

def build_frustum(
    position_xyz: list[float],
    pan_deg: float,
    tilt_deg: float,
    fov_h_deg: float,
    fov_v_deg: float,
    near: float = 0.3,
    far: float  = 6.0,
    colour: list[float] = None,
) -> o3d.geometry.LineSet:
    """
    Build a wireframe camera frustum as an Open3D LineSet.

    pan_deg:  0 = north (+Y), 90 = east (+X), clockwise
    tilt_deg: negative = camera tilted downward (typical mounting)
    """
    if colour is None:
        colour = FRUSTUM_COLOUR_ACTIVE

    pos = np.array(position_xyz, dtype=float)

    # ── Direction vector from pan/tilt ─────────────────────────
    pan_r  = math.radians(pan_deg)
    tilt_r = math.radians(tilt_deg)

    # Forward direction (camera look-at) in world space
    # pan around Z, then tilt around the right axis
    forward = np.array([
        math.sin(pan_r) * math.cos(tilt_r),
        math.cos(pan_r) * math.cos(tilt_r),
        math.sin(tilt_r),
    ])
    forward /= np.linalg.norm(forward) + 1e-9

    # Up and right vectors
    world_up = np.array([0.0, 0.0, 1.0])
    right    = np.cross(forward, world_up)
    if np.linalg.norm(right) < 1e-6:
        right = np.array([1.0, 0.0, 0.0])
    right /= np.linalg.norm(right)
    up = np.cross(right, forward)
    up /= np.linalg.norm(up)

    # ── Frustum corners at near and far planes ──────────────────
    hw_near = near * math.tan(math.radians(fov_h_deg / 2))
    hh_near = near * math.tan(math.radians(fov_v_deg / 2))
    hw_far  = far  * math.tan(math.radians(fov_h_deg / 2))
    hh_far  = far  * math.tan(math.radians(fov_v_deg / 2))

    def corner(dist, h, v):
        return pos + dist * forward + h * right + v * up

    near_tl = corner(near, -hw_near,  hh_near)
    near_tr = corner(near,  hw_near,  hh_near)
    near_br = corner(near,  hw_near, -hh_near)
    near_bl = corner(near, -hw_near, -hh_near)
    far_tl  = corner(far,  -hw_far,   hh_far)
    far_tr  = corner(far,   hw_far,   hh_far)
    far_br  = corner(far,   hw_far,  -hh_far)
    far_bl  = corner(far,  -hw_far,  -hh_far)

    vertices = np.array([
        pos,                                  # 0 — apex
        near_tl, near_tr, near_br, near_bl,  # 1–4
        far_tl,  far_tr,  far_br,  far_bl,   # 5–8
    ])

    lines = [
        # Apex → near corners
        [0,1],[0,2],[0,3],[0,4],
        # Near rectangle
        [1,2],[2,3],[3,4],[4,1],
        # Near → far
        [1,5],[2,6],[3,7],[4,8],
        # Far rectangle
        [5,6],[6,7],[7,8],[8,5],
    ]

    lineset = o3d.geometry.LineSet()
    lineset.points = o3d.utility.Vector3dVector(vertices)
    lineset.lines  = o3d.utility.Vector2iVector(lines)
    lineset.paint_uniform_color(colour)
    return lineset


def build_camera_sphere(position_xyz: list[float], colour: list[float] = None) -> o3d.geometry.TriangleMesh:
    """Small sphere to mark the camera mount position."""
    sphere = o3d.geometry.TriangleMesh.create_sphere(radius=0.08)
    sphere.translate(position_xyz)
    sphere.paint_uniform_color(colour or FRUSTUM_COLOUR_ACTIVE)
    sphere.compute_vertex_normals()
    return sphere


# ─── Entry point markers ─────────────────────────────────────────

def build_entry_markers(manifest: dict) -> list[o3d.geometry.TriangleMesh]:
    markers = []
    for entry in manifest.get("entry_candidates", []):
        pos = entry.get("position_xyz", [0, 0, 0])
        cone = o3d.geometry.TriangleMesh.create_cone(radius=0.15, height=0.4)
        cone.translate([pos[0], pos[1], pos[2] + 0.2])
        cone.paint_uniform_color(COLOURS["entry"])
        cone.compute_vertex_normals()
        markers.append(cone)
    return markers


# ─── Full scene assembly ─────────────────────────────────────────

def build_scene_vis(
    pcd: o3d.geometry.PointCloud,
    manifest: dict,
    camera_placements: list[dict],
) -> list:
    """
    Returns a list of Open3D geometries ready for draw_geometries().

    camera_placements: list of dicts with keys:
      position_xyz, pan_deg, tilt_deg, fov_h_deg, fov_v_deg, id
    """
    geometries = []

    # Colourised point cloud
    coloured = colorize_pointcloud(pcd, manifest)
    geometries.append(coloured)

    # Entry point markers
    geometries.extend(build_entry_markers(manifest))

    # Camera frustums + spheres
    for cam in camera_placements:
        status = cam.get("status", "active")
        colour = (FRUSTUM_COLOUR_WARNING if status == "warning"
                  else FRUSTUM_COLOUR_OFFLINE if status == "offline"
                  else FRUSTUM_COLOUR_ACTIVE)

        frustum = build_frustum(
            position_xyz = cam["position_xyz"],
            pan_deg      = cam.get("pan_deg",   0),
            tilt_deg     = cam.get("tilt_deg", -30),
            fov_h_deg    = cam.get("fov_h_deg", 90),
            fov_v_deg    = cam.get("fov_v_deg", 60),
            colour       = colour,
        )
        sphere = build_camera_sphere(cam["position_xyz"], colour)
        geometries.extend([frustum, sphere])

    return geometries


def show_scene(
    pcd: o3d.geometry.PointCloud,
    manifest: dict,
    camera_placements: list[dict],
    window_title: str = "Sentinel — Spatial Analysis",
) -> None:
    """Open an interactive Open3D window."""
    geometries = build_scene_vis(pcd, manifest, camera_placements)
    o3d.visualization.draw_geometries(
        geometries,
        window_name=window_title,
        width=1280,
        height=800,
        point_show_normal=False,
    )


# ─── BONUS: Camera POV render ────────────────────────────────────

def render_camera_view(
    pcd: o3d.geometry.PointCloud,
    manifest: dict,
    camera: dict,
    width: int  = 960,
    height: int = 540,
) -> "np.ndarray":
    """
    Project the point cloud from the camera's POV and return an RGBA image
    as a numpy array (H, W, 4) uint8.

    Uses Open3D offscreen rendering via a headless visualizer.
    """
    geometries = [colorize_pointcloud(pcd, manifest)]

    # Also show entry markers so the operator can see what the camera covers
    geometries.extend(build_entry_markers(manifest))

    vis = o3d.visualization.Visualizer()
    vis.create_window(visible=False, width=width, height=height)
    for geo in geometries:
        vis.add_geometry(geo)

    # Set camera intrinsics from FOV
    fov_h = camera.get("fov_h_deg", 90)
    fx = (width / 2) / math.tan(math.radians(fov_h / 2))
    fy = fx
    intrinsic = o3d.camera.PinholeCameraIntrinsic(width, height, fx, fy, width / 2, height / 2)

    # Build extrinsic (world → camera) from pan/tilt
    pan_r  = math.radians(camera.get("pan_deg",  0))
    tilt_r = math.radians(camera.get("tilt_deg", -30))
    pos    = np.array(camera["position_xyz"], dtype=float)

    forward = np.array([math.sin(pan_r) * math.cos(tilt_r),
                        math.cos(pan_r) * math.cos(tilt_r),
                        math.sin(tilt_r)])
    forward /= np.linalg.norm(forward) + 1e-9

    world_up = np.array([0.0, 0.0, 1.0])
    right    = np.cross(forward, world_up)
    if np.linalg.norm(right) < 1e-6:
        right = np.array([1.0, 0.0, 0.0])
    right /= np.linalg.norm(right)
    up_cam = np.cross(right, forward)
    up_cam /= np.linalg.norm(up_cam)

    # Rotation matrix (rows = camera axes in world space)
    R = np.stack([right, -up_cam, forward], axis=0)
    t = -R @ pos

    extrinsic = np.eye(4)
    extrinsic[:3, :3] = R
    extrinsic[:3,  3] = t

    params = o3d.camera.PinholeCameraParameters()
    params.intrinsic = intrinsic
    params.extrinsic = extrinsic

    ctr = vis.get_view_control()
    ctr.convert_from_pinhole_camera_parameters(params, allow_arbitrary=True)

    vis.poll_events()
    vis.update_renderer()

    img = vis.capture_screen_float_buffer(do_render=True)
    vis.destroy_window()

    rgb = (np.asarray(img) * 255).astype(np.uint8)
    rgba = np.concatenate([rgb, np.full((*rgb.shape[:2], 1), 255, dtype=np.uint8)], axis=2)
    return rgba


def save_render(rgba: "np.ndarray", out_path: str | Path) -> None:
    from PIL import Image
    Image.fromarray(rgba).save(str(out_path))
