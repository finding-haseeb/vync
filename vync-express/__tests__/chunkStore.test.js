const fs = require("fs");
const os = require("os");
const path = require("path");
const { createChunkStore, isSafeFilename } = require("../lib/chunkStore");

let uploadDir;
let store;

beforeEach(() => {
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "vync-chunks-"));
  store = createChunkStore(uploadDir);
});

afterEach(() => {
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

describe("isSafeFilename", () => {
  it("accepts recorder-style filenames", () => {
    expect(isSafeFilename("07a9f12e-2ff3-495d-ad9d-ad1b6a2f7c9a-9a30da38.webm")).toBe(true);
  });

  it.each([
    "../server.js",
    "../../etc/passwd.webm",
    "nested/file.webm",
    "file.js",
    "",
    undefined,
    42,
  ])("rejects %p", (name) => {
    expect(isSafeFilename(name)).toBe(false);
  });
});

describe("createChunkStore", () => {
  it("writes chunks to disk in arrival order", async () => {
    const parts = ["first-", "second-", "third"];
    for (const part of parts) store.appendChunk("a.webm", Buffer.from(part));

    const filePath = await store.finalize("a.webm");

    expect(fs.readFileSync(filePath, "utf8")).toBe(parts.join(""));
  });

  it("accepts ArrayBuffer chunks like socket.io delivers from the browser", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    store.appendChunk("b.webm", bytes.buffer);

    const filePath = await store.finalize("b.webm");

    expect([...fs.readFileSync(filePath)]).toEqual([1, 2, 3, 4]);
  });

  it("keeps concurrent uploads isolated", async () => {
    for (let i = 0; i < 50; i++) {
      store.appendChunk("x.webm", Buffer.from(`x${i};`));
      store.appendChunk("y.webm", Buffer.from(`y${i};`));
    }
    expect(store.activeCount()).toBe(2);

    const [xPath, yPath] = await Promise.all([
      store.finalize("x.webm"),
      store.finalize("y.webm"),
    ]);

    const expected = (p) => Array.from({ length: 50 }, (_, i) => `${p}${i};`).join("");
    expect(fs.readFileSync(xPath, "utf8")).toBe(expected("x"));
    expect(fs.readFileSync(yPath, "utf8")).toBe(expected("y"));
  });

  it("closes and forgets the stream on finalize", async () => {
    store.appendChunk("c.webm", Buffer.from("data"));
    expect(store.activeCount()).toBe(1);

    await store.finalize("c.webm");

    expect(store.activeCount()).toBe(0);
  });

  it("finalize is a no-op for an unknown upload", async () => {
    const filePath = await store.finalize("missing.webm");

    expect(filePath).toBe(path.join(uploadDir, "missing.webm"));
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("refuses to write outside the upload directory", () => {
    expect(() => store.appendChunk("../escape.webm", Buffer.from("x"))).toThrow(
      /Invalid filename/,
    );
    expect(fs.existsSync(path.join(uploadDir, "..", "escape.webm"))).toBe(false);
  });
});
