"""Render the app's outline icons to tintable PNGs with FFmpeg and librsvg."""
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

paths = {
    "calendar": "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M7 3v4 M17 3v4 M3 10h18 M8 15h2 M14 15h2",
    "chart": "M4 19h16 M7 15v-4 M12 15V6 M17 15V9",
    "chevron-left": "M15 5l-7 7 7 7",
    "chevron-right": "M9 5l7 7-7 7",
    "close": "M6 6l12 12 M18 6L6 18",
    "court": "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M3 8h18 M3 16h18 M8 8v8 M16 8v8 M8 12h8 M12 5v14",
    "download": "M12 3v12m-4-4 4 4 4-4 M4 16v4h16v-4",
    "edit": "M3 21l1-5L16 4l4 4L8 20z M13.5 6.5l4 4",
    "history": "M4 9a8 8 0 1 1 .4 7 M4 4v5h5 M12 8v4l3 2",
    "note": "M14 3H5v18h14V8z M14 3v5h5 M8 12h8 M8 16h5",
    "players": "M15 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M17 4.5a3.4 3.4 0 0 1 0 6.5 M21 20v-2a4 4 0 0 0-3-3.8",
    "plus": "M12 5v14 M5 12h14",
    "record": "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
    "report": "M5 3h14v18H5z M8 16v-4 M12 16V8 M16 16v-6",
    "settings": "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6",
    "sliders": "M5 6h14 M5 12h14 M5 18h14 M9 3v6 M15 9v6 M9 15v6",
    "trash": "M3 6h18 M9 6V3h6v3 M5 6l1 14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-14 M10 10v7 M14 10v7",
    "undo": "M9 5L4 10l5 5 M4 10h10a5 5 0 0 1 0 10h-3",
    "upload": "M12 15V3m-4 4 4-4 4 4 M4 16v4h16v-4",
}

destination = Path(__file__).resolve().parents[1] / "assets" / "icons"
destination.mkdir(parents=True, exist_ok=True)
with TemporaryDirectory() as temporary:
    source = Path(temporary) / "icon.svg"
    for name, path in paths.items():
        source.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24"><path d="{path}" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>')
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-c:v", "librsvg", "-i", str(source),
                        "-frames:v", "1", "-update", "1", str(destination / f"{name}.png")], check=True)
