# The Long Way Home

A browser-based narrative walking game. A boy chases his dog across one day on
the Dalmatian coast, canyon to old town to woods to shore, and learns at his
own front gate that the dog was leading him home the whole time.

Full color, flat-shaded, one continuous day where color is the clock.
Target: 40 to 50 minutes, four chapters, desktop and mobile. Current build:
the whole day plays end to end in about 15 to 20 minutes (see D41).

## Source of truth

Read these before writing code. They outrank your own judgment.

| Document | Governs |
|---|---|
| `docs/story.md` | Narrative, the four rules of the dog, chapters, what is never stated |
| `docs/game-design.md` | Verbs, the whistle, the dog actor, tracking, camera, manifest schema |
| `docs/art-direction.md` | Every visual decision, palettes, the red rule |
| `docs/quality-bar.md` | Budgets, the red audit (gates superseded by D47) |
| `docs/decisions.md` | Rulings, including the rebuild (D41 onward) |

## Laws of the project

**Red belongs to the dog.** No red anywhere in the game except the collar and
the dotted route line (on the map, and in the wordmark, which is the same
line; see D62). This is enforced by an automated audit and it is not
negotiable at any prop, texture or lighting level. UI takes the color from
`COLLAR` in `palette.ts`, never a literal.

**The dog is never in peril.** No system in this game can harm him, and no
moment may imply harm. He waits at danger until the boy is through. He looks
back. He is never fleeing.

**The dog is an actor, not an AI.** He runs an authored node route from the
chapter manifest. Do not build companion AI, pathfinding beyond the route, or
any simulation of him.

**No wayfinding UI exists.** No compass, waypoint, minimap, objective text or
quest log. The whistle's answer and the readable trail are the navigation
system. If a playtester is lost, fix the staging, never add UI.

**Do not invent story content.** No dialogue, no narration, no lore, no text in
the world. If a moment seems to need words, the spatial design is failing. Fix
the space or ask.

**Chapters are data, not code.** The engine reads JSON manifests in
`src/data/`. A new moment should be expressible as data; if it forces an
engine change, make the change general (a new node type, a new prop kind),
never a chapter special case.

**Mobile is not a port.** Every chapter completable on a touchscreen with one
thumb, in portrait, and fully comprehensible with sound off. Test at every
gate.

**Report actual numbers.** At performance gates, measure. Never assert.

**Ask before adding a verb.** The game is walk, whistle, and a rare context
action. A fourth verb is a design change requiring the human.

## Stack

Vite, React Three Fiber (as a canvas host; the engine is plain three.js),
Zustand for UI state, deployed to Vercel as a standalone app. No asset files:
every mesh, color and sound is generated at runtime from code and data. The
exceptions are presentation, not world: the display face (Fraunces, self-hosted
from `@fontsource-variable/fraunces`) and the share image and icons in
`public/`, which `tools/social.mjs` renders from the game itself.

## Where things live

| To change... | Edit |
|---|---|
| The coast itself: coastline, hills, the canyon, rivers, the road | `src/data/world.json` |
| A chapter: its route, the dog's stops, light by progress, townsfolk, framed shots | `src/data/ch1.json` .. `ch4.json` |
| Every color in the world | `src/engine/palette.ts` |
| How light, fog, haze, clouds and their shadows look | `src/engine/materials.ts` (shaders), plus `lighting` in each chapter (`clouds`, `haze`, `rays`, `bloom`, `exposure` are per key) |
| Bloom, light shafts, the grade, letterbox bars | `src/engine/post.ts`; the per-chapter grade is `grades` in `game.ts` |
| The sky: clouds, sun, moon, stars | the sky shader in `src/engine/materials.ts` |
| What the dog does at each node type, and his asides | `src/engine/dog.ts` |
| Critters, small effects (dust, drops, water rings) | `src/engine/life.ts`, plus `life` in each chapter |
| The town's ambient people and their idles | `ambient` in `ch2.json`; idles in `src/engine/characters.ts` |
| Props (pines, houses, boats, the bell tower) | `src/engine/kit.ts` |
| Where trees, ground cover and houses get placed | `src/engine/dress.ts` |
| Camera (follow, rest, the town boom), whistle, chapter flow | `src/engine/game.ts` (`updateCamera`) |
| The ending's three shots and the walk in | `updateCut` in `src/engine/game.ts`; the garden is data in `ch4.json` |
| Fireflies | `fireflies` in a chapter's `life`; drawn by `src/engine/fx.ts` |
| Title, loading, cards, legend, touch controls, menu, last screen | `src/hud/Hud.tsx`, `src/hud/hud.css` |
| Page title, description, share tags | `index.html`; `public/site.webmanifest` |
| The end-of-chapter map | `src/hud/MapScreen.tsx` |
| Sound | `src/engine/audio.ts` |

Coordinates: meters, x east, z south (the sea is south). Path points are
`[x, z, y, width]`; 3D positions are `[x, y, z]`; dog nodes and triggers are
plan `[x, z]` / `[x, z, radius]`. Light keyframes are keyed to how far along
the dog's route the boy has come (0 to 1), never to clock time.

The pre-rebuild engine was deleted after the rebuild; it lives in git history
before commit 0e2da4f. `renders/` still holds its judged screenshots because
the old gate verdicts in `docs/` cite them.

## Testing

Run `npm run dev`. `?ch=0..3` jumps to a chapter. In the browser console
`__game.autopilot(seconds)` walks the boy along the dog's route in simulated
time and returns a log of the dog's modes, which is how chapter flow is checked
without playing it by hand. `__game.simulate(seconds)` advances time.
`__game.beatReport()` gives the seconds between noticeable moments since the
chapter began. `node tools/probe.mjs all <label>` (dev server running) runs
autopilot through every chapter, reports those gaps, takes one screenshot per
chapter at desktop and portrait into `renders/probe/<label>/`, and counts
triangles and draw calls at nine fixed spots.
Stills, all with the dev server running:

- `node tools/shots.mjs <dir> title 0:0.3 2:0.6:p ...` one still per spec
  (`chapter:progress`, `:p` for portrait).
- `node tools/ui.mjs <dir>` title, chapters, card, legend and menu, desktop
  and phone.
- `node tools/opening.mjs <dir>` the first half minute, played from the title.
- `node tools/ending.mjs <dir> [p]` the three shots at the gate, the map, the
  last screen.
- `node tools/peek.mjs '<js>' [ch]` ask the running game a question.
- `node tools/social.mjs` re-render `public/og.jpg` and the icons after the
  title changes.

`npm run red-audit` must pass before any push. `npm run build` must pass.

## Working rhythm

**Start here:** `docs/next-session.md` holds the prioritized plan from the
latest playtest.

Gates are retired (see `docs/decisions.md`, D41 to D47). Each session: play
the whole day, find the weakest moment, fix it, re-check the red audit and
one screenshot per chapter at desktop and portrait. Report actual numbers at
any performance claim.

## Constraints

Never scrape, download, or reproduce assets from any existing site, game or
asset store. Everything original, modeled and painted for this game's forms.
