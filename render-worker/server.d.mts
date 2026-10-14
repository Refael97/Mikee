export const SAFE_PATH: RegExp;
export function authorized(header: string | undefined): boolean;
export function checkDuration(value: unknown): string | null;
export function receiveProject(stream: AsyncIterable<Uint8Array> | Iterable<Uint8Array>, dir: string): Promise<string[]>;
export const server: import("node:http").Server;
