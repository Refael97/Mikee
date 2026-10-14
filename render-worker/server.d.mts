export const SAFE_PATH: RegExp;
export function authorized(header: string | undefined): boolean;
export function checkProject(body: unknown): string | null;
export const server: import("node:http").Server;
