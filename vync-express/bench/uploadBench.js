// Replays a real recording through the chunked socket.io upload path the
// same way vync-desktop does (one chunk per second) and measures latency.
//
// Usage: node bench/uploadBench.js <file.webm> [durationSec] [clients...]
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { performance } = require("perf_hooks");
const { Server } = require("socket.io");
const ioClient = require("socket.io-client");
const { createChunkStore } = require("../lib/chunkStore");

const [source, durationArg, ...clientArgs] = process.argv.slice(2);
if (!source) {
  console.error("Usage: node bench/uploadBench.js <file.webm> [durationSec] [clients...]");
  process.exit(1);
}
const recording = fs.readFileSync(source);
const durationSec = Number(durationArg) || 60;
const clientCounts = clientArgs.length ? clientArgs.map(Number) : [1, 5, 10];

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

const startServer = async () => {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "vync-bench-"));
  const store = createChunkStore(uploadDir);
  const server = http.createServer();
  const io = new Server(server, { maxHttpBufferSize: 1e8 });
  const chunkLatencies = [];

  io.on("connection", (socket) => {
    socket.on("video-chunks", (data) => {
      store.appendChunk(data.filename, data.chunks, (err) => {
        if (err) throw err;
      });
      chunkLatencies.push(performance.now() - data.sentAt);
    });
    socket.on("process-video", async (data, ack) => {
      await store.finalize(data.filename);
      ack();
    });
  });

  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  const stop = async () => {
    io.close();
    await new Promise((r) => server.close(r));
    fs.rmSync(uploadDir, { recursive: true, force: true });
  };
  return { url, uploadDir, chunkLatencies, stop };
};

const connect = (url) =>
  new Promise((resolve) => {
    const s = ioClient(url, { transports: ["websocket"] });
    s.on("connect", () => resolve(s));
  });

// Streams the recording in `durationSec` chunks, one per second, then
// measures how long after "stop" the file is complete on disk.
const streamingClient = async (url, uploadDir, id) => {
  const socket = await connect(url);
  const filename = `bench-${id}-${Date.now()}.webm`;
  const chunkSize = Math.ceil(recording.length / durationSec);
  for (let i = 0; i < durationSec; i++) {
    const chunks = recording.subarray(i * chunkSize, (i + 1) * chunkSize);
    socket.emit("video-chunks", { filename, chunks, sentAt: performance.now() });
    await sleep(1000);
  }
  const stopAt = performance.now();
  await socket.emitWithAck("process-video", { filename });
  const readyMs = performance.now() - stopAt;
  socket.disconnect();
  const ok = sha256(fs.readFileSync(path.join(uploadDir, filename))) === sha256(recording);
  return { readyMs, ok };
};

// Baseline: upload the whole file in one go after recording stops.
const wholeFileClient = async (url, uploadDir, id) => {
  const socket = await connect(url);
  const filename = `whole-${id}-${Date.now()}.webm`;
  const stopAt = performance.now();
  socket.emit("video-chunks", { filename, chunks: recording, sentAt: stopAt });
  await socket.emitWithAck("process-video", { filename });
  const readyMs = performance.now() - stopAt;
  socket.disconnect();
  return { readyMs };
};

const run = async () => {
  const sizeMB = recording.length / 1e6;
  const bitrateMbps = (recording.length * 8) / durationSec / 1e6;
  console.log(`Recording: ${sizeMB.toFixed(2)} MB, ${durationSec}s, ~${bitrateMbps.toFixed(2)} Mbps`);
  console.log(`Chunks: ${durationSec} x ${(recording.length / durationSec / 1024).toFixed(0)} KB @ 1/s\n`);

  const results = [];
  for (const n of clientCounts) {
    const srv = await startServer();
    const rssBefore = process.memoryUsage().rss;
    let peakRss = rssBefore;
    const memTimer = setInterval(() => {
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
    }, 250);

    const runs = await Promise.all(
      Array.from({ length: n }, (_, i) => streamingClient(srv.url, srv.uploadDir, i)),
    );
    clearInterval(memTimer);

    const ready = runs.map((r) => r.readyMs);
    const row = {
      clients: n,
      chunks: srv.chunkLatencies.length,
      chunkP50ms: pct(srv.chunkLatencies, 50).toFixed(2),
      chunkP95ms: pct(srv.chunkLatencies, 95).toFixed(2),
      chunkMaxms: Math.max(...srv.chunkLatencies).toFixed(2),
      stopToReadyP50ms: pct(ready, 50).toFixed(1),
      stopToReadyMaxms: Math.max(...ready).toFixed(1),
      intact: `${runs.filter((r) => r.ok).length}/${n}`,
      peakRssMB: (peakRss / 1e6).toFixed(0),
    };
    results.push(row);
    console.log(row);
    await srv.stop();
  }

  const base = await startServer();
  const whole = await wholeFileClient(base.url, base.uploadDir, 0);
  await base.stop();

  console.log("\n=== Streaming (1s chunks) ===");
  console.table(results);
  console.log("=== Baseline: whole-file upload after stop (localhost) ===");
  console.log(`stop -> ready: ${whole.readyMs.toFixed(1)} ms`);
  console.log("\n=== Estimated whole-file upload time on real uplinks ===");
  for (const mbps of [5, 10, 20]) {
    console.log(`${mbps} Mbps uplink: ~${((recording.length * 8) / (mbps * 1e6)).toFixed(1)} s`);
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
