import { defineConfig, devices } from '@playwright/test'

// The editor in real browsers: typing, IME and the clipboard are not what a
// simulated DOM shows. Chromium takes the EditContext path, WebKit and
// Firefox the textarea fallback.
export default defineConfig({
  testDir: 'tests/browser',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:5179', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm exec vite --port 5179 --strictPort',
    url: 'http://localhost:5179/tests/browser/page.html',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
})
