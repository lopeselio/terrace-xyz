"""Put the presenter's face in a green-ringed circle in the bottom-right corner of a voiced video.

  python3 facecam.py probe <voiced.mov> <face.mov> <offset> <crop s,x,y> <out.png> t1 t2 ...   contact sheet
  python3 facecam.py render <voiced.mov> <face.mov> <offset> <crop s,x,y> <out.mp4>

offset = face_time - video_time (from facesync.py); negative means the face clip started late and is delayed.
--drift k corrects a phone clock that runs fast/slow: face_time = video_time * (1 + k) + offset.
crop = the square of the 1080x1920 phone frame to show (size, x, y), face centred in it.
The face clip's own audio (if any) is dropped; the voiced video's audio is kept untouched.
"""
import subprocess
import sys

D, RING, MARGIN = 150, 4, 32          # circle diameter, ring width, distance from the frame edge (small: the content leads)
CROP = (760, 220, 620)                # square crop of the phone frame: size, x, y (set from the command line)
# lift the face: brighter midtones, a touch more contrast and colour, slightly warm, gently sharpened
LOOK = "eq=gamma=1.22:contrast=1.06:saturation=1.12:brightness=0.03,colorbalance=rm=0.03:bm=-0.03,unsharp=5:5:0.5"
# for a backlit, darker take: lift the shadows harder
LOOKS = {"bright": "curves=all='0/0 0.2/0.36 0.5/0.68 0.8/0.91 1/1',eq=saturation=1.12,colorbalance=rs=0.03:bs=-0.03:rm=0.02:bm=-0.02,unsharp=5:5:0.5"}
X = 1920 - MARGIN - RING - D
Y = 1080 - MARGIN - RING - D


def disc(size):
    """Alpha = a circle, drawn at 2x and scaled down so the edge is smooth."""
    return (f"format=yuva444p,geq=lum='p(X,Y)':cb='p(X,Y)':cr='p(X,Y)':a='if(lt(hypot(X-W/2,Y-H/2),W/2-1),255,0)',"
            f"scale={size}:{size}")


DRIFT = 0.0


def graph(dur=None, t_in=0.4, retime=""):
    s, x, y = CROP
    face = f"[1:v]{retime}crop={s}:{s}:{x}:{y},{LOOK},scale={D * 2}:{D * 2},{disc(D)}"
    ring = f"color=c=0x2BD46B:s={(D + 2 * RING) * 2}x{(D + 2 * RING) * 2}:r=60,{disc(D + 2 * RING)}"
    if dur:  # fade the bubble in at the start and out at the end
        face += f",fade=t=in:st={t_in}:d=0.5:alpha=1,fade=t=out:st={dur - 1.0}:d=0.6:alpha=1"
        ring += f",fade=t=in:st={t_in}:d=0.5:alpha=1,fade=t=out:st={dur - 1.0}:d=0.6:alpha=1"
    return (f"{face}[f];{ring}[r];[0:v][r]overlay={X - RING}:{Y - RING}:shortest=1[b];"
            f"[b][f]overlay={X}:{Y}:eof_action=pass")


def duration(path):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                                capture_output=True, text=True, check=True).stdout)


def face_input(face, off, t=0.0):
    """Input args for the face clip at video time t."""
    if off + t >= 0:
        return ["-ss", str(off + t), "-i", face]
    return ["-itsoffset", str(-(off + t)), "-i", face]


def probe(video, face, off, out, times):
    tiles = []
    for t in times:
        png = f"{out}.{t}.png"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(t), "-i", video, *face_input(face, off, t),
                        "-filter_complex", graph() + ",scale=640:-1", "-frames:v", "1", png], check=True)
        tiles.append(png)
    if len(tiles) == 1:
        import shutil
        shutil.copy(tiles[0], out)
        print(out)
        return
    cols = 3
    layout = "|".join(f"{(i % cols) * 640}_{(i // cols) * 360}" for i in range(len(tiles)))
    args = sum((["-i", p] for p in tiles), [])
    subprocess.run(["ffmpeg", "-y", "-v", "error", *args, "-filter_complex", f"xstack=inputs={len(tiles)}:layout={layout}:fill=0x333333",
                    out], check=True)
    print(out)


def render(video, face, off, out):
    dur = duration(video)
    if DRIFT:  # retime the face clip in the filter: video_time = (face_time - offset) / (1 + k)
        inputs, retime = ["-i", face], f"setpts=(PTS-STARTPTS)/{1 + DRIFT}{-off / (1 + DRIFT):+.4f}/TB,"
        start = -off / (1 + DRIFT)
    else:
        inputs, retime, start = face_input(face, off), "", -off
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", video, *inputs,
                    "-filter_complex", graph(dur, max(0.4, start + 0.1), retime) + "[v]", "-map", "[v]", "-map", "0:a",
                    "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709",
                    "-c:a", "copy", "-movflags", "+faststart", out], check=True)
    print(out)


if __name__ == "__main__":
    mode, video, face, off = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
    CROP = tuple(int(v) for v in sys.argv[5].split(","))
    if "--drift" in sys.argv:
        i = sys.argv.index("--drift")
        DRIFT = float(sys.argv[i + 1])
        sys.argv = sys.argv[:i] + sys.argv[i + 2:]
    if "--look" in sys.argv:
        LOOK = LOOKS[sys.argv[sys.argv.index("--look") + 1]]
        sys.argv = sys.argv[:sys.argv.index("--look")]
    if mode == "probe":
        probe(video, face, off, sys.argv[6], [float(t) for t in sys.argv[7:]])
    else:
        render(video, face, off, sys.argv[6])
