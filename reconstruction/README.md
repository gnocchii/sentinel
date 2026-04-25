# Video → 3D Point Cloud (StreamVGGT)

**Owner: [Suhaan's domain]**

This module takes a phone walkthrough video and produces a streaming 3D point cloud that feeds into the Sentinel backend scene pipeline.

## Target pipeline

```
phone video (.mp4)
  → frame extraction (ffmpeg, 2fps)
  → depth estimation per frame (StreamVGGT / MiDaS / DepthAnything)
  → structure-from-motion pose estimation
  → point cloud fusion → .ply / JSON output
  → POST /scene/upload (backend ingests, replaces avery_house.json)
```

## StreamVGGT

- Paper: https://arxiv.org/abs/2503.01199
- Authors include Yinghao Xu
- Single-camera streaming 3D reconstruction
- Key property: real-time, no LiDAR, phone camera sufficient

## Stub inputs for demo

While reconstruction is in progress, use the hardcoded scene:
`backend/app/data/scenes/avery_house.json`

The backend `/scene/avery_house/pointcloud` endpoint generates a synthetic
point cloud from room geometry — enough to run the full demo without video.

## Integration point

When reconstruction is ready, POST the scene JSON to:
```
POST /scans/upload
Content-Type: multipart/form-data
file=<pointcloud.ply>
```
Then fetch processed point cloud via:
```
GET /scans/{scan_id}/pointcloud
GET /scans/latest/pointcloud
```
