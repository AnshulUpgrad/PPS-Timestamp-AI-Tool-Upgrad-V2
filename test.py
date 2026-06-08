import subprocess
import sys
from pathlib import Path

def extract_audio(video_path):
    video_path = Path(video_path)

    if not video_path.exists():
        raise FileNotFoundError(f"File not found: {video_path}")

    output_path = video_path.with_suffix(".mp3")

    subprocess.run(
        [
            "ffmpeg",
            "-i", str(video_path),
            "-vn",                 # no video
            "-acodec", "libmp3lame",
            "-q:a", "2",           # high quality VBR
            str(output_path),
            "-y"                   # overwrite existing file
        ],
        check=True
    )

    print(f"Saved: {output_path}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python extract_audio.py <video_path>")
        sys.exit(1)

    extract_audio(sys.argv[1])