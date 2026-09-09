const express = require('express');
const next = require('next');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

const port = parseInt(process.env.PORT, 10) || 3845;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Ensure temp directory exists with safe local/server fallback
let uploadDir = process.env.STORAGE_ROOT
  ? path.join(process.env.STORAGE_ROOT, 'temp')
  : '/data/storage/temp';

try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (err) {
  uploadDir = path.join(process.cwd(), 'storage', 'temp');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

// Helper to sanitize fingerprint into safe filename for chunked storage
function getSanitizedPartPath(fingerprint) {
  const safeName = (fingerprint || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
  return path.join(uploadDir, `${safeName}.part`);
}

app.prepare().then(() => {
  const server = express();

  // 1. Next.js Upload Completion Endpoint (runs ffprobe, poster, DB insertion)
  server.all('/api/upload/complete', (req, res) => {
    return handle(req, res);
  });

  // 2. Direct Bare-Metal Chunk Ingestion Engine (Nextcloud / OpenMediaVault architecture)
  // Check existing upload progress / resume offset
  server.get('/api/upload/chunk', (req, res) => {
    const fingerprint = req.query.fingerprint;
    if (!fingerprint) {
      return res.status(400).json({ success: false, error: 'Missing fingerprint parameter' });
    }
    const partPath = getSanitizedPartPath(fingerprint);
    if (fs.existsSync(partPath)) {
      try {
        const stat = fs.statSync(partPath);
        return res.json({ success: true, exists: true, offset: stat.size });
      } catch (err) {
        return res.json({ success: true, exists: false, offset: 0 });
      }
    }
    return res.json({ success: true, exists: false, offset: 0 });
  });

  // Stream raw binary chunk directly to disk append stream with backpressure
  server.post('/api/upload/chunk', async (req, res) => {
    const fingerprint = req.headers['x-upload-fingerprint'];
    const offsetHeader = req.headers['x-upload-offset'];

    if (!fingerprint || offsetHeader === undefined) {
      return res.status(400).json({ success: false, error: 'Missing required upload headers' });
    }

    const offset = parseInt(offsetHeader, 10);
    const partPath = getSanitizedPartPath(fingerprint);

    let currentSize = 0;
    if (fs.existsSync(partPath)) {
      try {
        currentSize = fs.statSync(partPath).size;
      } catch (err) {}
    }

    if (offset !== currentSize) {
      return res.status(409).json({
        success: false,
        error: 'Offset mismatch',
        expectedOffset: currentSize,
        actualOffset: offset,
      });
    }

    const writeStream = fs.createWriteStream(partPath, { flags: 'a', highWaterMark: 2 * 1024 * 1024 });

    req.pipe(writeStream);

    writeStream.on('finish', () => {
      try {
        const newSize = fs.statSync(partPath).size;
        console.log(`[GameVault Ingest] Chunk offset ${offset} written (file now ${newSize} bytes)`);
        return res.json({ success: true, offset: newSize });
      } catch (e) {
        return res.json({ success: true, offset: currentSize });
      }
    });

    writeStream.on('error', (err) => {
      console.error('[Upload Stream Error]:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    req.on('close', () => {
      if (!req.readableEnded) {
        try { req.unpipe(writeStream); } catch (_) {}
        writeStream.destroy();
      }
    });

    req.on('error', (err) => {
      console.error('[Upload Request Error]:', err);
      try { req.unpipe(writeStream); } catch (_) {}
      writeStream.destroy();
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
  });

  // Delete / cancel upload chunk file
  server.delete('/api/upload/chunk', (req, res) => {
    const fingerprint = req.query.fingerprint;
    if (!fingerprint) {
      return res.status(400).json({ success: false, error: 'Missing fingerprint parameter' });
    }
    const partPath = getSanitizedPartPath(fingerprint);
    if (fs.existsSync(partPath)) {
      try {
        fs.unlinkSync(partPath);
      } catch (err) {}
    }
    return res.json({ success: true });
  });

  // 3. Pass all other web traffic to Next.js catch-all (Express 5 compatible)
  server.use((req, res) => {
    return handle(req, res);
  });

  const httpServer = server.listen(port, '0.0.0.0', (err) => {
    if (err) throw err;
    console.log(`> GameVault Direct Chunk Streaming Engine ready on http://0.0.0.0:${port}`);
  });
  httpServer.keepAliveTimeout = 65000;
  httpServer.headersTimeout = 66000;
});
