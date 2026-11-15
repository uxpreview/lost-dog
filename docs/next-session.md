# Next session: play it on a real machine, with sound on

The last session rebuilt the picture, the frame and the ending (D55 to D64 in
`decisions.md`). Everything was verified with stills from software WebGL in a
headless browser: the title, every chapter at desktop and phone portrait, the
opening half minute, the ending's three shots, the map and the last screen.
**None of it was seen moving on a real GPU, none of it was held in a hand, and
none of the sound was heard.** That is the first job, and it is the human's.

## Where it stands (measured, `node tools/probe.mjs all <label>`)

| | Before this session | After |
|---|---|---|
| Triangles, nine spots | 118k to 725k | 122k to 724k |
| Draw calls, nine spots | 121 to 337 | 150 to 408 |
| Median gap between moments, ch1 to ch4 | 3.6 / 2.9 / 4.3 / 7.9 s | unchanged |
| Gaps over 25 s, whole day | 0 | 0 |
| Script, gzipped | 384 kB | 394 kB, plus 271 kB of font |

Screenshots: `renders/probe/after/` (before) and `renders/probe/look/` (after).

## 1. Play the whole day by hand, desktop and phone

Judge, in this order:

- **Frame rate.** The post stack adds bloom (five half-size passes), light
  shafts (one quarter-size pass, 28 taps) and a noise lookup or two per
  pixel. It should be cheap; it has not been timed on hardware. The adaptive
  resolution in `Root.tsx` will trade pixels if it is not. If a phone
  struggles, drop shafts first (`rays` to 0 at quality under 0.7 in `post.ts`).
- **Does bloom shimmer?** Bright facets on moving water are the risk. The
  bright pass weights hot pixels down; raise `uThreshold` in `post.ts` if it
  still flickers.
- **The camera at rest.** Stand still four seconds and it pulls back. Is that
  a gift or a drift? The amounts are in `updateCamera` (`rest`).
- **The town boom.** Walk the narrow lanes and both gates. The camera should
  never be inside a house and should duck under the covered passages.
- **The ending.** Three shots, about sixteen seconds, then the map. Is the cut
  to the door earned, and does the walk in read from behind?
- **Sound.** Still never heard by anyone who built it (see D40, D50).
- **Mobile:** one thumb, portrait, sound off.

## 2. Known weak spots

- **Roaming has no obstacles** (D68). He can walk through tree trunks and
  boulders off the path. Dressing knows where they are; the world does not.
- **The opening's close shot shows how simple the two models are** (D70). It
  reads as a boy crouching to his dog; a better dog would make it land.

- **The waterfall is a chute, not a plunge** (D65). The east wall is about 50
  degrees where it comes down. A steeper notch in the wall there (a `soften`
  in reverse on the canyon valley, or a short dry side valley) would let it
  fall. Judge the new first stretch by hand before spending on it.

- **Characters up close.** The dog's head is a few icosahedra; the second
  ending shot stays far enough back to forgive it, and nothing else frames
  him closely. A better dog is the single most valuable modeling job left.
- **The night beach is still broad and plain.** Cloud shadow, haze, fireflies
  and the moon path carry it now. Wrack lines, more boats, a net-drying rack
  would help, all placeable in `ch4.json`.
- **Ground cover looms** in the lower camera's foreground: tufts near the lens
  are dark cones. Thin them near the path or soften them.
- **Draw calls** are over the old quality-bar figures, as before, and ten
  higher from post. The town approach (408) is the worst.
- **The lookout vista** still frames the town through pines (from the last
  session's list).
- **Town windows do not light at dusk.** Seen from the woods' lookout in the
  last sun they would be lovely, and the window gold is reserved for home.
  That reservation is worth more; leave it unless the human says otherwise.

## 3. Open questions for the human

- **Photo mode** (pause, orbit, save a still with the wordmark). It suits a
  game this pictorial and it is how these things get shared. It is not a
  verb, but it is a feature the design never asked for.
- **Save the map as an image** from the last screen. The map is SVG with an
  external stylesheet, so it needs the styles inlined before it can be drawn
  to a canvas.
- **Longer routes** toward the 40 to 50 minute target, still open from D41.
- **The three lines of small print on the title** ("Best with sound", "About
  fifteen minutes", controls). They are UI, not story, but they are words in
  a wordless game. Keep, trim or cut.
