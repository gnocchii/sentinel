"""Put `backend/` on sys.path so `app.*` imports work when running pytest from repo root."""
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
