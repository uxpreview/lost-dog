# Decision log: The Long Way Home

Rulings on contradictions and gaps found by the Session 0 comprehension check,
resolved 2026-08-27 with Ryan's authorization ("proceed with whatever you
recommend"). Each ruling has been edited into the governing doc; this file is
the record of what changed and why. Creative **[OPEN]** items in `story.md`
(boy's face, count of "town knows this dog" moments, narration, the dog's
name, the door at the end) remain open and are Ryan's to decide.

---

## D1 — The near-miss node is parameterized, not fixed at one meter

`story.md` staged near-miss #1 wide (the switchback sighting) while
`game-design.md` defined the node as closing to ~1 m with an almost-touch;
near-miss #2 involves an actual collar touch, which "almost-touch" could not
produce. **Ruling:** the node takes an authored `approach` distance and an
optional `contact` variant. Chapter 1: wide approach, no contact. Chapter 2:
contact, `collar-touch`. The Gate 1 "reads as almost, never as cheating" test
applies to the node as authored for chapter 1. Edited: `game-design.md` node
list and manifest schema.

## D2 — Chapter 3 light is driven by route progress, not clock time

`story.md` said "real time," `game-design.md` said route progress with an
explicit rationale (wanderers must not be punished with unchosen darkness).
**Ruling:** route progress wins; the rationale is design, "real time" was
prose. Edited: `story.md` chapter 3.

## D3 — The map line is the boy's walked path; the reveal still belongs to the dog

The engine logs the player's polyline, but the ending needs the line to read
as the dog's plan. **Ruling:** both are true and the docs now say so: the
required path is the dog's route, so the line's spine is his even with the
player's wandering drawn as texture on top. Edited: `story.md` route map
section.

## D4 — The red audit threshold is defined

"Meaningful saturation" is now: hue 350–15, saturation ≥ 25%, value ≥ 20%,
HSV, with a whitelist of exactly two asset ids (collar material, map route
line). Edited: `quality-bar.md`.

## D5 — The controls paragraph's drafting noise is removed

The "…no. Final:" self-argument in `game-design.md` is gone; only the final
mapping remains (arrows/WASD, F or Space whistle, Enter context, ESC menu).

## D6 — game-design.md owns gameplay constants

Print lifetimes appear in two docs. They agree today; to prevent drift,
`game-design.md` is the source of truth for durations and all gameplay
numbers, `art-direction.md` owns how things look. Edited: `art-direction.md`
prints section.

## D7 — False whistle sources mislead with sound off too

Chapter 2's false-direction answers get their own visual correlates (pigeons
off the wrong roofline, a gate swinging in the wrong lane), so the sound-off
game is the same game. Edited: `game-design.md` Old Town bullet.

## D8 — Chapter replay overwrites that chapter's logged line

One polyline per chapter per save; latest play wins; the final map is always
one coherent day. Edited: `game-design.md` save state.

## D9 — A landmark is a named trigger volume

Entering it marks it passed for the map. Edited: `game-design.md` route map
section.

## D10 — The eye-shine detail is pinned to the right time

"At night… chapter 3" is now "in the dark at the end of chapter 3, carrying
into chapter 4." Edited: `art-direction.md`.

## D11 — The manifest schema now sketches its missing shapes

`gait`, `blendBy` values, `environment.surfaces`, and commented example shapes
for `disturbances`, `witnesses`, `falseSources`, and near-miss parameters.
These are sketches to be firmed at first use, schema-wide per the no-one-offs
rule. Edited: `game-design.md` schema.

## D12 — The reference phone is named

iPhone 11 / Pixel 3a stand in for "mid-range 2019-class." Edited:
`quality-bar.md` budget table.

## D13 — Chapter timings are critical path

The ~36-minute chapter sum plus wandering is the 40–50 target. Edited:
`story.md`.

## D14 — Owed, not yet ruled (flagged for the human, no doc edits)

- **Colorblindness:** the collar-red search cue is hue-dependent. Mitigations
  already in the design: the dog's light coat with white points, motion, and
  eye-shine. Recommend an explicit colorblind playtest at Gate 5 before
  deciding whether anything more is needed.
- **Blob shadows / print art:** both reference the superseded ink-direction
  doc, which is not in this repo. Their visual spec gets defined at first
  implementation (Gates 2–3) and recorded here.
