"""
End-to-end test for the importance-map fix:

The 4_25_2026.usdz scan has a known-bad failure mode in the old pipeline:
  - The wide empty 7.89 x 3.53 m "Room A" (no furniture detected) was labeled
    "hallway 0.88" by K2 because the prompt didn't surface aspect ratio.
  - The actual narrow corridor (1.46 x 10.39 m) was scored only 0.72.
  - The 1.99 m main entrance got no special tag.

After the fix (geometry prior + enriched prompt), the deterministic prior alone
should already produce sensible labels. K2 layered on top can only improve them.
"""
from pathlib import Path

from app.services.usda_parser import parse_usdz
from app.services.importance import (
    build_scene_summary,
    geometry_prior,
    _likely_main_entrance,
)

FIXTURE = Path(__file__).parent / "fixtures" / "4_25_2026.usdz"


def _scene():
    return parse_usdz(FIXTURE)


def _room_by_size(scene, want_long, want_short, tol=0.5):
    """Find the parsed room whose bbox matches the expected (long, short) dims within tol."""
    for r in scene["rooms"]:
        b = r["bounds"]
        sx = b["max"][0] - b["min"][0]
        sy = b["max"][1] - b["min"][1]
        long_side, short_side = max(sx, sy), min(sx, sy)
        if abs(long_side - want_long) < tol and abs(short_side - want_short) < tol:
            return r
    raise AssertionError(f"no room ~{want_long}x{want_short}m in {[(r['id'], r['bounds']) for r in scene['rooms']]}")


def test_parser_door_count_matches_ground_truth():
    """USDZ has 16 door meshes that pair into 8 unique entrances; parser must keep all 8."""
    scene = _scene()
    assert len(scene["entry_points"]) == 8, f"expected 8 unique doors, got {len(scene['entry_points'])}"
    assert len(scene["rooms"]) == 4


def test_widest_door_flagged_as_main_entrance():
    scene = _scene()
    main_id = _likely_main_entrance(scene["entry_points"])
    main_door = next(d for d in scene["entry_points"] if d["id"] == main_id)
    assert main_door["width"] >= 1.5, f"main entrance should be the wide one, got width={main_door['width']}"
    # Sanity: this scene's main door is ~1.99m wide
    assert main_door["width"] > 1.9


def test_prior_labels_narrow_corridor_as_hallway():
    """Room C (1.46 x 10.39 m) is the actual hallway. Old K2 scored it 0.72; prior should hit ≥ 0.85."""
    scene = _scene()
    prior = geometry_prior(scene)
    corridor = _room_by_size(scene, want_long=10.4, want_short=1.46)
    info = prior["rooms"][corridor["id"]]
    assert info["inferred_type"] == "hallway", f"narrow corridor should be hallway, got {info}"
    assert info["score"] >= 0.85


def test_prior_does_not_call_wide_empty_room_a_hallway():
    """Room A (7.89 x 3.53 m, aspect 2.2:1, no furniture) was wrongly labeled hallway by K2.

    With the prior, an aspect-2.2 room cannot be a hallway. It should land as either
    lobby/entry (if many doors touch it) or lounge/open."""
    scene = _scene()
    prior = geometry_prior(scene)
    wide_room = _room_by_size(scene, want_long=7.89, want_short=3.53)
    info = prior["rooms"][wide_room["id"]]
    assert info["inferred_type"] != "hallway", f"wide room must not be hallway, got {info}"
    assert info["inferred_type"] in {"lobby/entry", "lounge/open", "unknown"}


def test_prior_labels_table_room_as_breakroom():
    """Room B (2.22 x 11.5 m, 3 tables) is the dining/breakroom."""
    scene = _scene()
    prior = geometry_prior(scene)
    table_room = _room_by_size(scene, want_long=11.5, want_short=2.22)
    info = prior["rooms"][table_room["id"]]
    # NOTE: aspect 5.2:1 also matches the hallway rule, so the table-aware branch must win.
    # That ordering is intentional in geometry_prior — furniture overrides shape.
    # If this test fails, check that the bathroom/bed/aspect/table priority order in
    # geometry_prior puts furniture-based labels before the aspect rule.
    assert info["inferred_type"] in {"breakroom/dining", "hallway"}, info
    # If aspect won, that's a *known* limitation worth surfacing — assert table-aware branch:
    assert info["inferred_type"] == "breakroom/dining", (
        f"table room misclassified — geometry_prior priority needs furniture > aspect. got {info}"
    )


def test_prior_main_entrance_door_score_ge_095():
    scene = _scene()
    prior = geometry_prior(scene)
    main_id = _likely_main_entrance(scene["entry_points"])
    assert prior["doors"][main_id]["score"] >= 0.95


def test_summary_emits_aspect_and_main_entrance_tag():
    """The K2 prompt must now contain aspect ratios and the main-entrance tag."""
    scene = _scene()
    summary = build_scene_summary(scene)
    assert "aspect" in summary
    assert "long narrow" in summary, "aspect-≥4 corridor missing shape hint"
    assert "[likely main entrance]" in summary
    assert "door(s)" in summary, "per-room door count missing from summary"


if __name__ == "__main__":
    # Run as a script for quick local feedback (no pytest needed).
    import traceback
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS  {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL  {t.__name__}: {e}")
        except Exception:
            failed += 1
            print(f"ERROR {t.__name__}:")
            traceback.print_exc()
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
