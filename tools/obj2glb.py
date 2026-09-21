#!/usr/bin/env python3
"""OBJ -> decimated GLB.

Sketchfab "low poly" downloads are routinely a million triangles and 90 MB
of ASCII, which is not something you put on a static host. This reduces by
vertex clustering (snap vertices to a grid, drop degenerate faces), rebuilds
smooth normals, re-orients and rescales to the game's metre-scale axes, and
writes a binary glTF with no external dependencies.
"""
import json, struct, sys, math, argparse
from collections import defaultdict


def load_obj(path):
    verts, faces = [], []
    with open(path, encoding='utf-8', errors='replace') as fh:
        for line in fh:
            if line.startswith('v '):
                p = line.split()
                verts.append((float(p[1]), float(p[2]), float(p[3])))
            elif line.startswith('f '):
                idx = []
                for tok in line.split()[1:]:
                    s = tok.split('/')[0]
                    i = int(s)
                    idx.append(i - 1 if i > 0 else len(verts) + i)
                # fan-triangulate n-gons
                for k in range(1, len(idx) - 1):
                    faces.append((idx[0], idx[k], idx[k + 1]))
    return verts, faces


def cluster_decimate(verts, faces, cells):
    """Snap every vertex to a grid cell, then keep one representative per
    cell (the centroid of everything that landed in it). Faces whose three
    corners collapse into fewer than three cells disappear."""
    xs = [v[0] for v in verts]; ys = [v[1] for v in verts]; zs = [v[2] for v in verts]
    mn = (min(xs), min(ys), min(zs))
    mx = (max(xs), max(ys), max(zs))
    size = max(mx[i] - mn[i] for i in range(3))
    cell = size / cells

    key_of = {}
    accum = defaultdict(lambda: [0.0, 0.0, 0.0, 0])
    for i, v in enumerate(verts):
        k = (int((v[0] - mn[0]) / cell), int((v[1] - mn[1]) / cell), int((v[2] - mn[2]) / cell))
        key_of[i] = k
        a = accum[k]
        a[0] += v[0]; a[1] += v[1]; a[2] += v[2]; a[3] += 1

    order = {}
    newverts = []
    for k, a in accum.items():
        order[k] = len(newverts)
        newverts.append((a[0] / a[3], a[1] / a[3], a[2] / a[3]))

    seen = set()
    newfaces = []
    for (a, b, c) in faces:
        ia, ib, ic = order[key_of[a]], order[key_of[b]], order[key_of[c]]
        if ia == ib or ib == ic or ia == ic:
            continue
        sig = tuple(sorted((ia, ib, ic)))
        if sig in seen:
            continue
        seen.add(sig)
        newfaces.append((ia, ib, ic))
    return newverts, newfaces


def smooth_normals(verts, faces):
    nor = [[0.0, 0.0, 0.0] for _ in verts]
    for (a, b, c) in faces:
        ax, ay, az = verts[a]; bx, by, bz = verts[b]; cx, cy, cz = verts[c]
        ux, uy, uz = bx - ax, by - ay, bz - az
        vx, vy, vz = cx - ax, cy - ay, cz - az
        nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
        for i in (a, b, c):
            nor[i][0] += nx; nor[i][1] += ny; nor[i][2] += nz
    out = []
    for n in nor:
        L = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) or 1.0
        out.append((n[0] / L, n[1] / L, n[2] / L))
    return out


def transform(verts, target_len, axis_order, flips, sit_on_ground=True):
    """Re-orient to the game's convention: +Y up, +Z forward, wheels on y=0,
    centred on x, and scaled so the longest horizontal axis is target_len."""
    p = []
    for v in verts:
        w = [v[axis_order[0]], v[axis_order[1]], v[axis_order[2]]]
        for i in range(3):
            if flips[i]:
                w[i] = -w[i]
        p.append(w)
    xs = [q[0] for q in p]; ys = [q[1] for q in p]; zs = [q[2] for q in p]
    span_x = max(xs) - min(xs); span_z = max(zs) - min(zs)
    scale = target_len / max(span_x, span_z)
    cx = (max(xs) + min(xs)) / 2
    cz = (max(zs) + min(zs)) / 2
    miny = min(ys)
    out = []
    for q in p:
        out.append((
            (q[0] - cx) * scale,
            (q[1] - (miny if sit_on_ground else (max(ys) + min(ys)) / 2)) * scale,
            (q[2] - cz) * scale,
        ))
    return out


def write_glb(path, verts, nors, faces, name, base_color, metallic, roughness):
    pos = b''.join(struct.pack('<3f', *v) for v in verts)
    nrm = b''.join(struct.pack('<3f', *n) for n in nors)
    use32 = len(verts) > 65535
    fmt = '<3I' if use32 else '<3H'
    idx = b''.join(struct.pack(fmt, *f) for f in faces)
    while len(idx) % 4:
        idx += b'\x00'

    xs = [v[0] for v in verts]; ys = [v[1] for v in verts]; zs = [v[2] for v in verts]
    buf = pos + nrm + idx
    gltf = {
        "asset": {"version": "2.0", "generator": "e-ride obj2glb"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": name}],
        "meshes": [{"name": name, "primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 0}]}],
        "materials": [{
            "name": name + "_mat",
            "pbrMetallicRoughness": {
                "baseColorFactor": base_color,
                "metallicFactor": metallic,
                "roughnessFactor": roughness,
            },
            "doubleSided": True,
        }],
        "buffers": [{"byteLength": len(buf)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(pos), "target": 34962},
            {"buffer": 0, "byteOffset": len(pos), "byteLength": len(nrm), "target": 34962},
            {"buffer": 0, "byteOffset": len(pos) + len(nrm), "byteLength": len(idx), "target": 34963},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(verts), "type": "VEC3",
             "min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]},
            {"bufferView": 1, "componentType": 5126, "count": len(verts), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5125 if use32 else 5123,
             "count": len(faces) * 3, "type": "SCALAR"},
        ],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    total = 12 + 8 + len(js) + 8 + len(buf)
    with open(path, 'wb') as fh:
        fh.write(struct.pack('<III', 0x46546C67, 2, total))
        fh.write(struct.pack('<II', len(js), 0x4E4F534A)); fh.write(js)
        fh.write(struct.pack('<II', len(buf), 0x004E4942)); fh.write(buf)
    return total


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--cells', type=int, default=150)
    ap.add_argument('--length', type=float, default=1.9)
    ap.add_argument('--name', default='model')
    ap.add_argument('--axes', default='0,1,2')
    ap.add_argument('--flip', default='0,0,0')
    ap.add_argument('--color', default='0.55,0.58,0.62,1')
    ap.add_argument('--metal', type=float, default=0.55)
    ap.add_argument('--rough', type=float, default=0.42)
    a = ap.parse_args()

    print('loading', a.src)
    verts, faces = load_obj(a.src)
    print(f'  in : {len(verts):,} verts  {len(faces):,} tris')
    verts, faces = cluster_decimate(verts, faces, a.cells)
    print(f'  out: {len(verts):,} verts  {len(faces):,} tris')
    verts = transform(verts, a.length,
                      [int(x) for x in a.axes.split(',')],
                      [bool(int(x)) for x in a.flip.split(',')])
    nors = smooth_normals(verts, faces)
    n = write_glb(a.dst, verts, nors, faces, a.name,
                  [float(x) for x in a.color.split(',')], a.metal, a.rough)
    print(f'  wrote {a.dst}  {n/1024:.0f} KB')