- **Audio direction:** no doc exists. Sound is half the navigation system;
  an audio page (bark sets, beds, spatialization, the 0.5–1.5 s answer
  timing) should be written before Gate 5.

---

Gate 2 rulings, 2026-08-27. D14 left the blob shadows and the print art without
a visual spec because the spec they referenced lived in the superseded ink
direction. Both are now defined, along with the character colours and the
shading model art-direction.md implies but does not pin down.

## D15 — The boy's palette outside the two documented garments

`art-direction.md` names the shirt (`#3E6E8E`) and the shorts (`#8A5A3B`) and
nothing else, but a boy needs skin, hair and shoes to exist. **Ruling:** skin
`#D6A57A`, hair `#3E332C`, eyes `#2E2A26`, shoes `#6B5B4A`. All four sit in the
warm-neutral band the two documented garments already imply, none is within
forty degrees of red's hue band, and each survives all four chapter palettes,
which is the stated test for his clothing. The face is built to the document's
own recommendation — eyes only, no mouth — and that item stays **[OPEN]** and
Ryan's to overrule. Recorded in `src/art/palette.ts`.

## D15b — The derived palette is kept as small as the document allows

Gate 2's first passes invented a colour wherever the world needed one: sand at
the swimming hole, scree at the wall feet, a roof colour for the town. Between
them the invented values were occupying more of the frame than the two hexes
`art-direction.md` actually names, which is how a documented palette quietly
becomes a suggestion. **Ruling:** a talus slope is broken limestone, a sand
bar is the same pale gravel the path is, and wet stone is limestone that is
wet — so `scree`, `sand` and `wetstone` are gone. Those surfaces render
`#E3C08C` and `#EFE3C8`, wet stone as the limestone hex under a flat 0.78
multiplier, because a material in a different state does not need a palette
entry of its own. Every stone and ground surface in Chapter 1 is now one of
the three hexes the document names for them. What remains derived is only what
the documented five genuinely cannot say: dead wood, canyon scrub, two river
depths, and the town's stone and roofs seen from across the valley. Each is recorded in `src/art/palette.ts` and each is a
candidate for the human to either bless or replace with a documented value —
see the open item at the end of this file.

## D16 — Ramp shading, and what "the palette applied exactly" means

`art-direction.md` asks for "flat or gradient-ramp shading" and one directional
light plus ambient, but does not say what a surface's colour does as it turns
away from the sun. **Ruling:** every material in the game is shaded by one
two-stop ramp. A surface facing the key light renders its palette hex exactly;
a surface facing away renders that hex slid toward the chapter's documented
shadow-side colour by a per-material amount. Limestone slides the whole way,
because the document names its shadow (`#9DA9A2`) exactly; ground, foliage,
water and the characters keep most of their own hue so the chapter reads as one
light rather than as two palettes.

Nothing brightens past the documented value and nothing darkens past the
documented shade, which is what makes "the palette applied exactly as
documented" checkable rather than aspirational. Tone mapping is off and output
is sRGB for the same reason: a documented hex must survive to the pixel.

The ramp is continuous. No terminator step, no rim light, no cel band, no
outline pass anywhere in the codebase.

**Fog is the sky.** Each palette's fog colour is not a constant but the sky
gradient evaluated along the view ray, so anything that fades out fades into
precisely the sky behind it. Distance below the rim line gathers extra haze, so
the town reads as *below and far* rather than merely far.

**Terrain shadows are baked, not mapped.** The cross-sections are rasterised
into a coarse heightfield at load and each point is marched toward the sun;
three rays a few degrees apart give the soft edge. This is what makes "long
soft shadows" true of the world and not only of the characters, at no per-frame
cost and with no shadow map. A terrain shadow takes a surface most of the way
to its shade value, never all the way: canyon floor in shadow is still
limestone dust under a whole sky.

## D17 — Blob shadows (closes half of D14)

An ellipse on the ground under the character, and it is a *multiply*, not paint:
it darkens whatever surface it lands on and keeps that surface's hue.

- Painted in the chapter's documented shadow-side colour, never in black. A
  shadow belongs to the palette like everything else.
- Solid to 45% of the radius, then a smooth falloff to nothing at the rim.
- Sized to the character's ground footprint x 1.35.
- Stretched along the sun's ground bearing by `1 + 1.1 * cot(elevation)`, capped
  at 2.4x, and pushed away from the sun by exactly the length the stretch added,
  so the near end stays under the feet. A blob that translates as a whole reads
  as a second object lying on the ground.
