> **Superseded.** These gate prompts belong to the pre-rebuild process. See
> `docs/decisions.md` D41 to D47 and the Working rhythm section of `CLAUDE.md`.

# Prompts for Claude Code

How to use this file: one session per gate, one prompt per session. Start a
fresh Claude Code session at each gate so context stays clean. Do not paste the
whole build into one session, because an agent with the full plan in view will
race to the end and skip the discipline the docs exist to enforce.

Everything in `CLAUDE.md` is read automatically at session start, so these
prompts stay short and point at the gates.

---

## Note for future sessions

**Status.** Session 0 (the comprehension check) has been run, and the
mechanical contradictions it surfaced have been resolved into the docs. The
rulings and their rationale live in `docs/decisions.md` — read it alongside
the four governing docs. The creative **[OPEN]** items in `docs/story.md`
(boy's face, narration, the dog's name, the door, the count of "town knows
this dog" moments) are still the human's to decide; do not resolve them
silently in code. If a gate forces one, stop and ask.

**Scaffold exists.** The Vite + React Three Fiber + Zustand project is already
set up at the repo root with a placeholder scene. Session 1 should build
Gate 1 inside this scaffold, not re-create it. Deployment: import
`uxpreview/cuddly-parakeet` as a project on the Vercel team (one-time, from
the dashboard); Vercel auto-detects Vite and deploys every push after that.

**Mechanics reference, not style reference.** Two screenshots live in
`docs/reference/` (`mechanics-reference-desktop.jpg`,
`mechanics-reference-mobile.png`). They show a third-person browser walking
experience and are the reference for *mechanics and presentation scaffolding
only*:

- Third-person follow camera behind a small stylized character
- Desktop: a minimal glyph-style control legend (Move / Menu / action key)
- Mobile portrait: a floating thumb joystick, menu tucked in a corner, the
  scene fully playable one-handed

What they are **not** a reference for:

- The monochrome scribble/ink style. This game is **full color**;
  `docs/art-direction.md` governs every visual decision
- The persistent on-screen legend. Ours shows once on first load and
  dismisses on input, per `docs/game-design.md`
- Wall text in the world. Ours has none, ever
- Anything asset-level. Never copy, trace, or reproduce anything from the
  pictured site; the screenshots are input-and-camera-feel reference only

---

## Session 0 — comprehension check

Run this before any code. It catches doc contradictions while they are cheap.

```
Read CLAUDE.md and every document in docs/ completely.

Then, without writing any code:

1. Summarize the game back to me in ten lines, in your own words.
2. List every contradiction, ambiguity, or gap you find between the four
   docs. Missing information counts. Do not resolve anything yourself,
   just list.
3. Tell me the three highest technical risks in this project and how you
   would reduce each one at Gate 1.

Then stop and wait for me.
```

---

## Session 1 — Gate 1, grey box

```
We are executing Gate 1 only, as defined in docs/quality-bar.md. Do not
build anything belonging to a later gate.

Set up the project (Vite, React Three Fiber, Zustand) and build the
Chapter 1 grey box: untextured canyon-shaped geometry blocked from the
chapter description in docs/story.md, walking with authored pace, the dog
as a node-route actor with trot, hazard-wait, look-back and one near-miss,
the whistle loop with a placeholder answer cue that works with sound off,
and placeholder pawprints.

The dog's route logic must already read from a JSON manifest per the schema
in docs/game-design.md, even in grey box, so the data-driven architecture
is proven from day one.

Fan out sub-agents where parallel work helps: one on the movement and
camera, one on the dog actor, one on the whistle loop. Then integrate.

Run a critic pass on the near-miss specifically: record it and judge
whether it reads as "almost caught him" or as the game cheating. Loop on
staging until it reads as almost, cap of 5 attempts, then report.

When Chapter 1 is walkable start to finish, stop. Give me a dev URL, tell
me the desktop and mobile controls, and wait. I will playtest it myself.
This gate is judged by me, not by you.
```

---

## Session 2 — Gate 2, art bible

```
We are executing Gate 2 only: the static art bible scene, canyon at
morning, per docs/art-direction.md. No gameplay work.

Build the scene: terrain, river, pines, both characters posed, pawprints,
the Chapter 1 palette applied exactly as documented, fog as a color tool,
the grain pass, blob shadows.

Also build the red audit script from docs/quality-bar.md and run it on
this scene.

Then run the critic loop: a separate sub-agent, acting as a harsh art
director who does not accept close enough, judges screenshots against
docs/art-direction.md using the failure list in the Gate 2 section of
docs/quality-bar.md. Every iteration must state what specifically failed
and what changed in response. Cap of 8 iterations. If the cap is reached,
stop and report what is still off with screenshots of the best attempt.

When the critic passes it or the cap is hit, stop, show me screenshots at
desktop and portrait phone aspect ratios, and wait.
```

---

## Session 3 — Gate 3, the two characters

```
We are executing Gate 3 only: the boy and the dog, fully realized, per
docs/game-design.md and docs/art-direction.md.

Build: the boy's three gait states and blending, footprint spawning in
step with the gait, the dog's complete node vocabulary including all three
look-back variants and tail language, the whistle answer with its visual
correlate, and the follow camera with its dog-aware framing bias.

Critic loop per the Gate 3 section of docs/quality-bar.md, judged from a
15 second recording, with the mute test included: the critic watches once
with audio off and must still understand every beat. Cap of 8.

Stop when it passes or caps, share the recording, and wait.
```

---

## Session 4 — Gate 4, the chapter engine

```
We are executing Gate 4 only: the chapter engine, per the manifest schema
in docs/game-design.md.

Build: the manifest loader, lighting states with blending, trigger
volumes, witnesses, glimpses, disturbances, the route logger, the map
screen with its drawing animation, chapter save state, menu and chapter
select.

Prove it with a trivial test chapter authored purely as a manifest, with
zero engine special-casing: it must load, play, log a route and render
its map.

Then attempt to author a second tiny variation of the test chapter. If
anything about it requires touching engine code, that is a Gate 4 failure:
fix the engine and try again. Stop when both test chapters run from data
alone, and wait.
```

---

## Session 5 — Gate 5, Chapter 1 complete

```
We are executing Gate 5 only: Chapter 1 finished, per docs/story.md,
end to end, full art and audio, as a manifest on the engine.

Work through it in passes: layout and dog route first, then art set
dressing, then lighting and fog, then audio including the bark set with
visual correlates, then the chapter-end map moment and the transition
card.

Run the red audit. Verify every framed moment in portrait.

Then stop and give me the build. The gate itself is two human playtests,
one normal and one with sound off, defined in docs/quality-bar.md. I will
run those. Do not self-certify this gate.
```

---

## Session 6 — Gate 6, the rest of the day

```
We are executing Gate 6: Chapters 2, 3 and 4 as manifests only, per
docs/story.md.

Author them one at a time, in order, and after each one report the engine
diff. The required diff is zero. If a chapter needs something the engine
lacks, stop and tell me before changing the engine, because the change
must be schema-wide, not a special case.

The Old Town's false-direction whistle zones, its witnesses including the
old woman, the woods' three-state lighting blend, and the shore's
whistle-does-nothing behavior must all be expressible as data. That is
the test of everything we built.

Chapter 3 skips the map screen. Chapter 4 ends with the gate, the
windows, the full-day map, then the title. Get the order exactly as
docs/story.md specifies.
```

---

## Session 7 — Gate 7, performance and polish

```
We are executing Gate 7: performance against the budgets in
docs/quality-bar.md, measured, not asserted.

Profile the Old Town first, it is the stress case. Report draw calls,
frame times on a throttled mobile profile, payload sizes and time to
first interactive, as actual numbers with how you measured them.

Optimize in this order: instancing and batching, texture and material
consolidation, lazy chapter loading, then anything else. After every
optimization pass, run the red audit and re-verify one screenshot per
chapter against docs/art-direction.md, because optimization passes are
where the look quietly degrades.

Loop until budgets are met or you have a specific, honest reason a budget
cannot be met, cap of 10 passes. Then stop and report.
```

---

## Reusable — when something is broken

Paste this and fill in the top line. It exists so a bug can be reported by
symptom, without reading stack traces.

```
Something is wrong: [what you saw, in plain words, e.g. "the dog froze at
the ford and whistling did nothing"].

Reproduce it yourself first. Add whatever logging you need, run the game,
and confirm you can see the same symptom before changing anything. Tell
me what you find in plain language: what is happening, why, and what the
fix is, before you apply it. Then apply it, verify the symptom is gone,
and confirm nothing else changed by re-running the current gate's checks.
```

---

## Reusable — drift check

Run occasionally, especially after long sessions.

```
Re-read CLAUDE.md and docs/quality-bar.md. Then audit the current build
against the Laws of the project and the standing prohibitions, one by
one, and report any violation or partial violation you find, including
ones you introduced. Do not fix anything yet, just report.
```
