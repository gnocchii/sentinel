"""
Solar / lighting simulation.

Given window positions + orientations and scene lat/lon,
compute sun azimuth/altitude for each hour 0–23 and determine
which cameras are glare-affected.
"""

import math
from datetime import date


def sun_position(hour: float, lat_deg: float, lon_deg: float, day_of_year: int = None) -> tuple[float, float]:
    """
    Simplified solar position. Returns (azimuth_deg, altitude_deg).
    Uses NOAA simplified equations — good enough for demo-level accuracy.
    """
    if day_of_year is None:
        day_of_year = date.today().timetuple().tm_yday

    # Solar declination
    declination = 23.45 * math.sin(math.radians(360 / 365 * (day_of_year - 81)))
    lat = math.radians(lat_deg)
    decl = math.radians(declination)

    # Hour angle (15° per hour, solar noon = 12:00)
    hour_angle = math.radians((hour - 12) * 15)

    sin_alt = (math.sin(lat) * math.sin(decl) +
               math.cos(lat) * math.cos(decl) * math.cos(hour_angle))
    altitude = math.degrees(math.asin(max(-1, min(1, sin_alt))))

    cos_az = (math.sin(decl) - math.sin(lat) * sin_alt) / (math.cos(lat) * math.cos(math.radians(altitude)) + 1e-9)
    azimuth = math.degrees(math.acos(max(-1, min(1, cos_az))))
    if hour_angle > 0:
        azimuth = 360 - azimuth

    return azimuth, altitude


def check_glare(sun_azimuth: float, sun_altitude: float, window_azimuth: float, threshold_deg: float = 30) -> bool:
    """Window faces sun if sun azimuth ≈ window facing direction and sun is above horizon."""
    if sun_altitude <= 0:
        return False
    az_diff = abs((sun_azimuth - window_azimuth + 180) % 360 - 180)
    return az_diff <= threshold_deg


def simulate_lighting(scene: dict, lat: float, lon: float) -> list[dict]:
    """
    For each camera, return hourly lighting quality and risk windows.

    Returns list of:
    {
      "camera_id": str,
      "hourly": [{"hour": 0..23, "sun_azimuth": float, "sun_altitude": float, "quality": "good"|"warning"|"critical"}],
      "risk_windows": [{"start_hour": float, "end_hour": float, "type": "glare"|"dark"}]
    }
    """
    results = []
    solar_windows = {w["entry_point_id"]: w for w in scene.get("windows_solar", [])}
    cameras = scene.get("cameras", [])

    for cam in cameras:
        hourly = []
        for hour in range(24):
            az, alt = sun_position(hour, lat, lon)
            quality = "good"

            # Check if any window hits this camera's facing direction
            if alt > 0:
                cam_forward = [cam["target"][i] - cam["position"][i] for i in range(3)]
                cam_az = math.degrees(math.atan2(cam_forward[0], cam_forward[1])) % 360
                for w in solar_windows.values():
                    if check_glare(az, alt, w.get("azimuth_deg", 270)):
                        win_az = w.get("azimuth_deg", 270)
                        az_to_cam = abs((win_az - cam_az + 180) % 360 - 180)
                        if az_to_cam < 60:
                            quality = "warning" if az_to_cam > 30 else "critical"
                            break
            elif alt < -6:
                quality = "dark"

            hourly.append({"hour": hour, "sun_azimuth": round(az, 1), "sun_altitude": round(alt, 1), "quality": quality})

        # Collapse into risk windows
        risk_windows = []
        in_risk = False
        start = 0
        for h in hourly:
            if h["quality"] in ("warning", "critical", "dark") and not in_risk:
                in_risk = True
                start = h["hour"]
                risk_type = "glare" if h["quality"] != "dark" else "dark"
            elif h["quality"] == "good" and in_risk:
                in_risk = False
                risk_windows.append({"start_hour": start, "end_hour": h["hour"], "type": risk_type})
        if in_risk:
            risk_windows.append({"start_hour": start, "end_hour": 24, "type": risk_type})

        results.append({"camera_id": cam["id"], "hourly": hourly, "risk_windows": risk_windows})

    return results