- Core strength 0.55 for the boy, 0.50 for the dog.
- No blob at all where the terrain shadow already covers the character: there is
  no sun there to cast one.

The stretch is the point. At Chapter 1's morning sun this produces the long soft
shadows the palette section promises, from the ground up, with no shadow map
anywhere in the game.

## D18 — Print art (closes the other half of D14)

Hand-drawn alpha decals, which `art-direction.md` allows as one of its handful of
painted textures. Drawn procedurally so they are original to this game and so a
surface change is a parameter rather than a re-export. Like the blob shadows they
multiply, which is why a print on pale gravel and a print on wet stone are
recognisably the same print in two different materials.

- **Dog:** four toe ovals splayed around a larger heel pad, about 11 cm across,
  strength 0.42.
- **Boy:** a rounded sole — ball, heel, and a fainter waist between them, about
  15 cm long, strength 0.26.
- Both tinted with the chapter's shadow-side value. No outline, no second hue.
- The dog's are the darker of the two on purpose. They are the trail the game is
  asking the player to read, and the boy's must never compete with them.
- Prints fade by losing strength and shrinking, never by turning grey. Lifetimes
  stay owned by `game-design.md` per D6; this rules only on how they look.

## D19 — `environment.artTerrain`, a schema extension for all chapters

Gate 2 needs somewhere to put the look of a chapter without disturbing the
collision and staging Gate 1 signed off. **Ruling:** the manifest gains
`environment.artTerrain`, a sibling of `environment.terrain`. `terrain` stays
what it was — the block list the engine builds collision from. `artTerrain` is
the chapter's cross-sections, water reaches, scatter and what lies past the
horizon. A chapter without the field renders as a grey box, which is what keeps
the Gate 1 build alive as a debugging view (`?greybox` is not needed; simply
omitting the field is the switch). Per the no-one-offs rule this is a schema
change for all four chapters, edited into `game-design.md`.

The engine lofts a cross-section along a centerline and stamps a small library
of primitives. It knows nothing about canyons: where the canyon goes, how wide
it is, how deep, and what stands beside it are all chapter data, emitted by
`tools/build-ch01.mjs` from the same leg list the grey box came from.

## D20 — Chapter 1's key light is azimuth +15, elevation 30

`art-direction.md` specifies Chapter 1's palette and "long soft shadows" but no
sun position; Gate 1's manifest carried a placeholder. **Ruling:** azimuth +15,
elevation 30 degrees, and both numbers are load-bearing.

(This entry first said +40. The value that shipped is +15, and the entry was
wrong rather than the code: fifteen degrees is what puts the sun near enough to
the canyon's axis that it still reaches down between the walls. Corrected here
rather than left as a second source of truth.)

Elevation 30 is where light clears the far terrace and reaches the canyon floor
at this canyon's proportions. Below it the whole chapter plays in shade and the
documented path value `#EFE3C8` never once appears on screen; well above it the
shadows stop being long.

The azimuth puts the sun over the low terraced bank rather than over the tall
wall. From the other side nothing on the floor is ever lit, because a
twenty-three metre cliff four metres away blocks any morning sun there is. From
this side the tall wall's inward face takes the light, the terrace and the river
sit in cool shade, and the wall throws its shadow the long way down the floor.

The far bank is a terrace rather than a second cliff for the same reason, and
because a river canyon really does cut one bank lower than the other.


## D21 — The collar holds a floor of 2.5 pixels of projected radius

`art-direction.md` spends the entire red rule on one object and states the
payoff: "in every frame that contains the dog, the eye goes to the collar first,
involuntarily." Modelled at a plausible 3.5 cm on a dog 60 cm tall, the collar
measured four to nine pixels across at the distances Chapter 1 actually stages
him at, and in a wide shot the only way to find him was to scan the frame for
red numerically. That is the search mechanic failing, not a detail being small.

**Ruling:** the collar is a BAND — an open cylinder sharing the neck's axis,
with real width along it, so its silhouette is a ring from every angle including
from behind, which is the angle the game shows most because he is ahead. And it
never projects smaller than 2.5 px of radius: the vertex shader expands it about
its own centre by whatever factor that floor requires, which is exactly 1 at any
close range. Five pixels across is the smallest thing that survives the sampler
as a coloured mark rather than as a tint on one grey pixel.

