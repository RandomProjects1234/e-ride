#!/usr/bin/env python3
"""Split a single-mesh bike into frame / front wheel / rear wheel.

A downloaded model is usually one welded blob, so nothing can spin or
steer. The wheels are the two round masses low down at each end, so we
find their axle centres by fitting a circle to the low geometry at each
end, then assign every triangle by which centre its centroid orbits.
The result is a GLB with three named meshes the game can animate.
"""
import json, struct, math, sys, argparse
from collections import defaultdict
sys.path.insert(0, '.')
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from obj2glb import load_obj, cluster_decimate, smooth_normals, transform


def fit_circle(pts):
    """Least-squares circle through (z, y) points — Kasa fit."""
    n = len(pts)
    Sz = sum(p[0] for p in pts); Sy = sum(p[1] for p in pts)
    Szz = sum(p[0] * p[0] for p in pts); Syy = sum(p[1] * p[1] for p in pts)
    Szy = sum(p[0] * p[1] for p in pts)
    Szzz = sum(p[0] ** 3 for p in pts); Syyy = sum(p[1] ** 3 for p in pts)
    Szyy = sum(p[0] * p[1] * p[1] for p in pts); Syzz = sum(p[1] * p[0] * p[0] for p in pts)
    A = n * Szz - Sz * Sz
    B = n * Szy - Sz * Sy
    C = n * Syy - Sy * Sy
    D = 0.5 * (n * Szyy - Sz * Syy + n * Szzz - Sz * Szz)
    E = 0.5 * (n * Syzz - Sy * Szz + n * Syyy - Sy * Syy)
    den = A * C - B * B
    if abs(den) < 1e-9:
        return None
    cz = (D * C - B * E) / den
    cy = (A * E - B * D) / den
    r = sum(math.hypot(p[0] - cz, p[1] - cy) for p in pts) / n
    return cz, cy, r


def segment(verts, faces, wheel_band=0.62):
    ys = [v[1] for v in verts]; zs = [v[2] for v in verts]
    top = max(ys)
    zmin, zmax = min(zs), max(zs)
    band = top * wheel_band

    # candidate wheel vertices: low down, at each end
    frontPts = [(v[2], v[1]) for v in verts if v[1] < band and v[2] > zmax * 0.30]
    rearPts = [(v[2], v[1]) for v in verts if v[1] < band and v[2] < zmin * 0.30]
    fc = fit_circle(frontPts) if len(frontPts) > 40 else None
    rc = fit_circle(rearPts) if len(rearPts) > 40 else None
    if not fc or not rc:
        return None
    # The fit latches onto the hub and disc rather than the tyre, so it
    # under-reads badly. A wheel that touches the ground has a radius equal
    # to its axle height, which is exact and needs no fitting.
    fc = (fc[0], fc[1], max(fc[2], fc[1]))
    rc = (rc[0], rc[1], max(rc[2], rc[1]))
    print(f'  front axle z={fc[0]:.3f} y={fc[1]:.3f} r={fc[2]:.3f}  ({len(frontPts)} pts)')
    print(f'  rear  axle z={rc[0]:.3f} y={rc[1]:.3f} r={rc[2]:.3f}  ({len(rearPts)} pts)')

    groups = {'frame': [], 'wheelF': [], 'wheelR': []}
    for f in faces:
        cz = sum(verts[i][2] for i in f) / 3
        cy = sum(verts[i][1] for i in f) / 3
        df = math.hypot(cz - fc[0], cy - fc[1])
        dr = math.hypot(cz - rc[0], cy - rc[1])
        # a triangle belongs to a wheel if it sits inside that wheel's disc
        # and is nearer to it than to the other one
        if df <= fc[2] * 1.03 and df < dr:
            groups['wheelF'].append(f)
        elif dr <= rc[2] * 1.03 and dr < df:
            groups['wheelR'].append(f)
        else:
            groups['frame'].append(f)
    return groups, fc, rc


def reindex(verts, faces):
    """Compact a face list down to only the vertices it uses."""
    m = {}
    out_v, out_f = [], []
    for f in faces:
        tri = []
        for i in f:
            if i not in m:
                m[i] = len(out_v)
                out_v.append(verts[i])
            tri.append(m[i])
        out_f.append(tuple(tri))
    return out_v, out_f


