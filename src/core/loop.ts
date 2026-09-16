/**
 * Fixed-timestep loop. Simulation advances in constant slices so two machines
 * that replay the same inputs reach the same state. Rendering interpolates.
 */
export function startLoop(
  step: (dt: number) => void,
  render: (alpha: number) => void,
  fixedDt: number,
): () => void {
  const MAX_FRAME = 0.25
  let last = performance.now() / 1000
  let accumulator = 0
  let handle = 0

  const frame = () => {
    handle = requestAnimationFrame(frame)
    const now = performance.now() / 1000
    accumulator += Math.min(now - last, MAX_FRAME)
    last = now
    while (accumulator >= fixedDt) {
      step(fixedDt)
      accumulator -= fixedDt
    }
    render(accumulator / fixedDt)
  }

  handle = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(handle)
}
