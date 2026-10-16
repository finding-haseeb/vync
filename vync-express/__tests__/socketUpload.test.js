// End-to-end: a real socket.io server + client streaming chunks the same
// way vync-desktop does, verified byte-for-byte on disk.
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { Server } = require("socket.io");
const ioClient = require("socket.io-client");
const { createChunkStore } = require("../lib/chunkStore");

let server;
let io;
let url;
let uploadDir;

beforeAll(async () => {
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "vync-socket-"));
  const store = createChunkStore(uploadDir);
  server = http.createServer();
  io = new Server(server, { maxHttpBufferSize: 5e6 });

  io.on("connection", (socket) => {
    socket.on("video-chunks", (data) => {
      try {
        store.appendChunk(data.filename, data.chunks);
      } catch (err) {
        socket.emit("upload-error", { message: err.message });
      }
    });
    socket.on("finish", async (data, ack) => ack(await store.finalize(data.filename)));
  });

  await new Promise((resolve) => server.listen(0, resolve));
  url = `http://localhost:${server.address().port}`;
});

afterAll(async () => {
  io.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

const connect = () =>
  new Promise((resolve) => {
    const socket = ioClient(url, { transports: ["websocket"] });
    socket.on("connect", () => resolve(socket));
  });

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

const streamUpload = async (filename, payload, chunkSize) => {
  const socket = await connect();
  for (let off = 0; off < payload.length; off += chunkSize) {
    socket.emit("video-chunks", { filename, chunks: payload.subarray(off, off + chunkSize) });
  }
  const filePath = await socket.emitWithAck("finish", { filename });
  socket.disconnect();
  return filePath;
};

it("reassembles a chunked upload byte-for-byte", async () => {
  const payload = crypto.randomBytes(2_000_000);

  const filePath = await streamUpload("single-upload.webm", payload, 64 * 1024);

  expect(sha256(fs.readFileSync(filePath))).toBe(sha256(payload));
});

it("handles 10 parallel uploads without corrupting each other", async () => {
  const payloads = Array.from({ length: 10 }, () => crypto.randomBytes(500_000));

  const paths = await Promise.all(
    payloads.map((p, i) => streamUpload(`parallel-${i}.webm`, p, 32 * 1024)),
  );

  paths.forEach((p, i) => expect(sha256(fs.readFileSync(p))).toBe(sha256(payloads[i])));
});

it("reports an error for path-traversal filenames", async () => {
  const socket = await connect();
  const error = new Promise((resolve) => socket.on("upload-error", resolve));

  socket.emit("video-chunks", { filename: "../../evil.webm", chunks: Buffer.from("x") });

  await expect(error).resolves.toEqual({ message: expect.stringMatching(/Invalid filename/) });
  socket.disconnect();
});
