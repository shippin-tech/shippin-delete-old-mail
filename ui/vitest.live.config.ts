import { defineConfig } from 'vitest/config';

// Checks against the running local stack (deploy/local), not mocks. Run: npm run test:contract-live
export default defineConfig({
	test: {
		include: ['test-live/**/*.test.ts'],
		environment: 'node',
		testTimeout: 60_000
	}
});
