# E-Ride — BETA 0.4

[![play](https://img.shields.io/badge/play-randomprojects1234.github.io%2Fe--ride-39e6a4)](https://randomprojects1234.github.io/e-ride/)
[![licence](https://img.shields.io/badge/licence-MIT-16c2ff)](LICENSE)
[![version](https://img.shields.io/badge/version-BETA%200.4-a06bff)](#versions)

**Play it: <https://randomprojects1234.github.io/e-ride/>**

A 3D open-world e-bike and e-scooter game that runs in the browser. Ride around
Volta Bay, pull wheelies, run courier jobs and ride out with friends to earn
cash — then build, tune and sell machines from a parts catalogue that runs from
a 250 W commuter hub motor to a 900 kW reactor-fed shaft drive.

Three.js, no build step, no bundler. The client is a folder of static files and
drops straight onto GitHub Pages; multiplayer needs a small Node relay you host
yourself.

---

## Run it

**Client (single player, everything except multiplayer):**

```bash
python serve.py 3495
```

Then open <http://localhost:3495>. Any static file server works — there is
nothing to compile.

**Multiplayer:** nothing to run. Open the in-game **Multiplayer** panel, hit
*Open a room*, and send your friends the five-character code.

On Windows, `Start E-Ride.bat` starts the client and opens the game.

---

## Controls

| Action | Default | Notes |
| --- | --- | --- |
| Throttle / brake | `W` / `S` | `S` reverses at a standstill |
| Steer | `A` / `D` | |
| **Wheelie** | hold `Shift` + throttle | throttle sets how high; `S` or `C` brings it down |
| Handbrake | `Space` | |
| Sprint boost | `Q` | uses peak power, drains the pack |
| Interact / mount | `E` | glowing rings, and other players' spare seats |
| Dismount | `F` | |
| Reset | `R` | |
| **Look around** | hold **right mouse** + drag | Roblox-style: swings the camera round you. Two-finger drag on touch |
| Zoom | scroll wheel | all the way in goes first-person |
| Camera | `V` | cycles chase / close / far / first-person / orbit — or re-centres, if you have been looking around |
| Garage · Store · Jobs · Map | `G` · `T` · `J` · `M` | |
| Player list · Chat | `Tab` · `Enter` | |
| Suggestion box | `F1` | file a bug or an idea |
| Menu | `Esc` | |

Everything is rebindable in **Settings → Controls** (primary + alternate, mouse
buttons included). Gamepads work. On phones and tablets an on-screen stick and
button cluster appear automatically — handedness is switchable in Settings.

---

## Riding

**Wheelies pay.** Hold `Shift` and feed in throttle: the throttle position sets
the angle you are asking for, and the bike tracks it with whatever authority the
build gives it. Sit near the balance point and the score multiplier climbs;
go past it and the bike starts to wobble and your ability to save it fades.
Loop it and you lose the combo.

Points bank a few seconds after you touch down, and convert to cash. Air time,
wheelie-into-air links and long-distance wheelies all stack the multiplier.

**Free roam pays too** — a small trickle per distance, more when you are fast,
lofted, or riding near other players (the ride-out bonus).

**The camera** works like Roblox: hold right mouse and drag to swing it around
yourself, scroll to zoom, and scroll all the way in for first person. The angle
you pick is kept as an offset from straight-behind, so the camera still comes
round with you through corners instead of leaving you staring at a wall. `V`
puts it back.

**The city rides back.** Cars and vans drive the road network and pedestrians
walk the pavements. Squeezing past a car at speed scores a **near miss**;
hitting one hurts and makes you interesting to the police.

**Heat and pursuit.** Speeding, pavement riding, wheelies down a public street
and jumping over traffic all build heat. Past a threshold the police turn up —
four wanted levels, more units at each. Put 165 m between you and them and hold
it for seven seconds and you lose them, and the longer the chase ran the bigger
the payout. Get caught while barely moving and you are fined.

**120 energy cells** are hidden across Volta Bay — a one-time collect each,
saved to your game. Boost gates on the fast roads respawn and are worth a kick
of speed and a combo tick.

**Charging.** Every glowing ring is a charge point. Stop on one and the pack
refills. Range is a real stat, so a 2 kWh pack on a 900 kW motor will not get
you far.

---

## Building

A vehicle is ten slots: frame, motor, battery, controller, tyres, brakes,
suspension, cockpit, aero and paint. The compatibility rules are loosely modelled
on real e-bike engineering, and the builder tells you exactly how a bad
combination will fail:

- the motor's **mount type** has to be one the frame accepts (rear hub, mid-drive,
  dual hub, scooter hub, direct shaft)
- the pack **voltage** has to sit inside both the motor's and the controller's
  window — too low and it barely turns, too high and the windings cook
- the pack has to **fit the battery bay** (Wh capacity stands in for volume)
- the **controller current** feeds the motor: too little and you are derated by
  exactly that fraction, and a pack that cannot supply the controller sags,
  overheats and eventually vents
- **tyres** must match the rim size and fit the frame's clearance, and their
  **speed rating is a hard cap** — build past it and every fast run risks a blowout
- the frame has a **structural power rating** and a **load rating**

Derived performance is computed from the physics, not from a table: top speed
solves `P = ½ρ·CdA·v³ + Crr·m·g·v` against the mechanical limit from motor rpm
(which scales with pack voltage, so a higher-voltage pack really does raise the
ceiling) and the tyre rating, whichever bites first.

The catalogue runs from a $120 250 W hub motor up to the $980,000 Chernov RD-900
"Meltdown". Around 300 mph is the practical ceiling — not because of a speed
limiter, but because that is where the best tyre anyone has certified gives up.

---

## Earning

- **Courier runs** — pick up, deliver, sometimes against a clock
- **Checkpoint dashes** — hit them in order before time runs out
- **Wheelie contracts** — hold one for 6 to 22 seconds
- **Speed traps** — get a build to 35 / 70 / 140 / 250 mph
- **Sightseeing loops** — no timer, just go and look at the place
- **Trick jams** — bank points at Amp Bowl or the Cell Works yard
- **Ride-outs** — cash per minute for riding near other players

Job rewards scale with your total earnings, so the board stays worth reading
once you own a hyperbike.

**The Swap Meet** is the marketplace. Buy machines other riders threw together —
some are bargains, some do not run — and list your own builds. Price near fair
value and they sell quickly; get greedy and they sit there collecting views and
lowball offers.

---

## Multiplayer

**There is no server.** One player picks *Open a room* and gets a
five-character code like `K7WQZ`; everyone else types it in, or opens the
invite link. The connection is peer-to-peer over WebRTC — PeerJS's public
broker is used only to introduce the two browsers to each other, and no game
traffic passes through it.

The host's browser runs the room itself (`src/net/room.js`): membership,
colour assignment, the driver/passenger pairing and the 15 Hz state fan-out.
That is the same room logic the old Node relay ran, lifted out and made
transport-agnostic, so the protocol is unchanged and either transport can
drive it.

Up to six riders in a world, with positions, wheelie angle and lean synced at
15 Hz and interpolated on the way in. Two-seat frames can carry a passenger:
pull alongside someone with a spare seat and press `E`. They drive, you ride
along, and your own bike is stowed until you hop off. The host owns the
pairing, so both clients always agree on who is carrying whom.

A client that loses track of a peer — a backgrounded tab stops rendering and
times its peers out — re-announces itself and is sent the full picture again,
so it recovers instead of staying blind.

Keep the host's tab open: close it and the room goes with it. `server/` still
holds the old WebSocket relay if you would rather run a dedicated one.

---

## Suggestion box

`F1` in game, or the button on the main menu. Players file bugs, ideas, balance
complaints and polish notes; each report carries the version, where you were,
what you were riding and the frame rate.

- With the dev server running, reports POST to `/__feedback`, land in
  `feedback/inbox.json` and regenerate `SUGGESTIONS.md`.
- On GitHub Pages there is no backend, so reports queue locally and the player
  gets a "copy this" button and a pre-filled GitHub issue link.

The **Inbox** tab is the review queue: approve the ones worth building and they
become the to-do list on the **Roadmap** tab and at the top of `SUGGESTIONS.md`.

---

## Hosting the client on GitHub Pages

Push the contents of this folder (minus `server/`, which is not needed by the
client) to a repo and turn Pages on. There is no build step. `three.js` loads
from a pinned jsDelivr URL via an import map, so the only requirement is that
the files are served over HTTP(S).

Multiplayer needs no extra setup on Pages — WebRTC works from an HTTPS origin,
which is what Pages serves.

---

## Versions

The scheme is `BETA 0.1` … `BETA 0.9`, then `MAIN 1.0` … `MAIN 1.9`, then
`MAIN 2.0` and on. Major `0` is the beta line; every major after it is a main
release. The minor runs 1–9 and carries into the next major.

`src/core/version.js` is the only place the number lives — everything else
(menu, suggestion box, bug reports) reads it from there. To cut a release,
change `MAJOR`/`MINOR` in that file; `nextVersion()` already knows that 0.9 is
followed by 1.0.

| | |
| --- | --- |
| **BETA 0.4** | a graphics pass — textured facades, environment reflections, rebuilt vehicle and character models |
| **BETA 0.3** | multiplayer with no server — host a room, share a five-character code |
| **BETA 0.2** | traffic, pedestrians, near misses, police pursuit, 120 collectible cells, boost gates, slow-mo on big air — and e-scooters can wheelie now |
| **BETA 0.1** | first public build — the whole of Volta Bay, 13 machines, the parts system, jobs, tricks, multiplayer, the suggestion box |

What lands in BETA 0.2 is whatever gets approved in the suggestion box.

---

## Licence

MIT — see [LICENSE](LICENSE). Do what you like with it.

---

## Layout

```
index.html            import map + all the UI containers
css/style.css
src/
  core/     engine, input (rebindable), settings, procedural audio, helpers
  world/    layout data, heightfield, terrain, roads, ramps, props, POIs
  vehicle/  parts catalogue, compatibility + derived stats, ride physics, models
  game/     player, camera, tricks, quests, economy, effects, feedback, trailer
  ui/       HUD, menus, garage/builder, store, marketplace, jobs, map, touch, multiplayer
  net/      WebSocket client
server/     Node relay (ws), 6 players per room
serve.py    dev server + capture/feedback endpoints
```

Nothing is generated or minified — every file in `src/` is the source.

---

## Graphics

Everything is generated at boot — there are no downloaded assets, no texture
files and nothing to 404, which is what keeps the game a folder of files you
can drop on a static host.

- **Facades** are canvas-drawn and tileable, one tile per floor by one bay
  wide. Walls are UV'd in units of bays and floors, so the texture lands at a
  believable scale whatever size the building is. Four glazing tints, plus
  concrete, brick and corrugated steel, each its own mesh and material.
- **The environment map** is a PMREM-filtered sky built from the same gradient
  the sky uses, with the sun placed from the actual light direction. Without
  one, every metal and glass surface has nothing to reflect and reads as flat
  paint — it is most of the difference between "untextured boxes" and a city.
- **Vehicles** are swept profiles rather than stacked boxes: a profile is
  extruded along a set of sections so the silhouette gets a sloped bonnet, a
  raked screen and a tapered tail.
- **Shadows** use a 85 m frustum instead of 130 m over the same map size,
  which is what actually makes them crisp — the wider frustum was spending
  most of its texels on ground the player never looks at.

---

## Notes on the world

Volta Bay is 2.4 km square. The terrain is a baked heightfield: broad noise for
the landscape, districts that flatten where the city is, a ridge to the east and
a bay to the south. Roads are hand-authored splines that get graded — smoothed,
gradient-limited, reconciled with each other at junctions and clamped so they
hug the land instead of flying over it — and then burned into the heightfield so
physics and the visible mesh can never disagree. Ramps, bowls and plinths are
analytic surfaces layered on top; their meshes are generated by sampling the
same ground function the bike reads, for the same reason.