Nothing else in the game gets this. It is a screen-space cheat, and it is
justified for exactly one object because that object is the navigation system.

## D22 — Every shading channel is flat per face

`art-direction.md` asks for "low-poly geometry, flat or gradient-ramp shading"
and says "flat shading exposes bad forms, so form is where the modeling effort
goes". Through iteration 6 nothing in this scene was actually flat-shaded: the
value mottling, the baked sun shadow and the baked sky visibility were all
per-VERTEX, and a value that differs at the corners of a triangle is
interpolated across it. Measured, that produced fifteen to twenty-one thousand
unique colours per frame and a three-hundred-pixel sample of the nearest canyon
wall with no seam anywhere in it.

**Ruling:** mottle, sun occlusion and sky visibility are each evaluated once per
face and written to all of that face's vertices. A polygon renders one colour.
Three things follow and all three are accepted:

- **Faces have to be small enough to shade with.** The loft's rungs are placed
  where the canyon's shape changes, not where the shading needs them, so some
  spans were eighteen metres. Wide spans are split until nothing exceeds 1.2 m.
- **Shadow edges step at the size of the mesh.** That is the idiom, not a
  defect. The per-face sun value is box filtered over the face's own footprint
  so the step is a ramp across several faces rather than a binary flip.
- **The baked shadow is weighted by how much the face is turned toward the
  sun.** On a face already turned away the ray march is grazing — it skims the
  surface it started on, over a heightfield of two-metre cells — and what it
  returns there is noise, which under flat shading became a mosaic of tan and
  grey blocks across the near cliff.

The lit/shade ramp width also became per material. Terrain gets a narrow band,
because a wide one on a gently curving loft is an airbrush that buries the
facets. Characters keep a wider one, because a boy's head and a dog's barrel are
a dozen polygons each and a closed band cuts a hard line across the curve — the
crown becomes a hat brim and the flank becomes a saddle patch.

---

Gate 2b rulings, 2026-08-27. Four localised failures from `gate-2-verdict.md`,
plus the two palette questions the verdict handed to the human. Ryan's rulings
on the palette are recorded first, because three of the four fixes were held up
waiting on them.

## D23 — The coat and the gravel stay as documented, and so does everything else

`gate-2-verdict.md` asked whether `#E5D5BC` and `#EFE3C8` should move, given
that the honest coat-to-ground delta is 5.2% to 11.8% and the collar is what
finds the dog at range. **Ruling (Ryan): they stay.** The intent is explicit in
`art-direction.md` and the collar demonstrably carries him. Chapter 1's light
and its ground value are not to be bent around the dog.

The **print colour `#959780` is not a new hex and must not become one.** It is
what you get multiplying the documented path `#EFE3C8` by the documented shadow
`#9DA9A2` — a correct product of two documented values, which is exactly what
D18 says a print is ("both tinted with the chapter's shadow-side value", and
they multiply). It is recorded here rather than added to `palette.ts`, because
adding it would make the palette look one entry larger than the document
actually authorises.

The other six derived hexes — town roof, deadwood, scrub, the two river depths,
town stone and the sea — **stay in `palette.ts` unchanged for now**, pending an
`art-direction.md` addition proposed separately for Ryan to approve. Nothing in
this repo may edit that document ahead of that approval.

## D24 — A face's base COLOUR is flat too, and that is what the floor was missing

D22 made mottle, sun occlusion and sky visibility per-face and the canyon walls
came right, but the canyon floor did not, and nobody had asked why. The answer
was that D22 never covered the fourth channel. `MeshBuilder.quad` deliberately
painted a quad's four corners `[kA, kA, kB, kB]` — the two rungs' materials,
gradated across the face — reasoning that a hard material edge "paints a stripe
down the canyon". So any quad spanning a material change carried a gradient
across itself, and floor rungs sit close enough together that they are never
subdivided, so nearly every floor face was such a quad.

Measured: `prints-desktop.png` at y=600 ran 880 px of floor whose luminance
walked 224 to 193 to 230 with no break anywhere in it, and each face under the
near half of that row held limestone at one corner and path at the others.