def write_glb_multi(path, parts, mat_defs):
    """parts: [(name, verts, nors, faces, materialIndex, origin)]"""
    buf = b''
    views, accs, meshes, nodes = [], [], [], []
    for (name, verts, nors, faces, mi, origin) in parts:
        # bake the part origin out so the game can rotate it about its axle
        vs = [(v[0] - origin[0], v[1] - origin[1], v[2] - origin[2]) for v in verts]
        pos = b''.join(struct.pack('<3f', *v) for v in vs)
        nrm = b''.join(struct.pack('<3f', *n) for n in nors)
        use32 = len(vs) > 65535
        idx = b''.join(struct.pack('<3I' if use32 else '<3H', *f) for f in faces)
        while len(idx) % 4:
            idx += b'\x00'
        p0, n0, i0 = len(buf), len(buf) + len(pos), len(buf) + len(pos) + len(nrm)
        buf += pos + nrm + idx
        xs = [v[0] for v in vs]; ys = [v[1] for v in vs]; zs = [v[2] for v in vs]
        b0 = len(views)
        views += [
            {"buffer": 0, "byteOffset": p0, "byteLength": len(pos), "target": 34962},
            {"buffer": 0, "byteOffset": n0, "byteLength": len(nrm), "target": 34962},
            {"buffer": 0, "byteOffset": i0, "byteLength": len(idx), "target": 34963},
        ]
        a0 = len(accs)
        accs += [
            {"bufferView": b0, "componentType": 5126, "count": len(vs), "type": "VEC3",
             "min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]},
            {"bufferView": b0 + 1, "componentType": 5126, "count": len(vs), "type": "VEC3"},
            {"bufferView": b0 + 2, "componentType": 5125 if use32 else 5123,
             "count": len(faces) * 3, "type": "SCALAR"},
        ]
        meshes.append({"name": name, "primitives": [
            {"attributes": {"POSITION": a0, "NORMAL": a0 + 1}, "indices": a0 + 2, "material": mi}]})
        nodes.append({"mesh": len(meshes) - 1, "name": name, "translation": list(origin)})

    gltf = {
        "asset": {"version": "2.0", "generator": "e-ride obj2glb/segment"},
        "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes, "meshes": meshes, "materials": mat_defs,
        "buffers": [{"byteLength": len(buf)}],
        "bufferViews": views, "accessors": accs,
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
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--cells', type=int, default=130)
    ap.add_argument('--length', type=float, default=2.0)
    ap.add_argument('--axes', default='1,2,0')
    a = ap.parse_args()

    print('loading', a.src)
    verts, faces = load_obj(a.src)
    print(f'  in : {len(verts):,} verts  {len(faces):,} tris')
    verts, faces = cluster_decimate(verts, faces, a.cells)
    print(f'  dec: {len(verts):,} verts  {len(faces):,} tris')
    verts = transform(verts, a.length, [int(x) for x in a.axes.split(',')], [False] * 3)

    got = segment(verts, faces)
    if not got:
        print('  ! could not find wheels; writing a single mesh')
        sys.exit(1)
    groups, fc, rc = got

    MATS = [
        {"name": "frame", "pbrMetallicRoughness": {
            "baseColorFactor": [0.20, 0.22, 0.25, 1], "metallicFactor": 0.62, "roughnessFactor": 0.36},
         "doubleSided": True},
        {"name": "rubber", "pbrMetallicRoughness": {
            "baseColorFactor": [0.055, 0.057, 0.062, 1], "metallicFactor": 0.0, "roughnessFactor": 0.85},
         "doubleSided": True},
    ]
    parts = []
    for name, mi, origin in (('frame', 0, (0, 0, 0)),
                             ('wheelF', 1, (0.0, fc[1], fc[0])),
                             ('wheelR', 1, (0.0, rc[1], rc[0]))):
        vs, fs = reindex(verts, groups[name])
        if not fs:
            continue
        ns = smooth_normals(vs, fs)
        parts.append((name, vs, ns, fs, mi, origin))
        print(f'  {name:7s} {len(vs):>6,} verts {len(fs):>6,} tris')
    n = write_glb_multi(a.dst, parts, MATS)
    print(f'  wrote {a.dst}  {n/1024:.0f} KB')
    print(f'  wheelR front={fc[2]:.3f} rear={rc[2]:.3f} wheelbase={fc[0]-rc[0]:.3f}')
