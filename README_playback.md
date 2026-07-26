Local SF2 playback server (Fluidsynth)

This repository includes a small Flask helper server that renders single notes
from a SoundFont (.sf2) using the `fluidsynth` CLI and returns a WAV file.

Files added:
- play_point_server.py  -- Flask server listening on http://127.0.0.1:8000/play-point
- requirements.txt      -- Python dependencies (Flask)

Usage

1) Install system dependency `fluidsynth`:
   - Debian/Ubuntu: sudo apt update && sudo apt install fluidsynth
   - macOS (Homebrew): brew install fluidsynth
   - Windows: install fluidsynth (e.g. via MSYS2 pacman or prebuilt binaries) and ensure `fluidsynth.exe` is on PATH.

2) Install Python deps (prefer a virtualenv):

```bash
python -m venv .venv
.venv\Scripts\activate   # Windows
source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
```

3) Run the server (from project root):

```bash
python play_point_server.py
```

4) Test from browser or the app:

Visit:

```
http://127.0.0.1:8000/play-point?pitch=440&duration=0.15&sf2=eguitar.sf2
```

Notes
- The server expects the SoundFont file `eguitar.sf2` to be found in either
  `data/samples/soundfonts/eguitar.sf2` or `src/data/samples/soundfonts/eguitar.sf2`.
  You may also pass an absolute path via the `sf2` query parameter.
- This is intended as a local development helper for achieving accurate
  SF2-based instrument playback. It is not hardened for production use.
