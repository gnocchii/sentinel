"""
view_refiner.py — converts a messy 3D mesh render into a photorealistic
security-camera still using Stable Diffusion depth-conditioned img2img.

Pipeline:
  1. Send the render to HF Inference API using sd-2-depth (depth-conditioned
     img2img) at high strength — the model extracts depth from the mesh render
     and regenerates the scene with realistic textures, lighting, and materials.
  2. Fallback chain: sd-1.5 img2img → local PIL enhancement if API unavailable.
  3. Apply CCTV overlay (timestamp, camera ID, vignette, scanlines) via Pillow.

Requires a free HF token: https://huggingface.co/settings/tokens → HF_TOKEN in .env
"""

import base64
import io
import os
import tempfile
import urllib.parse
from datetime import datetime
from pathlib import Path

import httpx
import numpy as np
from huggingface_hub import InferenceClient
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
from scipy.ndimage import binary_dilation, uniform_filter

from app.core.config import get_settings

# ── model roster ──────────────────────────────────────────────────────────────
# FLUX.1-dev: state-of-the-art, sharp, photorealistic, no waviness (HF free tier)
_MODEL_FLUX_DEV     = "black-forest-labs/FLUX.1-dev"
# FLUX.1-schnell: distilled 4-step variant — fast, still very sharp
_MODEL_FLUX_SCHNELL = "black-forest-labs/FLUX.1-schnell"
# SD-2-depth: depth-conditioned fallback — preserves spatial structure well
_MODEL_DEPTH        = "stabilityai/stable-diffusion-2-depth"
# SDXL: fallback if FLUX is unavailable on HF
_MODEL_SDXL         = "stabilityai/stable-diffusion-xl-base-1.0"
# Inpainting pass
_MODEL_INPAINT      = "stabilityai/stable-diffusion-2-inpainting"

# Pollinations.ai: completely free, no auth, backed by FLUX — used as a fallback
_POLLINATIONS_URL = "https://image.pollinations.ai/prompt/{prompt}"

_PROMPT = (
    "hyperrealistic interior room photograph, security camera mounted in upper corner, "
    "wide-angle downward view, professional real estate photography, "
    "physically based materials, sharp painted drywall with visible texture, "
    "hardwood floor with natural grain, recessed LED ceiling lights, "
    "realistic window sunlight, crisp shadow edges, "
    "shot on Canon EOS 5D Mark IV 24mm f/2.8 ISO 400, 8K resolution, "
    "ultra-sharp, photorealistic, no blur, no waviness, no distortion"
)
_NEGATIVE = (
    "3D render, CGI, mesh, wireframe, low-poly, flat shading, wavy, distorted, "
    "cartoon, sketch, painting, anime, illustration, digital art, "
    "blurry, soft, noisy, grainy, aliased, jpeg artifacts, "
    "overexposed, washed out, dull, watermark, text, logo, border"
)


def refine_camera_view_bytes(
    image_bytes: bytes,
    *,
    camera_id: str = "CAM-01",
    hour: float = 12.0,
    strength: float = 0.80,
) -> Path:
    """Accept raw image bytes (multipart upload from browser), return refined image path."""
    settings = get_settings()
    token = settings.hf_token
    if not token:
        raise RuntimeError(
            "HF_TOKEN is not set. Get a free token at "
            "https://huggingface.co/settings/tokens and add it to your .env file."
        )

    source_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    refined_img = _run_inference(source_img, token, strength)
    output_img = _apply_cctv_overlay(refined_img, camera_id=camera_id, hour=hour)

    out_fd, out_path = tempfile.mkstemp(prefix=f"sentinel_{camera_id}_", suffix=".png")
    os.close(out_fd)
    output_img.save(out_path, quality=92)
    return Path(out_path)


def refine_camera_view(
    input_image_path: str | Path,
    *,
    camera_id: str = "CAM-01",
    hour: float = 12.0,
    strength: float = 0.80,
) -> Path:
    """File-path variant (CLI / manual use)."""
    input_path = Path(input_image_path)
    if not input_path.exists():
        raise FileNotFoundError(f"Input image not found: {input_path}")
    return refine_camera_view_bytes(
        input_path.read_bytes(),
        camera_id=camera_id,
        hour=hour,
        strength=strength,
    )


# ── inference ─────────────────────────────────────────────────────────────────


