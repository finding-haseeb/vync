# Upload benchmark results

Run: 2026-10-07 on Apple M4, Node v24.13.0, localhost (client + server in one process).

Command: `npm run bench -- temp_upload/<72s recording>.webm 72 1 5 10`

```
=== Streaming (1s chunks) ===
┌─────────┬─────────┬────────┬────────────┬────────────┬────────────┬──────────────────┬──────────────────┬─────────┬───────────┐
│ (index) │ clients │ chunks │ chunkP50ms │ chunkP95ms │ chunkMaxms │ stopToReadyP50ms │ stopToReadyMaxms │ intact  │ peakRssMB │
├─────────┼─────────┼────────┼────────────┼────────────┼────────────┼──────────────────┼──────────────────┼─────────┼───────────┤
│ 0       │ 1       │ 72     │ '2.43'     │ '4.49'     │ '7.35'     │ '1.6'            │ '1.6'            │ '1/1'   │ '131'     │
│ 1       │ 5       │ 360    │ '2.61'     │ '5.83'     │ '8.96'     │ '44.8'           │ '73.5'           │ '5/5'   │ '162'     │
│ 2       │ 10      │ 720    │ '2.69'     │ '5.11'     │ '7.88'     │ '99.6'           │ '189.6'          │ '10/10' │ '277'     │
└─────────┴─────────┴────────┴────────────┴────────────┴────────────┴──────────────────┴──────────────────┴─────────┴───────────┘
=== Baseline: whole-file upload after stop (localhost) ===
stop -> ready: 49.4 ms

=== Estimated whole-file upload time on real uplinks ===
5 Mbps uplink: ~36.7 s
10 Mbps uplink: ~18.4 s
20 Mbps uplink: ~9.2 s
```
