#!/usr/bin/env python3
"""生成 PaperLens 扩展图标（纯标准库，无需 PIL）：紫色渐变圆角方块 + 白色打开的书。"""
import struct
import zlib
import os

OUT = os.path.dirname(os.path.abspath(__file__))


def write_png(path, size, pixel_fn):
    rows = bytearray()
    for y in range(size):
        rows.append(0)  # filter type 0
        for x in range(size):
            r, g, b, a = pixel_fn(x, y)
            rows += bytes((r, g, b, a))

    def chunk(tag, data):
        c = tag + data
        return (
            struct.pack(">I", len(data))
            + c
            + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)
    print(f"wrote {path} ({size}x{size})")


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def make_pixel_fn(S):
    """在 128x128 逻辑坐标系中绘制，S 为目标图标尺寸。"""

    def px(x, y):
        X, Y = x * 128.0 / S, y * 128.0 / S

        # 圆角矩形背景 (6..122)，半径 28
        if not (6 <= X <= 122 and 6 <= Y <= 122):
            return (0, 0, 0, 0)
        cx = clamp(X, 6 + 28, 122 - 28)
        cy = clamp(Y, 6 + 28, 122 - 28)
        if (X - cx) ** 2 + (Y - cy) ** 2 > 28**2:
            return (0, 0, 0, 0)

        # 背景渐变 #7C3AED -> #4F46E5
        t = clamp((X + Y - 12) / 232.0, 0, 1)
        bg = (lerp(124, 79, t), lerp(58, 70, t), lerp(237, 229, t))  # r,g,b

        # 打开的书（白色）
        # 左页: x∈[26,60] 顶边 46→38 底边 84→92（页面向外弯）
        # 右页: x∈[68,102] 镜像
        # 中缝: x∈[60,68]
        white = False
        line = False
        if 26 <= X <= 60:
            k = (X - 26) / 34.0
            top, bot = lerp(46, 38, k), lerp(84, 92, k)
            if top <= Y <= bot:
                white = True
                # 页面内"文字行"
                for ly in (54, 62, 70, 78):
                    if abs(Y - ly) < 1.3 and 30 <= X <= 56:
                        line = True
        elif 68 <= X <= 102:
            k = (X - 68) / 34.0
            top, bot = lerp(38, 46, k), lerp(92, 84, k)
            if top <= Y <= bot:
                white = True
                for ly in (54, 62, 70, 78):
                    if abs(Y - ly) < 1.3 and 72 <= X <= 98:
                        line = True
        elif 60 <= X <= 68 and 38 <= Y <= 92:
            white = True

        if white and line:
            return (int(bg[0]), int(bg[1]), int(bg[2]), 255)  # 文字行透出背景色
        if white:
            return (255, 255, 255, 255)
        return (int(bg[0]), int(bg[1]), int(bg[2]), 255)

    return px


for size in (16, 48, 128):
    write_png(os.path.join(OUT, f"icon{size}.png"), size, make_pixel_fn(size))
