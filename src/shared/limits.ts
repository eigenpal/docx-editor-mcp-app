/**
 * The largest document this app opens or saves. Both halves enforce it: the
 * server refuses bigger files, and the widget checks before it sends a save.
 *
 * A document crosses the host as one base64 message (4/3 of its size). The
 * MCP TypeScript SDK client closes a stdio connection on any message over
 * 10 MiB (`STDIO_DEFAULT_MAX_BUFFER_SIZE`), and a host that keeps that default
 * loses the plugin for the session. 7 MiB stays under it with the envelope;
 * a 12 MB file through the SDK client closed the connection. Raising this
 * needs chunked transfer, not a bigger number.
 */
export const MAX_CONTENT_BYTES = 7 * 1024 * 1024;

/** A byte limit as people read it: `7 MB`, `1.5 MB`, or `512 bytes`. */
export const formatLimit = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${bytes} bytes` : `${Number((bytes / 1024 / 1024).toFixed(1))} MB`;

/**
 * The largest message the server reads. Over stdio the SDK closes the
 * transport, and the server exits, on anything larger. It is well above a
 * whole document at the cap (base64 is 4/3 of it), so an oversized save
 * reaches `write` and gets a `too-large` answer instead of ending the server.
 */
export const MAX_MESSAGE_BYTES = 32 * 1024 * 1024;