**Ruling:** one material per face, chosen at the face's own midpoint. The stripe
the old comment feared is real and is answered by moving the DECISION rather
than by smearing the colour: the midpoint is offset by a smooth 3-D noise about
seven metres long, so the boundary swings between one rung and the next in long
stretches and the two materials interlock. The noise has to be long. At a
wavelength near the face size, an unsubdivided quad — whose midpoint is exactly
0.5 — turns the choice into a coin flip per face, and pale gravel against warm
limestone is thirty levels and a hue apart: the floor came out a chessboard.

## D25 — A cast-shadow ray starts clear of the surface it starts on

The wall mottle was not the wall's problem. The baked sun march began at the
surface point, and a 2 m heightfield cell containing a near-vertical cliff is as
tall as the rim — so every wall face reported itself as blocking itself.
Measured over the near wall in `vista`: 95.5% of faces turned toward the sun by
the ramp's own test, not one on its shade side, mean baked occlusion 0.87. That
is what put the documented shadow hex on 77-82% of a sunlit wall, and because
the outcome hinged on which side of a cell boundary a centroid happened to fall,
it is also what made the wall a chessboard rather than a shadow.

**Ruling:** the march starts pushed out along the horizontal part of the face's
own normal, by a full cell on a vertical face and by nothing at all on level
ground — so the canyon floor's shadows, which are cast by the walls and terraces
around it, are untouched. Mean occlusion over the same wall afterwards: 0.007.
Limestone family share on the near wall: `hero` 7.6% to 98.5%, `vista` 23.0% to
91.5%.

## D26 — The lit side keeps a little Lambert in it

Removing the false shadow exposed what it had been hiding. D16's ramp is
deliberately narrow — a surface is either turned toward the key light or it is
not — and the consequence is that everything past its upper stop renders one
IDENTICAL colour. Every face of the near wall sits between 0.09 and 0.42 in
n·sun, all of them past the stop, so the cliff came out as a single flat sheet
with 91.5% of its pixels within dE 1.8 of `#E3C08C` and no facet visible
anywhere. That is the same airbrush a wide ramp produces, arrived at from the
other end.

**Ruling:** a lit face loses a little value as it rakes away from the key light.
A surface square to the sun still renders its documented hex exactly — the half
of D16's rule that has to hold is that nothing brightens past the documented
value — and one raking across it renders a few percent under. The mottle drops
correspondingly, because a wall's form should come from its geometry and not
from a noise texture painted over it.

That noise was also not noise. Both octaves were a one-dimensional `vnoise` of a
linear combination of x, y and z, which is constant on every plane
perpendicular to its direction: a plane wave. Two of them crossing is a lattice
of parallelograms, and that lattice is what tripped the failure list's "visible
image textures". Replaced with real 3-D value noise, plus a height-keyed bedding
term on stone so a wall's variation reads as strata.

## D27 — The dog is judged in a neutral pose, on a turntable

The previous pass shipped an animal that read as a cat and the failure survived
eight iterations, because the only frame it was ever judged in was the gameplay
camera that happened to contain him: from behind and above, at 34 by 24 px, with
his head yawed 117 degrees over the collar. Silhouette is a Gate 2 item, so it
gets its own instrument. `tools/dev/dogturn.mjs` renders him at six angles
including two near-orthographic elevations, and `?dogPose=neutral` stands him
square with his head forward so the neck, the collar and the topline are all
visible at once. This is a dev affordance, not a shipped pose.

Two bugs surfaced the moment he could be seen. The limb chain tracked its own
joint positions with `+sin` where three's `rotateX` gives `-sin`, so every lower
leg was attached about six centimetres off in Z. And the neck was tilted
BACKWARD while the head was placed forward of it — the rising-part and
hanging-part rotations need opposite signs — so the neck rendered as a flat slab
lying across the chest with the skull perched on top of it rather than on the
end of it. The dog is also stood on the ground from his own bounding box now,
rather than from joint heights hand-tuned to a pose, after five centimetres of
daylight under him in the judged set.

---

# Gate 3 rulings

Made while building Gate 3. Each one is here because it changes something a
later session would otherwise have to re-derive, and each one is a number that
was measured rather than chosen.

## D28 — The anatomy is authored once and consumed twice

`buildBoy`/`buildDog` baked a pose into one merged geometry and were used only
by the art bible; the gameplay actors drove Gate 1 grey boxes. Rebuilding the
models a second time for the actors would have guaranteed the two drifted, and
nothing would have caught it.

