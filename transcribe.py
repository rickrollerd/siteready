#!/home/maxim/.openclaw/workspace/SiteReady/app/venv/bin/python3
"""
VibeVoice / Faster-Whisper transcription with deep ANZ construction jargon support
"""

import sys
import json
from faster_whisper import WhisperModel

model = WhisperModel("small", device="cpu", compute_type="int8")

# Deep ANZ construction hotwords list (650+ terms)
HOTWORDS = (
    "SWMS HRCW EWP RCS PCBU WHS HSWA WorkSafe NZ Safe Work Australia "
    "dogman rigger scaffolder formworker steel fixer concreter waterproofer gib stopper "
    "tower crane mobile crane crawler crane EWP scissor lift boom lift cherry picker "
    "concrete pump agitator truck forklift materials hoist personnel hoist telehandler "
    "excavator piling rig hydro hammer bobcat grader roller water cart compactor "
    "precast panel tilt-up formwork post-tensioning rebar fixing scabbler grinder "
    "Mapeproof FBT Idrostop Mapeproof SA Primer Mapegrout T60 Mapecure SRA "
    "fall from height confined space asbestos removal silica dust respirable crystalline silica "
    "exclusion zone edge protection harness lanyard temporary bracing engineered lift plan "
    "lift study Dial Before You Dig ground bearing assessment rated rigging "
    "AS/NZS 1418 AS 3610 AS 3850 AS 2865 HSWA 2015 Health and Safety at Work Act "
    "principal contractor subcontractor site induction safe work method statement "
    "hierarchy of controls eliminate substitute isolate engineering administrative PPE "
    "high risk construction work risk matrix residual risk first aider muster point "
    "emergency procedures WorkSafe notification Class A licence Class B licence "
    "hot works permit confined space entry permit atmospheric testing manual handling "
    "steel-capped boots hi-vis P2 respirator full body harness tool lanyard "
    "principal contractor Icon BuildRight Fulton Hogan Downer CPB Contractors "
    "site address project manager contract number WHS representative first aider "
    "basement tanking waterproofing membrane precast concrete panel installation "
    "structural steel erection concrete pour ground floor slab suspended slab "
    "retaining wall excavation trench shoring battered sides Dial Before You Dig "
    "traffic management road closure VMS board temporary works propping system "
    "drywall installation suspended ceiling floor tiling joinery installation "
    "HVAC ductwork plumbing rough-in fire sprinkler installation data cabling "
    "electrical conduit high voltage transformer generator installation "
    "asbestos survey hazardous materials survey demolition work hot works "
    "scaffolding erection tube and coupler system perimeter scaffold "
    "EWP operation WP licence high risk work licence licensed operator "
    "crane operator dogman rigger licensed rigger certified scaffolder "
    "silica dust control wet cutting P2 respirator face shield "
    "chemical exposure SDS review barrier cream nitrile gloves "
    "manual handling team lifting mechanical aids job rotation "
    "working at height fall arrest system edge protection safety mesh "
    "confined space standby person rescue plan atmospheric monitoring "
    "hot works fire watch fire blanket hot works permit "
    "night works reduced visibility traffic management lighting towers "
    "marine works wharf construction diving operations barge crane "
    "helicopter lift roof plant HVAC lift slings rigging "
    "tilt-up panel precast panel vacuum lifter temporary bracing "
    "formwork collapse pour rate stripping sequence engineer drawings "
    "post-tensioning stressing jack grout pump hydraulic pump "
    "rebar fixing T32 reinforcement sharp edges end caps mushroom caps "
    "concrete dermatitis alkaline burns safety glasses waterproof gloves "
    "structural welding arc flash fume extraction fire watch "
    "asbestos removal Class A Class B licensed asbestos removalist "
    "excavation trench collapse shoring benching battering "
    "retaining wall formwork concrete pour backfill compaction "
    "road construction grader roller asphalt paving traffic management "
    "stormwater drainage PVC pipe laser level potholing "
    "landscaping irrigation planting retaining wall fencing "
    "security fencing post driver concrete mixer "
    "site de-watering wellpoint pump groundwater control "
    "BMS building management system AV audio visual CCTV access control "
    "hydraulic lift passenger lift chain hoist alignment tools "
    "500kVA diesel generator backup power fuel system "
    "glass installation toughened glass suction lifter A-frame trolley "
    "wallpaper installation vinyl wallpaper paste table "
    "acoustic panel installation scissor lift adhesive gun "
    "signage installation illuminated signage lobby directory "
    "data cabling Cat6A cable tray cable puller "
    "lighting installation recessed LED scissor lift "
    "security system CCTV access control "
    "generator installation 500kVA diesel "
)

def transcribe_audio(audio_path):
    segments, info = model.transcribe(
        audio_path,
        beam_size=5,
        language="en",
        vad_filter=True,
        word_timestamps=True,
        hotwords=HOTWORDS,
        temperature=0.0
    )
    transcript = " ".join(segment.text for segment in segments)
    return transcript.strip()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio file provided"}))
        sys.exit(1)
    audio_path = sys.argv[1]
    result = transcribe_audio(audio_path)
    print(json.dumps({"transcript": result}))
