#!/bin/sh
# Re-encodes the app tour recordings (videos/tour/<id>.mp4) for the home page phone, which is driven by the
# scroll: forwards and backwards, so a new key frame every 3 frames at 15 fps keeps every seek fast.
# Output: videos/tour/scrub/<id>.mp4 (no audio, about 1.3 to 2.7 MB each). Needs ffmpeg. Run `npm run manifest` after.
set -e
cd "$(dirname "$0")/.."
mkdir -p videos/tour/scrub
for id in checkin wins plans live soccer fuel pace; do
  ffmpeg -v error -y -i "videos/tour/$id.mp4" -an -vf fps=15 -c:v libx264 -preset slow -crf 31 -g 3 -keyint_min 3 -sc_threshold 0 -pix_fmt yuv420p -movflags +faststart "videos/tour/scrub/$id.mp4"
done
