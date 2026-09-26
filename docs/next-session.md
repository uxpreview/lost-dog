# Next session: make the walk worth walking

Playtest feedback after the rebuild: **the world is still very empty and
walking is quite boring.** This is the most important problem in the game.
Everything below is aimed at it, in priority order. Nothing here adds a
verb, UI, text or story content.

## Why it's boring (diagnosis)

1. **Nothing happens between the dog's stops.** He trots, waits, trots.
   Beats land every 60 to 90 seconds; a walking game needs something every
   15 to 25.
2. **The ground is inert.** Paths are corridors with nothing to walk
   *through*: no water to splash, no brush to push past, no ledge to scramble,
   no log to balance on (the log and plank exist but the boy just walks them).
3. **The world has no life.** Five townspeople, no animals besides pigeons
   and cats, no wind you can see, no motion at the edges of the frame.
4. **The set dressing is sparse and repetitive.** Three pine shapes, one
   shrub, bare slopes between. Nothing to look at up close.
5. **Walking pace is flat.** Same speed whether the dog just vanished round
   a bend or is sitting ten meters away.

## The plan, in order

### 1. The dog becomes a performance (biggest lever)
New node types and idle acts, all data-driven in `src/engine/dog.ts`:
- `business` nodes between waits: drinks at the river, digs, sniffs a trail
  off the path and comes back, rolls in the grass, shakes off water after
  the ford, chases a butterfly two bounds and gives up, noses a cat.
- `invite`: a play-bow and a bark when the boy is far behind, then a trot.
- `double-back`: he comes back toward the boy a few meters, checks, turns
  and goes on. (Rule 3, looking back, made physical.)
- Target: some dog beat every 15 to 25 seconds of walking.

### 2. Traversal texture (not verbs, they happen when walked into)
- Balance on the log and plank: arms out, slower, a little sway.
- Wading at the ford: splash rings at each step, slower, trousers-up pose.
- Stepping stones that he hops between.
- Pushing through tall brush and reeds (they part and spring back).
- Short ledge scrambles on the gully climb and the woods descent.
- Ducking under washing lines in the town.

### 3. Life
- Canyon: lizards that scatter off sunlit rocks as you pass, goats on the
  ledges with a bell, fish rings in the pool, dragonflies over the ford.
- Town: 20 to 30 ambient people with one idle each (sweeping, hanging
  laundry, card players at a table, a man asleep on a step, a woman at a
  window), cafe tables, a boat being mended. All react to the boy by looking.
- Woods: a deer that bolts early (golden hour only), jays, drifting seeds.
- Shore: gulls wheeling, crabs sidling, a lantern boat far out (cool light,
  never the reserved window gold).
- Wind you can see: grass and brush sway, washing flaps, pine tops move.

### 4. Density and variety
- Ground cover: grass tufts and wildflowers (yellow, violet and white only)
  scattered by rule, heavier near water and in clearings.
- More prop kinds: fig and carob trees, reed beds, boulder fields, ruined
  walls and a shrine in the canyon, terraces and beehives on the hillside,
  fishing nets and crates on the quay, a dry fountain, stone benches.
- Two or three variants of every house kind; balconies with plants; arches
  over alleys.
- Budget check after: stay under ~1M triangles per frame desktop, measure.

### 5. Pace that follows the story, not a run button
- Gait speeds up a little (authored, not player-chosen) when the dog has
  just gone out of sight, and settles when he's in view.
- Chapter walk speeds tuned up ~10 to 15 percent if playtest agrees.
- Footstep audio per surface is already in; add breath on climbs.

### 6. Discovery that fills the map
- Each chapter gets two optional spots worth finding (a framed vista, a
  hidden swimming rock, the chapel roof), and each adds its drawing to the
  end map. The map becomes a record of how the day was spent.
- Two more "town knows this dog" moments (story recommends three, one
  missable). Still owed from D46.

## How the session should measure it

- Autopilot log: seconds between beats (dog acts, reactions, traversal
  moments) per chapter. Target median under 25 s.
- One screenshot per chapter at desktop and portrait, before and after.
- Triangles and draw calls at the same nine spots as the rebuild.
- Red audit and build pass before push.

## Open questions for the human

- Is it OK to raise walking speed ~10 to 15 percent across the board?
- Should chapters get longer routes now (toward the 40 to 50 minute target)
  or only denser? Recommendation: denser first, longer later.
