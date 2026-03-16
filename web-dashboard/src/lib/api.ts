// detect production environment for static export optimization
const isProd = process.env.NODE_ENV === 'production';
// Default to localhost:3001 for dev if no env var is set, but use relative path for production
const API_BASE = process.env.NEXT_PUBLIC_API_URL || (isProd ? "" : "http://localhost:3001");

export function apiUrl(path: string): string {
    // In production static export, we default to relative paths to avoid port/hostname issues
    // on different platforms (Windows/Linux/Mac).
    if (isProd && !process.env.NEXT_PUBLIC_API_URL) {
        return path;
    }
    
    // In dev, use the base (which defaults to localhost:3001)
    return `${API_BASE}${path}`;
}