**Ruling:** the anatomy lives in `src/art/rig.ts` as a joint list and a part
list, and comes out two ways — `buildRig()` for a hierarchy the actors animate,
`bakePose()` for the same parts flattened through a pose into one geometry and
one draw call. The art bible and the recording are literally the same model.
Anything that never moves keeps the merged path.

The joint set is decided by the gait states and the node vocabulary, not by
convenience: three segments a leg on both characters (a foot has to be plantable
and the hock has to survive, per D27), the dog's neck separate from his head
(a look-back bends the neck first, also D27), and a three-segment tail (tail
language is a sweep travelling down it, which one rigid stick cannot do).

## D29 — A foot is a world position, not a limb angle

Gate 3 asks for a boy with weight, a settle, no foot sliding, and pawprints that
match the gait. None of those is reachable by tuning a swing angle: rotating a
rigid leg about the hip drags its contact point along the ground by whatever the
arc happens to be.

**Ruling:** `src/game/gait.ts` plans FOOTFALLS. A foot is put down at a world
position, held while the body passes over it, and picked up again; the leg is
solved to reach it. Three things follow, and all three are consequences rather
than features:

- Sliding is zero by construction. What remains is a leg that could not REACH
  its plant, which is a different and measurable thing (`tools/dev/gait.mjs`).
- The body's bob is not authored. `supportHeight()` drops the body as the stride
  opens, because a leg at full stretch cannot also be a leg reaching forward,
  and lets it back up as the foot passes underneath. Any bob added on top of
  that is error: the dog carried an 18 mm sine and it lifted his paws off the
  ground by exactly that much.
- Every print in the game is spawned BY a plant, at that foot's position,
  facing the way it was pointing. A print cannot disagree with the gait because
  there is no other way for one to come into existence.

Stride length is derived, not chosen: a foot on the ground travels `duty *
stride` relative to its hip, so half of that is the reach a leg needs at
touchdown, and a leg covers `sqrt(2 * reach * dip)` of it for a given hip drop.
The boy's legs were 7 cm too short to take any step at all and are longer; he is
1.17 m and 2.97 of his own heads, against the "three heads" the art direction
asks for.

## D30 — Pace is set by cadence, and cadence is set by the legs

The boy walked at 1.6 m/s and the dog trotted at 2.6, both chosen at Gate 1
against grey boxes with no gait in them. At the stride lengths their legs
actually cover, that is 256 steps a minute for the boy and 4.2 stride cycles a
second for the dog — neither of which is a walk or a trot at any size.

**Ruling:** the boy walks at 1.15 m/s (0.75 m stride, 184 steps a minute) and
the chapter's trot nodes run at 2.2 (0.62 m stride, 3.55 cycles a second).
`game-design.md` names no number for either, and the doc-owned quantity moves
the right way: chapter 1's 595 m of route is 8.6 minutes of walking against the
~8 the story bible asks for, where 1.6 gave 6.2. Story rule 4 — trotting, never
running — lives or dies on the dog's cadence, not on his speed.

## D31 — The river's shoreline is found, not stated

Water reaches were fractional cross-section RUNG indices. A rung index means a
different place in a leg with a different profile, so the ford's bank-to-bank
crossing was being drawn across its neighbour's rungs, where the same index is
halfway up a cliff; and a shoreline pinned to a rung while the rung wanders with
the bank jitter cuts a sawtooth into the bank.

**Ruling:** the chapter states where there is water and how high it is, and
nothing else. At each sample the engine walks the cross-section out from its
lowest point until the ground rises through the water level, and that crossing
IS the shoreline, smoothed over five samples so it curves rather than steps.
Depth follows from the bed under it, and the three documented river values are
chosen by depth rather than authored per reach — which is "depth told by hue"
becoming automatic. `tools/dev/river.mjs` reports the width and depth per
sample.

## D32 — The ford reads as shade because the reach is opened, not because the sun moved

The Gate 1 verdict asked whether the ford reading as underexposure was a light
problem or a geometry one. Measured: samples 89 to 125 had **zero percent** of
their walked floor in the key light — a 56 m unbroken shaded run, so there is no
lit surface in the reach for an edge to be the edge of.

