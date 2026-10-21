import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:5188" },
  webServer: {
    command: "pnpm exec vite --port 5188",
    url: "http://localhost:5188",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: "https://waitlist-test.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-public-key",
    },
  },
});
