# Art direction: The Long Way Home

Draft 2. Supersedes the ink direction entirely.

Full color, flat-shaded, one continuous Mediterranean day. The look is built
from three commitments: color is the clock, red belongs to the dog, and every
technique choice must be survivable by one person.

---

## Rule one: red belongs to the dog

**No red exists anywhere in the world except the collar.** [LOAD-BEARING]

Nothing in any palette, texture, prop, or lighting state may sit in red's hue
band, roughly hue 350 through 15. Terracotta roofs are burnt orange and stay
clearly orange. Sunset is gold, never crimson. Flowers are yellow, violet,
white. The market has no tomatoes on display. This sounds absurd at the prop
level and that is the level at which the rule dies if nobody enforces it.

The payoff: in every frame that contains the dog, the eye goes to the collar
first, involuntarily. The search mechanic gets a visual engine for free. One
undisciplined red awning in the town breaks it for the whole game.

Collar red: `#D0342C`. It appears in exactly one other form, the dotted route
line, which is drawn in the collar's color: on the route map, and in the
wordmark on the title and last screen (D62). That is deliberate: the route is
him.

---

## Rule two: color is the clock

Each chapter is a time of day and owns a palette. The player always knows where
they are in the story by light alone. No palette borrows from another chapter.

### Chapter 1, The Canyon. Morning.
Cool, clean, hopeful. Long soft shadows.
- Sky `#CFE3E0` warming toward `#F2DFAE` at the rim
- Limestone `#E3C08C`, shadow side `#9DA9A2`
- River `#4E8F86`
- Pine `#4E6E58`
- Path and gravel `#EFE3C8`

### Chapter 2, The Old Town. Hard noon.
The brightest and highest-contrast chapter. White stone, ink-dark shade, the
harbor a saturated tea. Shade is a place here, not a rendering detail: noon
alleys read as pools of cool dark you walk through.
- Stone in sun `#F2E8D3`, stone in shade `#5E6672`
- Roofs `#C4763F`, aged to `#B08050`
- Harbor `#2E7F8C`
- Shutters and doors `#5C6E54`, `#77828C`
- Market awnings in ochre and cream only

### Chapter 3, The Woods. Golden hour into dusk.
The only chapter whose palette moves during play. Three keyed states blended
along the route, amber to violet to true dusk. The chapter starts warmer than
noon and ends darker than night, because chapter 4's moon will lift the world
back up. That dip is the emotional shape rendered as lighting.
- State one: light `#E8A45C`, pine `#6E7248`, shadow `#7A5A3C`
- State two: light `#C98E6E`, pine `#4A5546`, shadow `#4E4A66`
- State three: ambient `#3E4258`, silhouetted pine `#2C3436`, sky ember `#8C6E5A`

### Chapter 4, The Shore. Night.
Indigo and silver, generous moonlight, everything soft-edged and legible. Night
here is kind. The darkest values in the game already happened in the woods.
- Sky `#2B3A55`, horizon `#3E5570`
- Moonlit water `#7A93A6` with highlights `#C9D4DC`
- Pebbles and sand `#8C8474`
- The lit windows of home `#F2B950`, the warmest value in the entire game,
  reserved for the final image and never used before it

---

## Technique constraints

These exist because one person is building this. Every one of them is also an
aesthetic position, which is what makes them constraints rather than
compromises.

- **Low-poly geometry, flat or gradient-ramp shading.** No PBR, no image
  textures on surfaces except a handful of hand-painted decals (pawprints,
  signage-free market clutter, the map). Color comes from vertex colors and
  ramps, which makes palette changes a data edit rather than a re-texture.
- **One directional light plus ambient, per chapter state.** Baked or cheap.
  No dynamic shadows except the character blob shadows carried over from the
  original design, plus soft contact darkening where things meet ground.
- **Fog is a color tool, not a distance-hider.** Each palette includes its fog
  color, and fog is how the coast, the far walls, and depth of the town are
  suggested without geometry.
- **Silhouette first.** Everything identifiable by outline alone. Flat shading
  exposes bad forms, so form is where the modeling effort goes.
- **A single grain pass, barely there,** carried over from the ink direction.
  It keeps flat color from feeling like vector art.
- **No outline shader.** Flat color plus toon outlines is the most common
  cheap-3D look in the genre and it drags the game toward the asset-store
  neighborhood this project needs to stay out of.

---

## The boy

Small, rounded forms, big head, sturdy legs, roughly three heads tall. Faceless
or near-faceless [OPEN], recommend eyes only, no mouth. Clothing in chapter-
neutral colors that survive all four palettes: faded blue shirt `#3E6E8E`,
earth shorts `#8A5A3B`.

The animation carries the story. The walk starts the day light and gets tired
by the woods, visibly, a heavier gait and a slower turn, then recovers to
something calmer than the start for the beach. Three gait states, blended by
chapter, not by player input. He never runs on demand: pace is authored,
because the day has a shape and the player does not set its tempo.

## The dog

Compact, pointed ears, tail with real language. Coat `#E5D5BC` with white
points, so he reads against every palette including night. The collar as
specified. The tail and the look-back are the two most animated things in the
game, and the look-back needs at least three variants so the pattern reads as
behavior rather than a loop.

In the dark his eyes catch light. The end of chapter 3, dusk gone to true
dark, depends on this one detail, and it carries into the night of chapter 4.

---

## Footprints and pawprints

Prints in dust, sand, and gravel only, surface-dependent, the boy's fading in
about 20 seconds, the dog's holding about twice as long because they are the
trail the game is asking the player to read. Exact lifetimes are owned by
`docs/game-design.md`; this document owns only how they look. In the town's stone streets there are no prints, which is exactly why
chapter 2's tracking shifts to knocked-over things and witnesses.

---

## The route map

Hand-drawn paper map of the coast, illustrated in the game's own palette but
flattened, as if the boy drew it later. The dotted route line in collar red.
Landmarks appear on it only if the player actually passed them. No icons, no
legend, no numbers.

---

## Typography

One rounded, warm display face for the title and chapter cards, one utility
face for the menu. Chapter cards are the place names only, held over the first
seconds of the chapter's light: The Canyon, The Old Town, The Woods, The Shore.

---

## What to avoid

- Any red outside the collar and the route line
- Toon outlines, cel highlights, anime grammar
- The single-golden-hour-forever look that flattens the cozy genre
- Photo-real water, which would break the material world instantly
- Peril lighting. Chapter 3 gets dark, it never gets horror-graded
- Asset-store props. Every object modeled for this game, in this game's forms
