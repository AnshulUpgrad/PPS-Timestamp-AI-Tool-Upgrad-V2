import os
import modal

audio_path = r"uploads/Prof_Jay_No_pauses_Motion_V3_Test_1_of_4_extracted.m4a"

if not os.path.exists(audio_path):
    print(f"Error: Test audio file not found at {audio_path}")
    sys.exit(1)

try:
    print("Reading audio file bytes...")
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    print("Connecting to Modal app 'whisper-transcribe'...")
    WhisperTranscriber = modal.Cls.from_name("whisper-transcribe", "WhisperTranscriber")
    server = WhisperTranscriber()

    print("Invoking remote WhisperTranscriber.transcribe(model_name='tiny')...")
    result = server.transcribe.remote(
        audio_bytes=audio_bytes,
        model_name="tiny",
        language="en"
    )

    print("\n--- Transcription Successful! ---")
    print(f"Language: {result.get('language')}")
    print(f"Duration: {result.get('duration')}s")
    print("Preview text:")
    print(result.get('text')[:200] + "...")
    print(f"Total segments returned: {len(result.get('segments', []))}")
    if result.get('segments'):
        first_seg = result['segments'][0]
        print(f"First segment ID: {first_seg.get('id')}")
        print(f"First segment text: {first_seg.get('text')}")
        print(f"First segment word count: {len(first_seg.get('words', []))}")

except Exception as e:
    import traceback
    print(f"Error running remote transcription test: {e}")
    traceback.print_exc()
