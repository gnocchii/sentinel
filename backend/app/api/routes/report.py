"""
PDF report generation for Sentinel camera placement analysis.
"""

from datetime import datetime
from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel

from app.api.routes.scene import load_scene

router = APIRouter(prefix="/report", tags=["report"])


class ReportRequest(BaseModel):
    cameras: list[dict] = []
    analysis: dict = {}


@router.post("/{scene_id}")
def generate_report(scene_id: str, req: ReportRequest) -> Response:
    """Generate and download a PDF security camera placement report.
    Accepts the current camera list and analysis from the frontend so the PDF
    reflects live optimizer results rather than the stale on-disk scene."""
    scene = load_scene(scene_id)

    # Use frontend-supplied cameras/analysis; fall back to scene file if empty
    cameras = req.cameras if req.cameras else scene.get("cameras", [])
    analysis = req.analysis if req.analysis else scene.get("analysis", {})

    pdf_bytes = _build_pdf(scene_id, scene, cameras, analysis)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="sentinel_report_{scene_id}.pdf"'},
    )


def _safe(text: str) -> str:
    """Strip characters outside Latin-1 so Helvetica doesn't raise."""
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _build_pdf(scene_id: str, scene: dict, cameras: list, analysis: dict) -> bytes:
    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)

    coverage_pct  = float(analysis.get("coverage_pct", 0))
    total_cost    = sum(c.get("cost_usd", 0) for c in cameras)  # always computed from live list

    # ─── Page 1: Overview + cameras ──────────────────────────────────
    pdf.add_page()
    _page_header(pdf, "SENTINEL Security Report")

    # Scene info
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(55, 175, 210)
    pdf.cell(0, 8, _safe(f"Scene: {scene.get('name', scene_id)}"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(60, 60, 60)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 5, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 5,
             f"Floor area: {scene.get('floor_area_m2', 0):.1f} m2  |  "
             f"Rooms: {len(scene.get('rooms', []))}  |  "
             f"Walls: {len(scene.get('walls', []))}  |  "
             f"Entry points: {len(scene.get('entry_points', []))}",
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # Summary stats
    _section_heading(pdf, "Summary")
    _two_col_table(pdf, [
        ("Floor coverage", f"{coverage_pct:.1f}%"),
        ("Cameras placed", str(len(cameras))),
        ("Total cost",     f"${total_cost:,.0f}"),
    ])
    pdf.ln(4)

    # Camera placement table
    if cameras:
        _section_heading(pdf, "Camera Placement")
        headers = ["ID", "Type", "Position (x,y,z)", "FOV H x V", "Cost ($)", "IR", "HDR", "Status"]
        col_w   = [20,   26,     40,                 20,           18,         10,    10,    18]
        rows = []
        for cam in cameras:
            pos = cam.get("position", [0, 0, 0])
            rows.append([
                cam.get("id", ""),
                _safe(cam.get("type", "")),
                f"({pos[0]:.1f}, {pos[1]:.1f}, {pos[2]:.1f})",
                f"{cam.get('fov_h', 0)} x {cam.get('fov_v', 0)} deg",
                str(cam.get("cost_usd", 0)),
                "Y" if cam.get("ir_capable") else "N",
                "Y" if cam.get("hdr_capable") else "N",
                cam.get("status", "active"),
            ])
        _data_table(pdf, headers, col_w, rows)
        pdf.ln(4)

    # Footer
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(140, 140, 140)
    pdf.multi_cell(0, 5,
        f"Sentinel AI automated placement analysis. "
        f"Current configuration achieves {coverage_pct:.1f}% floor coverage with {len(cameras)} cameras "
        f"at a total cost of ${total_cost:,.0f}. "
        f"All recommendations are advisory - consult a certified security integrator before deployment.")

    return bytes(pdf.output())


# ─── PDF helpers ─────────────────────────────────────────────────

def _page_header(pdf, title: str):
    pdf.set_fill_color(10, 20, 35)
    pdf.rect(0, 0, 210, 22, "F")
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(55, 175, 210)
    pdf.set_xy(10, 5)
    pdf.cell(100, 10, "SENTINEL")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(160, 175, 190)
    pdf.set_xy(10, 14)
    pdf.cell(190, 6, title, align="R")
    pdf.set_text_color(0)
    pdf.set_xy(10, 26)


def _section_heading(pdf, label: str):
    pdf.set_fill_color(20, 35, 50)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(0, 7, f"  {label}", fill=True, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0)
    pdf.ln(1)


def _two_col_table(pdf, rows: list[tuple[str, str]]):
    pdf.set_font("Helvetica", "", 9)
    for i, (label, value) in enumerate(rows):
        fill = i % 2 == 0
        pdf.set_fill_color(244, 247, 250) if fill else pdf.set_fill_color(255, 255, 255)
        pdf.cell(75, 6, f"  {label}", border="B", fill=fill)
        pdf.cell(0,  6, f"  {value}", border="B", fill=False, new_x="LMARGIN", new_y="NEXT")


def _data_table(pdf, headers: list[str], col_widths: list[int], rows: list[list[str]]):
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(210, 220, 230)
    pdf.set_text_color(20, 30, 50)
    for h, w in zip(headers, col_widths):
        pdf.cell(w, 7, f" {h}", border=1, fill=True, align="C")
    pdf.ln()

    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(50, 50, 50)
    for i, row in enumerate(rows):
        fill = i % 2 == 0
        pdf.set_fill_color(248, 251, 254) if fill else pdf.set_fill_color(255, 255, 255)
        for val, w in zip(row, col_widths):
            pdf.cell(w, 6, f" {str(val)[:w//2+2]}", border=1, fill=fill)
        pdf.ln()
