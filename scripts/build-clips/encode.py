# venv/bin/python encode.py <frames dir> <out base>  -> <base>.mp4 (H.264) + <base>.webm (VP9) + <base>.jpg poster
import sys, glob, fractions
import av
from PIL import Image

src, base = sys.argv[1], sys.argv[2]
frames = sorted(glob.glob(f"{src}/f*.png"))

def encode(path, codec, opts, pix="yuv420p"):
    out = av.open(path, "w", options={"movflags": "+faststart"} if path.endswith(".mp4") else {})
    st = out.add_stream(codec, rate=30, options=opts)
    st.width = st.height = 1080
    st.pix_fmt = pix
    st.time_base = fractions.Fraction(1, 30)
    for i, f in enumerate(frames):
        fr = av.VideoFrame.from_image(Image.open(f).convert("RGB"))
        fr.pts = i
        for pkt in st.encode(fr):
            out.mux(pkt)
    for pkt in st.encode():
        out.mux(pkt)
    out.close()

encode(base + ".mp4", "libx264", {"crf": "22", "preset": "slow", "profile": "high", "tune": "animation", "g": "60"})
encode(base + ".webm", "libvpx-vp9", {"crf": "36", "b": "0", "row-mt": "1", "deadline": "good", "cpu-used": "2", "g": "60"})
Image.open(frames[0]).convert("RGB").resize((540, 540), Image.LANCZOS).save(base + ".jpg", quality=84, optimize=True)
print(base, len(frames), "frames")
