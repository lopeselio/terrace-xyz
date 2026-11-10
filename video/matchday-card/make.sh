#!/bin/sh
# Render "Share your matchday" in 16:9 and 9:16 with music (m190 from 47.81 s, so its drop at 63.5 s lands as the card unfurls in the chat), plus a cover per format: ./make.sh [16x9|9x16 ...]
set -e
cd "$(dirname "$0")"
NAME=Terrace-Matchday-Card
for fmt in ${@:-16x9 9x16}; do
  tag=$([ "$fmt" = 16x9 ] && echo "" || echo "-$fmt")
  for i in 0 1 2 3; do a=$((i*720)); .venv/bin/python render.py stream "$fmt" $a $((a+720)) "part-$fmt-$i.mp4" >/dev/null & done; wait
  cd out
  printf "file 'part-$fmt-%d.mp4'\n" 0 1 2 3 > "parts-$fmt.txt"
  ffmpeg -y -loglevel error -f concat -safe 0 -i "parts-$fmt.txt" -c copy "$NAME$tag-silent.mp4"
  ffmpeg -y -loglevel error -i "$NAME$tag-silent.mp4" -i ../../called-it/audio/m190.mp3 \
    -filter_complex "[1:a]atrim=47.81:95.81,asetpts=N/SR/TB,afade=t=in:d=0.25,afade=t=out:st=45.5:d=2.5,loudnorm=I=-14:TP=-1.5,aresample=48000[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "$NAME$tag.mp4"
  ffmpeg -y -loglevel error -ss 0 -i "$NAME$tag-silent.mp4" -frames:v 1 "$NAME$tag-cover.png"
  rm part-$fmt-*.mp4 "parts-$fmt.txt"
  cd ..
  echo "out/$NAME$tag.mp4"
done
