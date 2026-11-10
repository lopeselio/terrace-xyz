#!/bin/sh
# Render "Your mates in play" in 16:9 and 9:16 with music (m129 from its 42.12 s downbeat, so the 64.12 s drop lands on the goal at 22.0 s), plus a cover per format: ./make.sh [16x9|9x16 ...]
set -e
cd "$(dirname "$0")"
for fmt in ${@:-16x9 9x16}; do
  tag=$([ "$fmt" = 16x9 ] && echo "" || echo "-$fmt")
  for i in 0 1 2 3; do a=$((i*720)); .venv/bin/python render.py stream "$fmt" $a $((a+720)) "part-$fmt-$i.mp4" >/dev/null & done; wait
  cd out
  printf "file 'part-$fmt-%d.mp4'\n" 0 1 2 3 > "parts-$fmt.txt"
  ffmpeg -y -loglevel error -f concat -safe 0 -i "parts-$fmt.txt" -c copy "Terrace-Mates-In-Play$tag-silent.mp4"
  ffmpeg -y -loglevel error -i "Terrace-Mates-In-Play$tag-silent.mp4" -i ../../called-it/audio/m129.mp3 \
    -filter_complex "[1:a]atrim=42.12:90.12,asetpts=N/SR/TB,afade=t=in:d=0.25,afade=t=out:st=45.5:d=2.5,loudnorm=I=-14:TP=-1.5,aresample=48000[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "Terrace-Mates-In-Play$tag.mp4"
  ffmpeg -y -loglevel error -ss 0 -i "Terrace-Mates-In-Play$tag-silent.mp4" -frames:v 1 "Terrace-Mates-In-Play$tag-cover.png"
  rm part-$fmt-*.mp4 "parts-$fmt.txt"
  cd ..
  echo "out/Terrace-Mates-In-Play$tag.mp4"
done
