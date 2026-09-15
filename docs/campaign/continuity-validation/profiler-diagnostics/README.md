# Earlier profiler attempts

These unmodified raw files preserve the earlier unfavorable samples. Their
warm-up method queued rendering synchronously and did not wait for actual browser
frames, leaving outstanding GPU work at the start of measurement. They are useful
diagnostics but are not an authoritative production comparison.

The later `crowd-performance-final-all.json` used 180 actual browser frames and
produced valid frame statistics. Its `warmupMs` field was still sampled after
the measurement, so that field includes the subsequent eight-second interval.
The final paired `crowd-main-*` and `crowd-candidate-*` reports fix that metadata
and record bundle URLs. None of these diagnostic files represents a performance
improvement made to the shipped enemy code.
