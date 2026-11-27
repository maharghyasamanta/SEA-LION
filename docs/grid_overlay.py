"""Draw a normalized coordinate grid over candidate images for trace annotation."""
import os
import cv2
import numpy as np

SRC = r"G:\SeaLion\public\samples\_candidates"
OUT = r"G:\SeaLion\docs\grids"
os.makedirs(OUT, exist_ok=True)

FILES = ["wall_detail_cc0.jpg", "pier294290.jpg", "whiteclay_dam.jpg", "austrian_dam.jpg"]

for name in FILES:
    im = cv2.imread(os.path.join(SRC, name))
    h, w = im.shape[:2]
    # resize to max 900
    scale = min(1.0, 900.0 / max(h, w))
    if scale < 1:
        im = cv2.resize(im, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        h, w = im.shape[:2]
    overlay = im.copy()
    for i in range(1, 10):
        x = int(w * i / 10)
        y = int(h * i / 10)
        cv2.line(overlay, (x, 0), (x, h), (0, 255, 255), 1)
        cv2.line(overlay, (0, y), (w, y), (0, 255, 255), 1)
        cv2.putText(overlay, f"{i/10:.1f}", (x + 2, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1, cv2.LINE_AA)
        cv2.putText(overlay, f"{i/10:.1f}", (2, y - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1, cv2.LINE_AA)
    out = cv2.addWeighted(overlay, 0.55, im, 0.45, 0)
    cv2.imwrite(os.path.join(OUT, name.replace(".jpg", "_grid.jpg")), out)
    print(name, w, h)