def _run_inference(img: Image.Image, token: str, strength: float) -> Image.Image:
    """
    ControlNet-first pipeline:

    1. Extract Canny edges from the render — these are hard structural constraints
       (exact wall lines, floor boundary, object contours).
    2. Feed the edge map to ControlNet Canny: layout is pinned to the edges,
       but the model is completely free to hallucinate photorealistic textures,
       lighting, and materials. Maximum creative freedom within the structure.
    3. Fallback to FLUX/SD img2img at 0.80 if ControlNet is unavailable.

    strength=0.80 on the img2img fallbacks: 80% hallucination, 20% structure —
    more freedom than before (0.65) while still preserving the rough layout.
    """
    orig_size = img.size
    client = InferenceClient(token=token)

    # Extract Canny edge map — this is the structural skeleton passed to ControlNet
    canny = _extract_canny(img)
    canny_512 = canny.resize((512, 512), Image.LANCZOS)

    # Preprocessed render for img2img fallbacks
    img_768 = img.resize((768, 768), Image.LANCZOS).filter(ImageFilter.GaussianBlur(radius=1.5))
    img_512 = img.resize((512, 512), Image.LANCZOS).filter(ImageFilter.GaussianBlur(radius=1.0))

    result = (
        # ControlNet: exact layout, full texture hallucination
        _try_controlnet(token, canny_512, orig_size) or
        # FLUX img2img at caller-supplied strength (default 0.80)
        _try_hf_i2i(client, img_768, _MODEL_FLUX_DEV,    strength, guidance=3.5,  steps=28) or
        _try_hf_i2i(client, img_768, _MODEL_FLUX_SCHNELL, strength, guidance=0.0,  steps=4)  or
        _try_hf_i2i(client, img_512, _MODEL_DEPTH,        strength, guidance=12.0, steps=30) or
        _try_hf_i2i(client, img_512, _MODEL_SDXL,         strength, guidance=12.0, steps=30) or
        _enhance_locally(img)
    )

    result = result.resize(orig_size, Image.LANCZOS)

    # Inpainting pass: fix any remaining flat/blurry patches using context
    cleaned, coverage = _inpaint_blurry_patches(result, token)
    if coverage >= 0.02:
        result = cleaned

    return result


def _extract_canny(img: Image.Image) -> Image.Image:
    """
    Canny-style edge map from the render using Sobel + double-threshold.
    Captures exact wall lines, floor edges, object contours.
    Light Gaussian pre-smooth removes mesh aliasing before edge detection.
    """
    from scipy.ndimage import gaussian_filter, sobel as scipy_sobel
    arr = np.array(img.convert("L"), dtype=np.float32)
    smoothed = gaussian_filter(arr, sigma=1.2)
    sx = scipy_sobel(smoothed, axis=1)
    sy = scipy_sobel(smoothed, axis=0)
    mag = np.hypot(sx, sy)
    mag = mag / (mag.max() + 1e-6) * 255
    # Double threshold (weak + strong edges, like real Canny)
    out = np.zeros_like(mag, dtype=np.uint8)
    out[mag > 15]  = 128   # weak edges
    out[mag > 50]  = 255   # strong edges
    return Image.fromarray(out).convert("RGB")


def _try_controlnet(token: str, canny_img: Image.Image, orig_size: tuple) -> "Image.Image | None":
    """
    ControlNet Canny via HF Inference API.
    The edge map pins the layout; the model hallucinates everything else freely.
    Tries SDXL ControlNet first, then SD-1.5 ControlNet.
    """
    def _b64(pil_img: Image.Image) -> str:
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()

    for model in (
        "diffusers/controlnet-canny-sdxl-1.0",
        "lllyasviel/control_v11p_sd15_canny",
    ):
        try:
            resp = httpx.post(
                f"https://api-inference.huggingface.co/models/{model}",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "inputs": _b64(canny_img),
                    "parameters": {
                        "prompt":              _PROMPT,
                        "negative_prompt":     _NEGATIVE,
                        "num_inference_steps": 30,
                        "guidance_scale":      12.0,
                    },
                },
                timeout=90.0,
            )
            resp.raise_for_status()
            result = Image.open(io.BytesIO(resp.content)).convert("RGB")
            return result.resize(orig_size, Image.LANCZOS)
        except Exception:
            continue
    return None


def _try_hf_i2i(client: InferenceClient, img: Image.Image, model: str,
                strength: float, *, guidance: float, steps: int) -> "Image.Image | None":
    try:
        return client.image_to_image(
            img,
            prompt=_PROMPT,
            negative_prompt=_NEGATIVE,
            model=model,
            strength=strength,
            guidance_scale=guidance,
            num_inference_steps=steps,
        )
    except Exception:
        return None


