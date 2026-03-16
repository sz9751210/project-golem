import { io } from "socket.io-client";

// detect production environment
const isProd = process.env.NODE_ENV === 'production';
// Default to current origin in prod, localhost:3001 in dev
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || (isProd ? "" : "http://localhost:3001");

export const socket = io(SOCKET_URL, {
    path: "/socket.io",
    autoConnect: true,
});