**Ruling:** geometry. No side wall is to blame — at D20's sun the shadow falls
almost straight down the canyon's own axis — so moving the sun would cost D20 its
whole argument and buy a different frame, not a better one. The reach is opened
instead, and only above the near terrace: a 7 m terrace 15 m out throws its
shadow twelve metres and lands it on its own foot, while the 21 m rim above it
throws thirty-six and buries the floor. 0% lit becomes 54%, with the terminator
falling inside the reach. `tools/dev/fordlight.mjs` is the instrument.

## D33 — The whistle's press reads on the boy; the answer reads on the world

Gate 1 drew an expanding ring on the ground under the player for the press and
another under the dog for the answer, plus six grey tetrahedra for the birds.
A ring drawn under the player is a marker on the player in screen grammar, which
is the one thing `game-design.md` says the answer must never be.

**Ruling:** the press is a GESTURE — he stops, puts a hand to his mouth, tips his
head back and rises a little. The answer is birds lifting and scattering from
where he is, and a puff of dust off the ground he barked on. Both are world
events at real positions, both fade, neither points. The birds are drawn in the
documented pine value because a bird against a pale sky is a dark silhouette and
that is all that survives at eighty metres; the dust is the documented path
value it was lifted from. No new colour enters the chapter for this.

## D34 — Gate 3 is judged from a deterministic recording

`tools/shoot.mjs` takes stills and Gate 3 is about movement. A critic loop
comparing two takes of a moving character needs those takes to differ only where
the code differs.

**Ruling:** `tools/record.mjs` owns the frameloop. `frameloop="never"`, a fixed
timestep, a seeded clock and random stream (`src/game/clock.ts`), and a scripted
input timeline (`tools/takes.mjs`). Same seed, same script, same pixels. It
writes a WebM, a wide contact sheet, a second sheet cropped around the dog — at
the distances this chapter stages him he is twenty pixels tall and no judgement
about his gait can be made from the wide one — and the per-frame probe the
numbers come out of. `?rec=` is dev-only, exactly like `?dev`.

---

Polish pass, 2026-09-04. Ryan played the build and filed it as "looks like shit
and doesn't work well, it's not fun". These are the rulings that answered that,
each of them a change to something an earlier gate had signed off. Where a
ruling reverses an earlier one it says so.

## D35 — The chapter opens facing up the canyon, with the dog at heel

The manifest's `spawn.facing` was written in the builder's own heading
convention (0 = +x) and read by the engine as a three.js yaw (0 = +z), so the
boy started facing sideways across the river at a striped terrace. The
builder now converts. And the opening wait's idle was `sniff`, which kept the
dog in a 2.5 m circle at the spawn while the boy walked away: the bolt then
played behind the player's back. **Ruling:** a third wait idle, `heel`, for all
chapters: the dog keeps a single target point beside and a little behind the
boy, on walkable ground, sniffing when the boy stands still. It is one target
walked to, not companion AI, and it is what `story.md` asks for: "walking, the
dog trotting at heel." When the wait releases into a trot the dog projects
himself onto the next path instead of snapping back to its first point, so he
bolts from wherever he is.

## D36 — The walk is 1.5 m/s (reverses the 1.15 in D30's note)

1.15 m/s from a camera six and a half metres back covered a screen-width of
floor in about eight seconds, and slow walking is the first thing anyone says
about a walking game. 1.5 m/s with a 0.88 m cycle is 205 steps a minute, a
child hurrying, and the chapter's critical path lands near seven minutes.
Pace stays authored; no run button exists.

## D37 — The ramp is wide again, and the bake is blurred (reverses parts of D22)

D22 narrowed the lit/shade band to nearly closed so facets would carry the
wall. Played rather than judged from stills, the cost was the whole picture: a
face either rendered `#E3C08C` or `#9DA9A2`, the bedding steps alternated
between them, and every canyon wall was a zebra. The baked sun shadow and the
sky-visibility term were one value per face on a 2 m bake, so the floor was a
quilt of grey rectangles. **Ruling:** the world ramp is `[-0.6, 0.32]`, limestone
slides 0.8 of the way to its shadow hex rather than all of it, ground 0.36.
Bedding relief is halved and reaches only faces that stand up (on a sloping
floor it drew contour bands). The mottle's octaves are 3 m and 11 m so
neighbouring faces agree. The shadow march reads a bilinear heightfield, and
both baked terms are blurred across a two-face radius in loft space before they
are written. Every polygon is still one flat colour; the values they carry are
now continuous. The red audit still passes.

