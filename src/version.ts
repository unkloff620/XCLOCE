/** The release this code was built from (next.config.ts); "dev" locally. The server sends it with every API answer. */
export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
