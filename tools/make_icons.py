"""Generate app icons without Pillow: dark #111118 tile, lime #9FCC3B ring + play mark."""
import struct, zlib, math, os

def png(width, height, rows):
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

BG = (0x11, 0x11, 0x18); GREEN = (0x9F, 0xCC, 0x3B); LIME = (0xB8, 0xE0, 0x40); WHITE = (255, 255, 255)

def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def render(size, maskable=False):
    rows = []
    c = size / 2
    pad = 0.0 if maskable else 0.08
    radius = size * (0.5 if maskable else 0.22)  # corner radius
    ring_r = size * (0.30 if maskable else 0.34)
    ring_w = size * 0.055
    tri = size * (0.16 if maskable else 0.18)
    for y in range(size):
        row = []
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            # rounded-square tile
            ix, iy = pad * size, pad * size
            ax, ay = size - ix, size - iy
            qx = max(ix + radius - px, 0, px - (ax - radius))
            qy = max(iy + radius - py, 0, py - (ay - radius))
            inside_tile = (qx * qx + qy * qy) <= radius * radius and ix <= px <= ax and iy <= py <= ay
            if not inside_tile and not maskable:
                row.extend((0x11, 0x11, 0x18)); continue
            # subtle glow gradient towards top-left
            d = math.hypot(px - size * 0.15, py - size * 0.15) / size
            col = mix(mix(BG, GREEN, 0.18), BG, min(1, d * 1.6))
            # ring
            dist = math.hypot(px - c, py - c)
            if abs(dist - ring_r) <= ring_w / 2:
                t = (dist - (ring_r - ring_w / 2)) / ring_w
                col = mix(GREEN, LIME, t)
            # play triangle (pointing right), slightly offset
            tx = px - (c + tri * 0.12); ty = py - c
            if tx >= -tri * 0.55 and tx <= tri * 0.75 and abs(ty) <= (tri * 0.75 - tx) * 0.62 + 0.0001 and abs(ty) <= tri * 0.8:
                col = WHITE
            row.extend(col)
        rows.append(row)
    return png(size, size, rows)

os.makedirs('icons', exist_ok=True)
open('icons/icon-192.png', 'wb').write(render(192))
open('icons/icon-512.png', 'wb').write(render(512))
open('icons/icon-maskable-512.png', 'wb').write(render(512, maskable=True))
open('icons/apple-touch-icon.png', 'wb').write(render(180))
print('icons written')
