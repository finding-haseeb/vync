const fs = require("fs");
const path = require("path");

// Recorder filenames look like `<uuid>-<8 chars>.webm`. Anything else
// (path separators, "..", other extensions) is rejected so a client can't
// write outside the upload directory.
const SAFE_FILENAME = /^[A-Za-z0-9_-]{1,128}\.webm$/;

const isSafeFilename = (filename) =>
  typeof filename === "string" && SAFE_FILENAME.test(filename);

const createChunkStore = (uploadDir) => {
  const activeUploadStreams = new Map();

  const resolvePath = (filename) => {
    if (!isSafeFilename(filename)) {
      throw new Error(`Invalid filename: ${filename}`);
    }
    return path.join(uploadDir, filename);
  };

  // Appends a chunk to the file's write stream. Chunks are written in the
  // order they arrive, which socket.io guarantees per connection.
  const appendChunk = (filename, chunks, onError) => {
    const filePath = resolvePath(filename);
    const chunkBuffer = Buffer.from(chunks);

    let writeStream = activeUploadStreams.get(filename);
    if (!writeStream) {
      writeStream = fs.createWriteStream(filePath, { flags: "a" });
      activeUploadStreams.set(filename, writeStream);

      writeStream.on("error", (err) => {
        console.error("🔴 Stream error:", err);
        activeUploadStreams.delete(filename);
      });
    }

    writeStream.write(chunkBuffer, (err) => {
      if (err && onError) onError(err);
    });
  };

  // Flushes and closes the write stream so the file is complete on disk.
  const finalize = async (filename) => {
    const filePath = resolvePath(filename);
    const writeStream = activeUploadStreams.get(filename);
    if (writeStream) {
      await new Promise((resolve) => writeStream.end(resolve));
      activeUploadStreams.delete(filename);
    }
    return filePath;
  };

  const activeCount = () => activeUploadStreams.size;

  return { appendChunk, finalize, resolvePath, activeCount };
};

module.exports = { createChunkStore, isSafeFilename };
