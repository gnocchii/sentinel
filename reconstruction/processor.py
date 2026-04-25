from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
from plyfile import PlyData


def process_ply_to_pointcloud(
    input_ply: str | Path,
    output_json: str | Path,
    *,
    max_points: int = 120_000,
) -> dict[str, Any]:
    """Convert a .ply point cloud into Sentinel frontend point format.

    Output shape:
    {
      "scene_id": "scan_<id>",
      "count": N,
      "points": [[x, y, z, r, g, b], ...],
      "meta": {...}
    }
    """
    in_path = Path(input_ply)
    out_path = Path(output_json)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    ply = PlyData.read(str(in_path))
    if "vertex" not in ply:
        raise ValueError("PLY file has no 'vertex' element")

    vertex = ply["vertex"].data
    names = set(vertex.dtype.names or [])

    required = {"x", "y", "z"}
    if not required.issubset(names):
        raise ValueError("PLY vertex data must include x, y, z")

    xyz = np.column_stack(
        [
            vertex["x"].astype(np.float32),
            vertex["y"].astype(np.float32),
            vertex["z"].astype(np.float32),
        ]
    )

    if {"red", "green", "blue"}.issubset(names):
        rgb = np.column_stack(
            [
                vertex["red"].astype(np.float32),
                vertex["green"].astype(np.float32),
                vertex["blue"].astype(np.float32),
            ]
        )
        if rgb.max(initial=0.0) > 1.0:
            rgb = rgb / 255.0
        rgb = np.clip(rgb, 0.0, 1.0)
    else:
        rgb = np.full((xyz.shape[0], 3), 0.65, dtype=np.float32)

    count_before = xyz.shape[0]
    if count_before == 0:
        payload = {
            "scene_id": f"scan_{in_path.stem}",
            "count": 0,
            "points": [],
            "meta": {
                "source": str(in_path),
                "warning": "No points found in input PLY",
            },
        }
        out_path.write_text(json.dumps(payload))
        return payload

    if count_before > max_points:
        idx = np.linspace(0, count_before - 1, num=max_points, dtype=np.int64)
        xyz = xyz[idx]
        rgb = rgb[idx]

    points = np.concatenate([xyz, rgb], axis=1)
    mins = xyz.min(axis=0)
    maxs = xyz.max(axis=0)

    payload = {
        "scene_id": f"scan_{in_path.stem}",
        "count": int(points.shape[0]),
        "points": points.round(4).tolist(),
        "meta": {
            "source": str(in_path),
            "original_count": int(count_before),
            "downsampled": bool(count_before > max_points),
            "max_points": int(max_points),
            "bounds": {
                "min": mins.round(4).tolist(),
                "max": maxs.round(4).tolist(),
            },
        },
    }

    out_path.write_text(json.dumps(payload))
    return payload
