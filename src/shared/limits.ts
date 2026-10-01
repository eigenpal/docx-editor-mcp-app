/**
 * The largest document this app opens or saves. Both halves enforce it: the
 * server refuses bigger files, and the widget checks before it sends a save.
 */
export const MAX_CONTENT_BYTES = 15 * 1024 * 1024;

/**
 * The largest MCP message: a whole document as base64 (4/3 of the cap) plus
 * the envelope. Over stdio the SDK closes the transport, and the server exits,
 * on anything larger, so both transports are sized to this.
 */
export const MAX_MESSAGE_BYTES = Math.ceil((MAX_CONTENT_BYTES * 4) / 3) + 1024 * 1024;
