'use strict';

const { WebSocketServer, OPEN } = require('ws');
const net = require('net');

const PORT = process.env.PORT || 3000;

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    ws.close(1008, 'Bad request');
    return;
  }

  const host = url.searchParams.get('host') || '';
  const port = parseInt(url.searchParams.get('port') || '1883', 10);

  if (!host || host.length > 253 || port < 1 || port > 65535) {
    ws.close(1008, 'Invalid host or port');
    return;
  }

  const tcp = net.createConnection({ host, port });

  // If the broker doesn't respond within 10 s, give up
  const connectTimeout = setTimeout(() => tcp.destroy(new Error('Connect timed out')), 10_000);
  tcp.once('connect', () => clearTimeout(connectTimeout));

  tcp.on('data', data => {
    if (ws.readyState === OPEN) ws.send(data);
  });

  tcp.on('close', () => {
    clearTimeout(connectTimeout);
    if (ws.readyState === OPEN) ws.close(1000, 'Broker closed connection');
  });

  tcp.on('error', err => {
    clearTimeout(connectTimeout);
    if (ws.readyState === OPEN) ws.close(1011, err.message);
  });

  ws.on('message', data => {
    if (!tcp.destroyed) tcp.write(Buffer.isBuffer(data) ? data : Buffer.from(data));
  });

  ws.on('close', () => {
    clearTimeout(connectTimeout);
    if (!tcp.destroyed) tcp.destroy();
  });

  ws.on('error', () => {
    clearTimeout(connectTimeout);
    if (!tcp.destroyed) tcp.destroy();
  });
});

console.log(`mqtt-proxy listening on port ${PORT}`);
