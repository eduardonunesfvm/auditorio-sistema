const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" }
    },
    {
      name: "edge",
      use: { ...devices["Desktop Edge"], channel: "msedge" }
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] }
    }
  ],
  webServer: {
    command: "python -m http.server 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 30000
  }
});
