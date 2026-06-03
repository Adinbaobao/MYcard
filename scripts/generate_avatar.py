from __future__ import annotations

import math
import os
import struct
import zlib

WIDTH = 1024
HEIGHT = 1024
pixels = bytearray(WIDTH * HEIGHT * 4)


def clamp(value: float) -> int:
    return max(0, min(255, round(value)))


def lerp(start: float, end: float, amount: float) -> float:
    return start + (end - start) * amount


def set_pixel(x: int, y: int, r: float, g: float, b: float, a: float = 255) -> None:
    if x < 0 or x >= WIDTH or y < 0 or y >= HEIGHT:
        return

    index = (y * WIDTH + x) * 4
    pixels[index] = clamp(r)
    pixels[index + 1] = clamp(g)
    pixels[index + 2] = clamp(b)
    pixels[index + 3] = clamp(a)


def blend_pixel(x: int, y: int, r: float, g: float, b: float, a: float = 255) -> None:
    if x < 0 or x >= WIDTH or y < 0 or y >= HEIGHT:
        return

    index = (y * WIDTH + x) * 4
    alpha = a / 255
    pixels[index] = clamp(r * alpha + pixels[index] * (1 - alpha))
    pixels[index + 1] = clamp(g * alpha + pixels[index + 1] * (1 - alpha))
    pixels[index + 2] = clamp(b * alpha + pixels[index + 2] * (1 - alpha))
    pixels[index + 3] = 255


def fill_circle(cx: float, cy: float, rx: float, ry: float, color: tuple[int, int, int, int]) -> None:
    r, g, b, a = color
    for y in range(math.floor(cy - ry), math.ceil(cy + ry) + 1):
        for x in range(math.floor(cx - rx), math.ceil(cx + rx) + 1):
            dx = (x + 0.5 - cx) / rx
            dy = (y + 0.5 - cy) / ry
            distance = dx * dx + dy * dy

            if distance <= 1:
                edge = min(1, (1 - distance) * 14)
                blend_pixel(x, y, r, g, b, a * edge)


def fill_rounded_rect(
    x: float,
    y: float,
    rect_width: float,
    rect_height: float,
    radius: float,
    color: tuple[int, int, int, int],
) -> None:
    r, g, b, a = color
    corners = (
        (x + radius, y + radius),
        (x + rect_width - radius, y + radius),
        (x + radius, y + rect_height - radius),
        (x + rect_width - radius, y + rect_height - radius),
    )

    for yy in range(math.floor(y), math.ceil(y + rect_height)):
        for xx in range(math.floor(x), math.ceil(x + rect_width)):
            in_horizontal = x + radius <= xx <= x + rect_width - radius
            in_vertical = y + radius <= yy <= y + rect_height - radius
            inside = in_horizontal or in_vertical

            for corner_x, corner_y in corners:
                dx = xx - corner_x
                dy = yy - corner_y
                if dx * dx + dy * dy <= radius * radius:
                    inside = True

            if inside:
                blend_pixel(xx, yy, r, g, b, a)


def stroke_line(
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    color: tuple[int, int, int, int],
    line_width: float = 3,
) -> None:
    r, g, b, a = color
    vx = x1 - x0
    vy = y1 - y0
    length_squared = vx * vx + vy * vy

    for y in range(math.floor(min(y0, y1) - line_width), math.ceil(max(y0, y1) + line_width) + 1):
        for x in range(math.floor(min(x0, x1) - line_width), math.ceil(max(x0, x1) + line_width) + 1):
            amount = ((x - x0) * vx + (y - y0) * vy) / length_squared
            amount = max(0, min(1, amount))
            px = x0 + amount * vx
            py = y0 + amount * vy
            distance = math.hypot(x - px, y - py)

            if distance <= line_width:
                blend_pixel(x, y, r, g, b, a * (1 - distance / line_width))


def stroke_circle(
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    color: tuple[int, int, int, int],
    line_width: float = 4,
    start: float = 0,
    end: float = math.pi * 2,
) -> None:
    angle = start
    while angle < end:
        fill_circle(cx + math.cos(angle) * rx, cy + math.sin(angle) * ry, line_width, line_width, color)
        angle += 0.0025


def write_png(file_path: str) -> None:
    raw = bytearray()
    for y in range(HEIGHT):
        row_start = y * WIDTH * 4
        raw.append(0)
        raw.extend(pixels[row_start : row_start + WIDTH * 4])

    def chunk(chunk_type: bytes, data: bytes) -> bytes:
        checksum = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", checksum)

    header = struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")

    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "wb") as output:
        output.write(png)


for y in range(HEIGHT):
    for x in range(WIDTH):
        nx = x / WIDTH
        ny = y / HEIGHT
        glow = max(0, 1 - math.hypot(nx - 0.28, ny - 0.18) * 2.1)
        glow2 = max(0, 1 - math.hypot(nx - 0.75, ny - 0.72) * 2.4)
        set_pixel(
            x,
            y,
            lerp(238, 204, ny) + glow * 22 - glow2 * 8,
            lerp(249, 235, ny) + glow * 18 + glow2 * 18,
            lerp(255, 244, ny) + glow * 8 + glow2 * 6,
        )

