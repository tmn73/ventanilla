# Ventanilla

A side-scroller about the person you used to imagine out of the car window.

The car drives. You do not control its speed. Your skater rides the guardrail,
the wall and the power lines beside the road, and the window keeps moving
whether you keep up or not. You lose when the car leaves you behind.

## The idea in one rule

Height pays. The dirt verge always costs you speed, the rail gives a little
back, the wall more, the wires most. Climbing is the only way to hold the
car's pace, and the higher lanes break more often.

## Controls

| Key | Action |
| --- | --- |
| Space, Up, W | Jump. Hold for height. |
| Down, S | Dive. |
| Tap | Jump. Tap the bottom quarter of the screen to dive. |

## Run it

```bash
bun install
bun run dev        # http://localhost:3000
bun run build      # static output in dist/
bun run typecheck
```

## How it is built

- TypeScript and Three.js, with an orthographic camera. No bundler config.
- Bun serves the HTML in development and bundles it for production.
- The simulation runs on a fixed 120 Hz timestep and the renderer interpolates
  between steps. Two machines that replay the same inputs reach the same state.
- Every random draw comes from one seeded generator, so a seed names a road.

## Not built yet

- The daily road: one seed per date, shared by everyone.
- A distance leaderboard, validated by replaying the input trace on a server.
- Ghosts: the same input traces, drawn where other players fell behind.
- Manuals, spins and a trick multiplier.
