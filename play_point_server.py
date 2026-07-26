#!/usr/bin/env python3
"""
Small Flask server that uses the `fluidsynth` CLI to render a single note
from a SoundFont (eguitar.sf2) into a WAV and returns it.

Endpoint:
  GET /play-point?pitch=440&duration=0.15&sf2=eguitar.sf2

Notes:
- This script requires the `fluidsynth` binary to be installed and available
  on PATH. On Debian/Ubuntu: `sudo apt install fluidsynth`
  On macOS: `brew install fluidsynth`
- The default SoundFont path is relative to the repo:
  `data/samples/soundfonts/eguitar.sf2`.

Security: This is a small local development helper. Do not expose it to the
public internet without proper hardening.
"""

from flask import Flask, request, send_file, abort, jsonify, make_response
import subprocess
import tempfile
import os
import math
import pathlib
import io
import numpy as np
try:
    from strauss.generator import Sampler
    import soundfile as sf
    STRAUSS_AVAILABLE = True
except Exception:
    STRAUSS_AVAILABLE = False

app = Flask(__name__)

# Default soundfont path (relative to this script)
DEFAULT_SF2 = os.path.join(os.path.dirname(__file__), 'src', 'data', 'samples', 'soundfonts', 'eguitar.sf2')
if not os.path.exists(DEFAULT_SF2):
    # Try the workspace path used in your repo layout
    DEFAULT_SF2 = os.path.join(os.path.dirname(__file__), 'data', 'samples', 'soundfonts', 'eguitar.sf2')


def freq_to_midi(frequency: float) -> int:
    """Convert frequency in Hz to nearest MIDI note number."""
    return int(round(69 + 12 * math.log2(frequency / 440.0)))


@app.route('/play-point')
def play_point():
    # Query params: pitch (Hz) or midi (int), duration (seconds), sf2 (filename)
    pitch = request.args.get('pitch', type=float)
    midi = request.args.get('midi', type=int)
    duration = request.args.get('duration', default=0.15, type=float)
    sf2 = request.args.get('sf2') or DEFAULT_SF2

    # Resolve sf2 path (if just a filename provided, look in data samples folder)
    if not os.path.isabs(sf2) and not os.path.exists(sf2):
        candidate = os.path.join(os.path.dirname(__file__), 'data', 'samples', 'soundfonts', sf2)
        if os.path.exists(candidate):
            sf2 = candidate

    if not os.path.exists(sf2):
        return jsonify({ 'error': 'SoundFont not found', 'path': sf2 }), 404

    if midi is None:
        if pitch is None:
            return jsonify({ 'error': 'must provide pitch (Hz) or midi note' }), 400
        midi = freq_to_midi(pitch)

    # Constrain midi range
    midi = max(0, min(127, midi))

    # Prefer Strauss/Sampler if available (uses the SF2 directly), otherwise
    # fall back to fluidsynth CLI rendering.
    try:
        if STRAUSS_AVAILABLE:
            # Prepare sampler for requested sf2 (reuse default if same)
            if not os.path.isabs(sf2) and not os.path.exists(sf2):
                candidate = os.path.join(os.path.dirname(__file__), 'data', 'samples', 'soundfonts', sf2)
                if os.path.exists(candidate):
                    sf2 = candidate

            if not os.path.exists(sf2):
                return jsonify({ 'error': 'SoundFont not found', 'path': sf2 }), 404

            sampler = Sampler(Path(sf2), sf_preset=31)
            # Strauss Sampler expects pitch in Hz
            frequency = None
            if pitch is not None:
                frequency = pitch
            else:
                frequency = 440.0 * (2.0 ** ((midi - 69) / 12.0))

            # generate PCM array
            audio_array = sampler.generate_note(pitch=frequency, duration=duration)
            sampler.sample_rate = getattr(sampler, 'sample_rate', 44100)

            # write to buffer as WAV
            buf = io.BytesIO()
            sf.write(buf, audio_array, sampler.sample_rate, format='WAV')
            buf.seek(0)
            resp = make_response(buf.read())
            resp.headers.set('Content-Type', 'audio/wav')
            resp.headers.set('Access-Control-Allow-Origin', '*')
            return resp

    except Exception as e:
        # If Strauss failed, log and fall back to fluidsynth below
        print('Strauss rendering failed:', e)

    # Fallback to fluidsynth CLI rendering (existing behavior)
    note_velocity = 110
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as out_f:
        out_path = out_f.name

    commands = f"noteon 0 {midi} {note_velocity}\nsleep {duration}\nnoteoff 0 {midi}\nquit\n"
    cmd = ['fluidsynth', '-ni', sf2, '-F', out_path, '-r', '44100']
    try:
        proc = subprocess.run(cmd, input=commands, text=True, capture_output=True, timeout=10 + int(duration))
        if proc.returncode != 0:
            stderr = proc.stderr.decode() if isinstance(proc.stderr, bytes) else proc.stderr
            stdout = proc.stdout.decode() if isinstance(proc.stdout, bytes) else proc.stdout
            if os.path.exists(out_path):
                try: os.remove(out_path)
                except Exception: pass
            return jsonify({ 'error': 'fluidsynth failed', 'stdout': stdout, 'stderr': stderr }), 500

        # send file
        resp = make_response(send_file(out_path, mimetype='audio/wav', as_attachment=False))
        resp.headers.set('Access-Control-Allow-Origin', '*')
        return resp

    except subprocess.TimeoutExpired:
        if os.path.exists(out_path):
            try: os.remove(out_path)
            except Exception: pass
        return jsonify({ 'error': 'fluidsynth timeout' }), 504
    except FileNotFoundError:
        if os.path.exists(out_path):
            try: os.remove(out_path)
            except Exception: pass
        return jsonify({ 'error': 'fluidsynth not found on PATH. Install fluidsynth.' }), 500
    except Exception as e:
        if os.path.exists(out_path):
            try: os.remove(out_path)
            except Exception: pass
        return jsonify({ 'error': 'internal', 'detail': str(e) }), 500


if __name__ == '__main__':
    # Run only on localhost for development
    app.run(host='127.0.0.1', port=8000, debug=True)
