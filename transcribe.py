#!/home/maxim/.openclaw/workspace/SiteReady/app/venv/bin/python3
import sys
import json
from faster_whisper import WhisperModel

model = WhisperModel("small", device="cpu", compute_type="int8")

def transcribe_audio(audio_path):
    segments, info = model.transcribe(
        audio_path,
        beam_size=5,
        language="en",
        vad_filter=True,
        word_timestamps=True,
        hotwords="SWMS HRCW EWP RCS MAPEPROOF FBT Idrostop Mapeproof SA Primer precast formwork dogman scabbler tilt-up post-tensioning HSWA WorkSafe NZ AS/NZS 1418 AS 3610 AS 3850"
    )
    
    transcript = " ".join(segment.text for segment in segments)
    return transcript.strip()

if __name__ == "__main__":
    audio_path = sys.argv[1]
    result = transcribe_audio(audio_path)
    print(json.dumps({"transcript": result}))
