# Real models

Most of E-Ride is procedural — the city, the riders, the traffic and every
machine in the catalogue are generated at boot from code. A few machines are
*real* bikes with real geometry in `models/`.

## What is in here

| File | Machine | Source |
| --- | --- | --- |
| `talaria-sting-r.glb` | Talaria Sting R MX4 | Sketchfab download, supplied by the project owner |

> **Licence check is on you.** The Talaria mesh came from a Sketchfab download
> rather than an asset library with a licence file, so this repo cannot state
> its terms. Most Sketchfab models are CC-BY (attribution required) and some
> are not redistributable at all. Before publishing this repo anywhere that
> matters, confirm the original listing's licence and either keep the credit
> below, or replace the file. Everything else in the game is original and MIT.

Credit as shipped: *Talaria Sting R MX4 — model via Sketchfab.*

## Why the pipeline exists

The download was **89 MB of ASCII OBJ, 1,109,634 triangles, no normals, no
materials and no groups** — despite being labelled "low poly". That is not
something you put on a static host, and as one welded blob nothing on it could
turn.

Two scripts in `tools/` do the conversion. Neither needs Blender or any
dependency beyond the Python standard library.

### `tools/obj2glb.py` — decimate and convert

Vertex clustering: snap every vertex to a grid, keep one representative per
cell (the centroid of what landed in it), drop faces whose corners collapse
together. Then rebuild smooth normals, re-orient to the game's axes (+Y up,
+Z forward), scale so the machine is its real-world length, sit it on y=0, and
write a binary glTF.

```bash
python tools/obj2glb.py in.obj out.glb --cells 130 --length 2.08 --axes 1,2,0
```

### `tools/segment_bike.py` — split off the wheels

A welded bike cannot spin a wheel or steer. This finds the two axles by
fitting a circle to the low geometry at each end, then assigns every triangle
to `frame`, `wheelF` or `wheelR` by which axle its centroid orbits, and writes
a GLB with three named meshes and their origins baked to the axles.

One wrinkle worth knowing: the circle fit latches onto the **hub and brake
disc**, not the tyre, and under-reads the radius by about a third. A wheel
that touches the ground has a radius equal to its axle height, which is exact
and needs no fitting — so the fit is only used for the centre.

```bash
python tools/segment_bike.py in.obj out.glb --cells 130 --length 2.08
```

Result for the Talaria: **1.1 M triangles → 36,450**, 89 MB → 676 KB, split
into frame / front wheel / rear wheel, with a measured 1.35 m wheelbase
against the manufacturer's 1.38 m.

## Adding another real bike

1. Convert it with `segment_bike.py`, into `models/`.
2. Add an entry to `REAL_MODELS` in `src/vehicle/glbmodels.js` with the axle
   positions the converter printed, plus seat and bar points.
3. Add a frame part in `src/vehicle/parts.js` carrying
   `realModel: '<your-id>'`, and a preset that uses it.

`buildVehicleModel()` wraps the glb so it exposes the same rig as a procedural
bike — tilt / body / steer / fork / wheels / riders — so leaning, wheelies and
every animation keep working with no further changes. If the file is missing
or fails to load, the procedural bike is used instead and the game carries on.
