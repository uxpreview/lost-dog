# Game design: The Long Way Home

Draft 2. Supersedes all Ahead of You mechanics entirely.

---

## Player verbs

Two, plus one context action. Adding anything is a design change, not an
implementation detail. Ask first.

### 1. Walk
The only locomotion. No run button, no jump button, no stamina. Pace is
authored, not chosen: the boy's gait is set per chapter (light in the morning,
tired by the woods, calm on the shore) and blended by chapter progress, never
by player input. The day has a shape and the player does not set its tempo.

Small vaults, ledge steps and plank crossings happen automatically when walked
into. They are traversal texture, not a verb.

### 2. Whistle
One button, always available.

Press it and the boy whistles. Half a second to a second and a half later, the
dog answers from wherever he actually is: a bark, spatialized. **Every answer
has a visual correlate at his location**, because the game must be fully
playable with sound off. Birds lifting from a tree, gulls scattering, dust from
a wall top, a gate seen swinging, and at night his eyes catching the light.
The answer gives a direction, never a marker.

Cooldown of about 3 seconds so the whistle cannot be spammed into a radar.

Per-chapter behavior, from the story bible:
- **Canyon:** answers are clean, close and honest. Teaches the loop.
- **Old Town:** barks echo off stone and arrive from plausible wrong
  directions. Implemented as authored false-direction sources per zone, not
  simulated acoustics. False sources carry their own visual correlates too
  (pigeons off the wrong roofline, a gate swinging in the wrong lane), so the
  misdirection works identically with sound off. Tracking and witnesses take
  over as the reliable signal.
- **Woods:** honest again, and the primary navigation for the chapter.
- **Shore:** the dog is beside you. Whistling makes him look up at the boy.
  Nothing else. Keep this, it is a small gift to the player.

### Context action (Enter / tap prompt)
Rare. Moving a plank, opening a gate, a handful of authored moments. The prompt
appears only in range and never instructs beyond a single glyph.

---

## The dog is an actor, not an AI

The dog is a sequenced performer on an authored route, and nothing about him is
simulated. This is the single most important implementation decision in the
game. A "real" companion AI is months of work that produces worse storytelling
than a route with good staging.

The route is a chain of nodes in the chapter manifest. Node types:

- **trot** — moves along the path, tail up, occasional look-back
- **wait** — sits or stands at the node until a condition (player proximity,
  player passed a trigger, time)
- **hazard-wait** — waits at a danger point and does not advance until the
  player is through the safety trigger. This is story rule 2 and it is load
  bearing for the twist
- **look-back** — an authored look-back with at least three animation variants
  so the pattern reads as behavior, not a loop
- **near-miss** — allows the player to close to an authored approach distance,
  plays the staged almost, then breaks away along an escape path. The approach
  distance and payoff are per-node data: chapter 1's is staged wide on the
  switchbacks (a near-miss of sight, not of touch), chapter 2's closes to
  contact with a `contact` variant, the collar touched and slipping through
  his fingers. At touch range the almost-touch animation plays. Only exists
  where the story places it
- **vanish / appear** — for transitions where he slips out of sight. He only
  teleports while fully occluded, never on screen
- **asides** (D48) — what a dog does on a walk, between the stops, never
  waiting for the boy: `business` (drink, dig, sniff off the path and back,
  roll, shake, a butterfly chase, nosing a cat), `invite` (a play-bow and a
  bark when the boy is far behind) and `double-back` (a few meters back
  toward the boy, a check, on). He does them where the boy can see, skips any
  the boy has already passed, and keeps his lead afterwards

Distance discipline: he holds roughly 20 to 45 meters ahead at trot. If the
player closes distance at a non-scripted point he advances to the next node,
timed to read as the dog moving on, never as rubber-banding. If it looks like
the game cheating, it is wrong, and the fix is staging (occlusion, bends,
timing), not speed.

He is never in danger, never cowers, never limps, and no system in this game is
capable of harming him.

---

## Tracking

The other half of wayfinding. All of it data in the manifest, all of it
diegetic. There is no compass, no waypoint, no objective text, anywhere, ever.

- **Pawprints** — spawned along his route on dust, sand and gravel surfaces
  only. Hold about 40 seconds, twice the boy's. None on town stone, which is
  why chapter 2 shifts to the other signals
- **Disturbances** — props with a knocked-over state: a crate, a stacked net,
  a broom left spinning. Placed, not physical
- **Witnesses** — town NPCs with a one-shot react: a fishmonger points an
  alley, kids run the direction he went, the old woman feeds him from her
  pocket. Nobody speaks. React triggers on player proximity, plays once,
  returns to idle
- **Glimpses** — authored sightlines where he is briefly visible: through a
  fence, across a courtyard, at the far end of an alley. The camera biases
  composition toward him whenever he is in frame

---

## Camera

Third-person follow. Fixed pitch around 18 degrees, distance about 6.5 meters,
damped, with a lead toward the direction of travel. When the dog is visible the
framing biases gently toward keeping both of them composed. No player camera
control of any kind.