## D38 — Presentation: the chapter card is the loading screen

The game showed a bare canvas, then the world, with a debug HUD in the corner
on the dev server. **Ruling:** a veil in the chapter's sky colours is there from
the first paint; the place name settles onto it in a soft serif (Fraunces, OFL,
with a system serif fallback); the world fades up beneath, the name holds a few
seconds and goes, and only then does the legend appear. The same card returns
at the chapter's end. Text is the place name only. The legend and whistle
button are drawn in the chapter's pine value on a pale veil rather than in
white on a dark panel. The vertical field of view opens to 68 degrees in
portrait so the canyon is not a slot.

## D39 — Atmosphere, none of it information

The sky gathers its documented rim value toward the sun, so the sky and the
haze built from it have a direction. Pale motes drift in the air and show only
against shade. The river carries a slow, metres-wide band of light. None of
these carries a signal, none points at the dog, none is a new colour.

## D40 — Audio is synthesised, and the bed is chapter data

No audio direction doc exists (D14). Rather than ship silence, everything is
built from oscillators and filtered noise at runtime: a canyon bed (river,
spray, air, a bird now and then), a two-note whistle on the press, a bark on
the answer panned and dulled by distance from the camera, one higher bark at
the bolt, and soft footfalls. The manifest names the bed (`synth:canyon-morning`)
so other chapters ask for their own. Nothing is sampled or sourced. The game
remains fully playable with sound off; the audio adds nothing the picture does
not already say. Audio starts on the first gesture, which is the same input
that dismisses the legend.

---

# The rebuild (September 2026)

After four gates the project had one partial chapter, 13k lines of engine, and
none of the ending, which is the only reason the game exists. The human asked
for one more try with licence to change anything. These rulings supersede
anything above they contradict. The story, the four rules of the dog, the red
rule, the no-wayfinding-UI rule and the whistle are unchanged.

## D41 — Whole day first, then depth

**Ruling:** all four chapters and the ending exist and play end to end before
any one chapter is polished further. Critical path is now about 12 minutes of
straight walking (ch1 ~2.5, ch2 ~3.7, ch3 ~2.5, ch4 ~2 plus the ending), 15 to
20 with the opening, exploring and whistling. The 40 to 50 minute target is
reached later by lengthening routes and adding optional space in data, not
by building more engine. A complete short day that lands its ending is worth
more than a quarter of a long one.

## D42 — One continuous world

The four chapters are stretches of one coast in real meters (`src/data/world.json`),
not four scenes. The end-of-day map is therefore a truthful top-down view of
where the boy walked, the town seen from the canyon rim is the actual town,
and the woods-to-shore transition has no load and no cut. The light changes
per chapter behind the map screen; ch3 into ch4 is seamless.

## D43 — Real shadows (supersedes "no dynamic shadows")

One shadow-mapped light (sun, then moon) following the boy. "Shade is a place"
in the noon town and "long soft shadows" in the canyon were not achievable
with blob shadows. Everything else in the technique list stands: flat shading,
vertex colours from the palette, one light plus ambient, fog as colour, no
outlines, one grain pass.

## D44 — Routes are corridors, the dog's route is a line

Walkability is route corridors plus areas per chapter (plazas, beach). The
dog's authored nodes are placed by plan position and projected onto the
chapter's main line. The camera looks along the route, i.e. where the dog went,
and swings to the open side on cliff paths. Chapter seams stay walkable until
the boy is 30 m into the new chapter.

## D45 — The canyon climb follows the side stream

The switchbacks cut into the west wall read as a trench no camera could frame.
The route now climbs the side stream's gully (a second valley in world data)
to the plateau, and the town opens up at the rim.

## D46 — Decisions made on the [OPEN] items, all reversible in data

- The door at home opens on a dark silhouette in warm light, no face, no voice
  (the story's recommendation).
- No narration. The dog has no name anywhere.
- "Town knows this dog" moments: one so far (the old woman at the upper
  square). The story recommends three with one missable; still owed.
- The boy has eyes only.

## D47 — Process

Gates and critic loops are retired as the unit of work. Each session plays the
whole game (autopilot plus screenshots, see "Testing" in CLAUDE.md), picks the
weakest moment, and fixes it. Performance is measured, never asserted.
