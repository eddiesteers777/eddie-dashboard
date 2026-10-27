#!/bin/sh
# Re-encodes the best 8 or so seconds of each app tour recording (videos/tour/<id>.mp4) for the home page phone,
# which is driven by the scroll: forwards and backwards, so a new key frame every 3 frames at 15 fps keeps every seek fast.
# Output: videos/tour/scrub/<id>.mp4 (no audio, 360 wide, well under 1 MB each). Needs ffmpeg. Run `npm run manifest` after.
set -e
cd "$(dirname "$0")/.."
mkdir -p videos/tour/scrub
enc() { # id, select expression of kept seconds
  ffmpeg -v error -y -i "videos/tour/$1.mp4" -an -vf "select='$2',setpts=N/(FRAME_RATE*TB),fps=15,scale=360:-2" -c:v libx264 -preset slow -crf 30 -g 3 -keyint_min 3 -sc_threshold 0 -pix_fmt yuv420p -movflags +faststart "videos/tour/scrub/$1.mp4"
}
enc checkin 'between(t,4,8)+between(t,16,20)'
enc plans   'between(t,1,5)+between(t,12,16)'
enc live    'between(t,0,4)+between(t,14,18)'
enc wins    'between(t,2,6)+between(t,8,10)+between(t,16,18)'
enc soccer  'between(t,2,7)+between(t,14,17)'
enc fuel    'between(t,2,4)+between(t,8,10)+between(t,12,16)'
enc pace    'between(t,2,6)+between(t,10,12)+between(t,16,18)'