def _build_blur_mask(img: Image.Image, patch: int = 20, threshold: float = 22.0) -> tuple[Image.Image, float]:
    """
    Returns (white_mask, coverage) where white = repaint this region.
    Flags patches whose local standard deviation is below `threshold` —
    real photographic surfaces have std > 20; flat/blurry areas are < 22.
    Threshold is intentionally aggressive: we'd rather repaint too much than too little.
    """
    arr = np.array(img.convert("L"), dtype=np.float32)
    mean    = uniform_filter(arr,      size=patch)
    sq_mean = uniform_filter(arr ** 2, size=patch)
    local_std = np.sqrt(np.clip(sq_mean - mean ** 2, 0.0, None))

    raw_mask = local_std < threshold
    dilated  = binary_dilation(raw_mask, iterations=patch // 2).astype(np.uint8) * 255

    coverage = float(dilated.sum()) / (255 * dilated.size)
    return Image.fromarray(dilated), coverage


def _inpaint_blurry_patches(img: Image.Image, token: str) -> tuple[Image.Image, float]:
    """
    One inpainting pass. Returns (result_image, mask_coverage).
    Coverage is returned so the caller can decide whether another pass is needed.
    Inpainting strength is 0.95 — near-maximum freedom to hallucinate
    realistic content while staying anchored to the surrounding context.
    """
    orig_size = img.size
    mask, coverage = _build_blur_mask(img)

    if coverage < 0.02 or coverage > 0.90:
        return img, coverage

    img_512  = img.resize((512, 512), Image.LANCZOS)
    mask_512 = mask.resize((512, 512), Image.NEAREST)

    def _b64(pil_img: Image.Image) -> str:
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()

    try:
        resp = httpx.post(
            f"https://api-inference.huggingface.co/models/{_MODEL_INPAINT}",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "inputs": _b64(img_512),
                "parameters": {
                    "mask_image":          _b64(mask_512),
                    "prompt":              _PROMPT,
                    "negative_prompt":     _NEGATIVE,
                    "strength":            0.95,
                    "num_inference_steps": 35,
                    "guidance_scale":      15.0,
                },
            },
            timeout=90.0,
        )
        resp.raise_for_status()
        result = Image.open(io.BytesIO(resp.content)).convert("RGB")
        return result.resize(orig_size, Image.LANCZOS), coverage
    except Exception:
        return img, 0.0  # graceful: return unchanged so loop exits


def _enhance_locally(img: Image.Image) -> Image.Image:
    """
    Local fallback when HF API is down/rate-limited.
    Sharpens, boosts contrast, and desaturates slightly for a CCTV look.
    This won't make squiggles photorealistic, but it's a graceful non-crash fallback.
    """
    img = ImageEnhance.Sharpness(img).enhance(2.5)
    img = ImageEnhance.Contrast(img).enhance(1.4)
    img = ImageEnhance.Brightness(img).enhance(0.95)
    img = ImageEnhance.Color(img).enhance(0.75)
    return img


# ── CCTV overlay ───────────────────────────────────────────────────────────────


def _apply_cctv_overlay(img: Image.Image, *, camera_id: str, hour: float) -> Image.Image:
    img = img.copy()
    w, h = img.size

    _draw_scanlines(img)
    _draw_vignette(img)

    draw = ImageDraw.Draw(img)
    font = _get_font(size=max(12, h // 40))
    small_font = _get_font(size=max(10, h // 50))

    # timestamp — top-left
    draw.text((10, 8), _format_timestamp(hour), fill=(200, 255, 200), font=font)

    # camera ID — top-right
    cam_bbox = draw.textbbox((0, 0), camera_id, font=font)
    draw.text((w - (cam_bbox[2] - cam_bbox[0]) - 10, 8), camera_id, fill=(200, 255, 200), font=font)

    # REC dot + label — bottom-left
    dot_x, dot_y = 10, h - 26
    draw.ellipse((dot_x, dot_y, dot_x + 8, dot_y + 8), fill=(220, 40, 40))
    draw.text((dot_x + 12, dot_y - 2), "REC", fill=(220, 220, 220), font=small_font)

    return img


def _draw_scanlines(img: Image.Image, opacity: int = 18) -> None:
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for y in range(0, img.size[1], 2):
        draw.line([(0, y), (img.size[0], y)], fill=(0, 0, 0, opacity))
    img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"))


def _draw_vignette(img: Image.Image, strength: float = 0.45) -> None:
    w, h = img.size
    try:
        import numpy as np
        xs = (np.arange(w) / w - 0.5) * 2
        ys = (np.arange(h) / h - 0.5) * 2
        xx, yy = np.meshgrid(xs, ys)
        mask_arr = np.clip(np.hypot(xx, yy) * strength * 255, 0, 255).astype(np.uint8)
        vignette = Image.fromarray(mask_arr, mode="L")
    except ImportError:
        vignette = Image.new("L", (w, h), 0)
        for y in range(h):
            for x in range(w):
                nx, ny = (x / w - 0.5) * 2, (y / h - 0.5) * 2
                vignette.putpixel((x, y), int(min(255, (nx**2 + ny**2) ** 0.5 * strength * 255)))

    vignette = vignette.filter(ImageFilter.GaussianBlur(radius=max(w, h) // 10))
    img.paste(Image.new("RGB", (w, h), (0, 0, 0)), mask=vignette)


def _format_timestamp(hour: float) -> str:
    now = datetime.now()
    h, m = int(hour), int((hour % 1) * 60)
    return now.strftime(f"%Y-%m-%d {h:02d}:{m:02d}:%S")


def _get_font(size: int = 14) -> ImageFont.ImageFont:
    for path in ("arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()