for x in range(80, 950, 72):
    stroke_line(x, 92, x - 90, 910, (29, 119, 182, 32), 2)

for y in range(120, 920, 70):
    stroke_line(78, y, 938, y + 34, (30, 138, 90, 28), 2)

for i in range(8):
    cx = 150 + i * 108
    cy = 780 - math.sin(i * 0.8) * 70
    fill_circle(cx, cy, 6, 6, (30, 138, 90, 90))
    if i > 0:
        stroke_line(
            150 + (i - 1) * 108,
            780 - math.sin((i - 1) * 0.8) * 70,
            cx,
            cy,
            (30, 138, 90, 70),
            3,
        )

stroke_circle(512, 486, 382, 382, (0, 119, 182, 44), 4, math.pi * 1.06, math.pi * 1.92)
stroke_circle(512, 486, 315, 315, (30, 138, 90, 50), 3, math.pi * 0.08, math.pi * 0.82)
stroke_circle(512, 486, 244, 244, (0, 119, 182, 48), 3, math.pi * 1.2, math.pi * 1.72)

angle = -0.95
while angle <= 0.95:
    stroke_line(512, 486, 512 + math.cos(angle) * 356, 486 + math.sin(angle) * 356, (0, 119, 182, 28), 2)
    angle += 0.32

fill_circle(512, 840, 260, 74, (28, 45, 61, 30))
fill_rounded_rect(342, 650, 340, 250, 88, (32, 65, 92, 255))
fill_rounded_rect(372, 636, 280, 210, 78, (47, 101, 135, 255))
fill_rounded_rect(413, 610, 198, 160, 58, (235, 242, 248, 255))
fill_circle(463, 627, 52, 48, (255, 255, 255, 245))
fill_circle(561, 627, 52, 48, (255, 255, 255, 245))
stroke_line(512, 622, 475, 732, (32, 65, 92, 180), 10)
stroke_line(512, 622, 551, 732, (32, 65, 92, 180), 10)
fill_rounded_rect(491, 635, 42, 130, 18, (0, 119, 182, 235))
fill_circle(512, 632, 28, 26, (0, 119, 182, 245))

fill_rounded_rect(451, 512, 122, 148, 44, (219, 164, 126, 255))
fill_circle(512, 642, 88, 42, (185, 128, 94, 72))
fill_circle(390, 426, 42, 56, (218, 159, 120, 255))
fill_circle(634, 426, 42, 56, (218, 159, 120, 255))
fill_circle(512, 410, 134, 166, (229, 174, 134, 255))
fill_circle(472, 392, 22, 18, (242, 194, 158, 90))
fill_circle(558, 392, 20, 16, (242, 194, 158, 80))

fill_circle(512, 292, 132, 72, (37, 44, 55, 255))
fill_circle(419, 341, 60, 82, (37, 44, 55, 255))
fill_circle(599, 338, 62, 80, (37, 44, 55, 255))
fill_rounded_rect(416, 270, 198, 84, 44, (37, 44, 55, 255))
fill_circle(482, 292, 72, 46, (51, 61, 74, 255))

fill_circle(462, 415, 9, 7, (34, 42, 52, 235))
fill_circle(562, 415, 9, 7, (34, 42, 52, 235))
stroke_line(436, 392, 484, 386, (43, 52, 63, 130), 5)
stroke_line(540, 386, 588, 392, (43, 52, 63, 130), 5)
stroke_line(512, 424, 499, 470, (143, 91, 70, 100), 4)
stroke_line(476, 506, 548, 506, (137, 73, 74, 170), 5)
fill_circle(448, 458, 22, 14, (232, 140, 122, 44))
fill_circle(577, 458, 22, 14, (232, 140, 122, 38))

stroke_circle(462, 419, 42, 30, (22, 43, 61, 170), 4)
stroke_circle(562, 419, 42, 30, (22, 43, 61, 170), 4)
stroke_line(504, 418, 520, 418, (22, 43, 61, 170), 4)
stroke_line(420, 414, 386, 400, (22, 43, 61, 120), 3)
stroke_line(604, 414, 638, 400, (22, 43, 61, 120), 3)

fill_rounded_rect(664, 610, 132, 172, 24, (245, 248, 252, 230))
fill_rounded_rect(680, 634, 100, 118, 10, (221, 239, 247, 255))
stroke_line(694, 658, 764, 658, (0, 119, 182, 120), 4)
stroke_line(694, 690, 750, 690, (30, 138, 90, 120), 4)
stroke_line(694, 722, 764, 722, (0, 119, 182, 100), 4)
fill_circle(726, 768, 10, 10, (0, 119, 182, 150))

for y in range(HEIGHT):
    for x in range(WIDTH):
        nx = x / WIDTH
        ny = y / HEIGHT
        shine = max(0, 1 - abs(nx + ny - 0.62) * 8) * max(0, 1 - math.hypot(nx - 0.22, ny - 0.26) * 1.8)
        if shine > 0:
            blend_pixel(x, y, 255, 255, 255, shine * 36)

write_png(os.path.join("assets", "avatar-engineer.png"))
print(os.path.abspath(os.path.join("assets", "avatar-engineer.png")))
