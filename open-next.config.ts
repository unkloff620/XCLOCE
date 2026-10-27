import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every game page and API route is dynamic (no ISR), so no incremental cache store is needed.
export default defineCloudflareConfig({});
