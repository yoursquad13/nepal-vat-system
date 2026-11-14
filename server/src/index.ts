import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { app } from './app.js';
import { env } from './config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In production, serve built client SPA assets
if (env.NODE_ENV === 'production') {
  let clientDistPath = path.resolve(__dirname, '../../client/dist');
  if (!fs.existsSync(clientDistPath)) {
    clientDistPath = path.resolve(process.cwd(), 'client/dist');
  }
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));

    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  } else {
    console.warn(`[server] Warning: Production mode enabled but client build not found at ${clientDistPath}`);
  }
}

const server = app.listen(env.PORT, () => {
  console.log(`[server] Nepal VAT System running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

export { server };
