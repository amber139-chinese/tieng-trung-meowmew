#!/usr/bin/env python3
from pathlib import Path
import json
import subprocess
import sys
import tempfile

from melo.api import TTS

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "speaking-sentences.json"
AUDIO_DIR = ROOT / "audio" / "speaking"

AUDIO_DIR.mkdir(parents=True, exist_ok=True)

sentences = json.loads(BANK.read_text(encoding="utf-8"))

print(f"Loading MeloTTS Chinese model...")
model = TTS(language="ZH", device="cpu")
speaker_ids = model.hps.data.spk2id
speaker = speaker_ids["ZH"]

generated = 0
skipped = 0

for i, item in enumerate(sentences, start=1):
    rel = item["audio"]
    mp3_path = ROOT / rel

    if mp3_path.exists() and mp3_path.stat().st_size > 1000:
        print(f"[{i:03d}/{len(sentences)}] skip {mp3_path.name}")
        skipped += 1
        continue

    text = item["cn"].strip()
    print(f"[{i:03d}/{len(sentences)}] {text}")

    with tempfile.TemporaryDirectory() as td:
        wav_path = Path(td) / "voice.wav"

        # Natural base speed. The website can play the same MP3 at 0.85x.
        model.tts_to_file(
            text,
            speaker,
            str(wav_path),
            speed=1.0,
        )

        mp3_path.parent.mkdir(parents=True, exist_ok=True)

        subprocess.run(
            [
                "ffmpeg", "-y",
                "-loglevel", "error",
                "-i", str(wav_path),
                "-af", "loudnorm=I=-18:LRA=11:TP=-1.5",
                "-ac", "1",
                "-ar", "24000",
                "-codec:a", "libmp3lame",
                "-b:a", "64k",
                str(mp3_path),
            ],
            check=True,
        )

    generated += 1

print("")
print(f"Done. Generated: {generated}; skipped: {skipped}.")
print(f"Audio directory: {AUDIO_DIR}")
