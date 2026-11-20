// Ticket-04 §1 frame statistics, exactly as defined in the ticket.
//   avg_fps      = 1000 * N / sum(dt)
//   p1_low_fps   = 1000 / mean(k largest dt), k = max(1, ceil(0.01 * N))
//   frame_ms_p95 = 95th percentile of dt (nearest-rank)
export function frameStats(dts) {
  const N = dts.length;
  if (!N) return { frames: 0, avg_fps: 0, p1_low_fps: 0, frame_ms_p95: 0 };
  const sum = dts.reduce((a, b) => a + b, 0);
  const sorted = [...dts].sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(0.01 * N));
  const worst = sorted.slice(N - k);
  const p95 = sorted[Math.min(N - 1, Math.ceil(0.95 * N) - 1)];
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    frames: N,
    avg_fps: r1((1000 * N) / sum),
    p1_low_fps: r1(1000 / (worst.reduce((a, b) => a + b, 0) / k)),
    frame_ms_p95: r1(p95),
  };
}
