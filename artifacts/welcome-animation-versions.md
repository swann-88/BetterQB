# Welcome Animation Versions

## V1 (Baseline Locked)
- Saved at: 2026-04-02 (America/Los_Angeles)
- Scope: Level-0 welcome animation only
- Renderer: Three.js local dependency
- Source file:
  - `src/renderer/scripts/modules/welcome-saturn.js`

### Visual/Behavior Snapshot
- Saturn scale locked to a large static value (no breathing size change).
- Starfield/nebula background made visually stable (no rotating flicker behavior).
- Saturn particle/ring brightness increased for stronger visibility.
- Ring orbital speed reduced by ~30% versus prior state.
- Planet body rotates in reverse direction at ~10% of ring speed.

### Intent for Next Iterations
- Treat this as V1 reference baseline.
- All subsequent welcome-animation tweaks should append as V2/V3/... with explicit deltas.

## V2 (Approved Direction)
- Confirmed at: 2026-04-02 (America/Los_Angeles)
- Status: Implemented

### Implemented Simulation Upgrade
- Replaced direct `uTime`-driven ring/body spin with orbit-parameter uniforms:
  - `uRingAngle` drives ring orbital phase
  - `uBodyAngle` drives reverse body rotation
- Added light spring-damper integration in animation loop to stabilize:
  - ring angular speed
  - body reverse speed (10% of ring speed, opposite direction)
  - presentation yaw follow behavior
- Removed the near-camera high-frequency chaos perturbation from the vertex shader to eliminate shimmer-causing micro-jitter.

### Primary Objective
- Reduce shimmer/flicker while making particle relationships feel dynamic and physically plausible.

## V3 (Per-Particle Flow Model)
- Implemented at: 2026-04-02 (America/Los_Angeles)
- Scope: Level-0 welcome animation motion-model upgrade only.

### Motion Model Changes
- Removed whole-object ring/body spin illusion as the primary driver.
- Ring now evolves per particle using parametric flow:
  - individual angular speed
  - differential rotation (inner faster, outer slower)
  - per-particle radial drift
  - per-particle vertical drift
- Planet rebuilt as layered volume particles:
  - dense bright core
  - coherent mid-volume
  - softer outer haze
- Added subtle per-particle spherical internal drift for planet volume energy.
- Camera remains stable; perceived motion is driven by particle flow.
