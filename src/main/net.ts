import { net } from 'electron';

/**
 * fetch backed by Chromium's network stack. Unlike Node's built-in fetch it honours the Windows
 * proxy settings and trusted certificate store, which matters on corporate networks.
 */
export const netFetch = ((input: any, init?: any) => net.fetch(input, init)) as typeof fetch;
