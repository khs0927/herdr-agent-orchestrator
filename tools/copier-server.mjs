#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4789;
const HTML_FILE = process.env.COPIER_HTML_FILE || path.join(__dirname, '../ui/ai-team-copier.html');

const paneMap = {
  opencode: 'w1:p1',
  aside: 'w1:p2',
  codex: 'w1:p3',
  agy: 'w1:p4',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(HTML_FILE, 'utf8'));
    return;
  }

  if (url.pathname === '/api/read') {
    const target = url.searchParams.get('target') || 'opencode';
    const pane = paneMap[target] || 'w1:p1';
    let output = '';
    try {
      output = execSync(`herdr pane read "${pane}" --lines 60`, { encoding: 'utf8' });
      // clean output
      output = output.replace(/\x1b\[[0-9;]*m/g, '').trim();
    } catch (e) {
      output = '(출력을 읽어오는 중 에러 발생)';
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ target, pane, text: output }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`AI Team Copier GUI server running on http://127.0.0.1:${PORT}`);
});
