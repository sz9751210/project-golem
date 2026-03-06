/**
 * 🌉 CDP Proxy - 跨維度偵獄中繼站
 * 
 * 解決 Mac 版 Chrome 即使設定 --remote-debugging-address=0.0.0.0 
 * 依然可能只聽 127.0.0.1 的問題。
 */
const net = require('net');

const LISTEN_PORT = 9222;
const TARGET_PORT = 9221;
const TARGET_HOST = '127.0.0.1';

const server = net.createServer((socket) => {
    console.log(`🔌 [CDP Proxy] New connection from ${socket.remoteAddress}`);

    const client = net.createConnection(TARGET_PORT, TARGET_HOST, () => {
        socket.pipe(client);
        client.pipe(socket);
    });

    client.on('error', (err) => {
        console.error('❌ [CDP Proxy] Target Error:', err.message);
        socket.destroy();
    });

    socket.on('error', (err) => {
        console.error('❌ [CDP Proxy] Client Error:', err.message);
        client.destroy();
    });

    socket.on('close', () => client.end());
    client.on('close', () => socket.end());
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
    console.log(`🚀 [CDP Proxy] Tunnel active: 0.0.0.0:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`);
});