Manifests may specify framed moments (the canyon opening onto the town, the
treeline breaking onto the moonlit shore) that blend in and out over about 1.5
seconds. Verify every framed moment in portrait 19.5:9 before calling it done.

---

## Controls

**Desktop:** arrows/WASD walk, **F or Space to whistle**, Enter for context
action, ESC menu. No jump, no run. Legend on first load only, glyph style,
dismisses on input.

**Mobile:** floating joystick in the lower right quadrant, appearing where the
thumb lands. **Whistle button lower left, always visible**, drawn as a small
whistle glyph. Context prompt appears center-low only in range. Menu top right.

---

## Lighting and time

Each chapter is one lighting state, except the woods, which blends three keyed
states (amber, violet, dusk) driven by route progress, not by clock time, so a
wandering player is never punished with darkness they did not choose.

Lighting states live in the manifest: sun direction, sun color, ambient color,
fog color and distances, palette LUT if used. The final shore-to-gate sequence
introduces the window-warm value that exists nowhere else in the game.

---

## The route map

The engine logs the player's position as a polyline, one sample per ~2 meters
moved, simplified. At the end of chapters 1, 2 and 4 the map screen renders the
day so far as a dotted line in collar red on the hand-drawn coast map, drawing
itself over a few seconds. Landmarks appear only if the player actually passed
them. A landmark is a named trigger volume in the manifest; entering it marks
it passed. Chapter 3 skips the map by design. No numbers on it, ever.

---

## Chapter manifest schema

Chapters are JSON. The engine reads them. No chapter-specific code.

```jsonc
{
  "id": "ch01-canyon",
  "title": "The Canyon",
  "spawn": { "position": [0, 0, 0], "facing": 90 },
  "gait": { "from": "light", "to": "light" },   // boy's gait states, blended by route progress
  "lighting": {
    "states": [
      { "id": "morning", "sunDir": [15, 30], "sun": "#F2DFAE",
        "ambient": "#CFE3E0", "fog": { "color": "#DCE8E4", "near": 40, "far": 140 } }
    ],
    "blendBy": "none"                            // "none" | "routeProgress" (the woods)
  },
  "environment": {
    "terrain": "terrain/canyon.glb",             // collision, and the grey-box look
    "artTerrain": "terrain/canyon-art.json",     // the chapter's LOOK (D19). absent -> grey box
    "surfaces": "terrain/canyon-surfaces.json",  // dust/gravel/sand regions for prints
    "props": [
      { "model": "props/fallen-pine.glb", "at": [62, 2, 14] }
    ]
  },
  "dogRoute": [
    { "type": "trot", "path": "paths/dog-ch1-a.json" },
    { "type": "hazard-wait", "at": [88, 3, 20], "safetyTrigger": "ford-crossed" },
    { "type": "look-back", "at": [120, 5, 9], "variant": "auto" },
    { "type": "near-miss", "at": [210, 12, 4], "approach": 8,
      "contact": "none", "escape": "paths/dog-ch1-b.json" }
    // near-miss: "approach" is the authored closing distance in meters;
    // "contact" is "none" or an authored variant, e.g. ch2's "collar-touch"
  ],
  "trail": {
    "pawprintSurfaces": ["dust", "gravel", "sand"],
    "disturbances": [
      // { "id": "crate-1", "prop": "props/crate.glb", "at": [0, 0, 0],
      //   "state": "knocked" }
    ],
    "witnesses": [
      // { "id": "fishmonger", "at": [0, 0, 0], "react": "point",
      //   "facing": 120, "trigger": "proximity" }
    ],
    "glimpses": [
      { "id": "switchback-view", "volume": "volumes/rim.glb", "focus": "dog" }
    ]
  },
  "whistle": {
    "mode": "honest",                            // "honest" | "misleading" | "companion"
    "falseSources": [
      // { "zone": "volumes/market.glb", "answerAt": [0, 0, 0], "cue": "pigeons" }
    ]
  },
  "triggers": [
    { "id": "ford-crossed", "shape": "box", "at": [92, 2, 20], "size": [6, 4, 10] }
  ],
  "cameras": [
    { "id": "town-reveal", "trigger": "rim-reached", "position": [230, 20, 0],
      "lookAt": [280, 8, -30] }
  ],
  "map": { "shown": true, "landmarks": ["swimming-hole", "ford", "rim"] },
  "audio": { "bed": "audio/canyon-morning.ogg", "barkSet": "audio/dog-standard" },
  "exit": { "trigger": "rim-gate", "next": "ch02-old-town" }
}
```

If a chapter needs a field this schema lacks, extend the schema for all
chapters. No one-offs.

---

## Save state

Chapter-level only. Chapter select from the menu once reached. The logged route
polylines persist per save so the final map is truthful about the whole day.
The save keeps one polyline per chapter; replaying a chapter from chapter
select overwrites that chapter's line, latest play wins, so the final map is
always one coherent day.

---

## What is deliberately absent

No run button. No compass, minimap, waypoint, objective text or quest log. No
inventory, collectibles, counters or percentages. No fail state, damage, death
or timers. No dialogue or readable text in the world. No dog peril of any kind.
No photo mode. If a feature would appear in a listicle about cozy games, it is
out unless argued in.
