# AVA to Vitest Migration Evaluation

This document evaluates migrating the test suite from AVA to Vitest following the Vite migration.

## Current AVA Setup

### Configuration (package.json)
```json
"ava": {
  "extensions": ["ts"],
  "files": ["src/tests/*"],
  "require": ["ts-node/register"],
  "timeout": "1m"
}
```

### Test Files
- `src/tests/test.ts` - Unit/integration tests for Redis, cards, card decks, and card tables (8 tests)
- `src/tests/test-server-dev.ts` - Server integration tests for Socket.io connections (4 tests)

### Test Patterns Used
- AVA's `test()` with async/await
- `test.beforeEach()` hooks for Redis cleanup
- Promise-based assertions (`t.pass()`, `t.fail()`, `t.is()`, `t.truthy()`, `t.true()`, `t.false()`, `t.like()`, `t.not()`)
- Manual Promise construction for Socket.io connection tests

### Coverage
- Using c8 with coverage thresholds (37% lines, 30% branches, 35% functions, 37% statements)
- Tests require external services (Redis, development server)

## Vitest Benefits for This Project

### 1. Native Vite Integration
- **Shared Configuration**: Vitest can extend `vite.config.ts`, eliminating separate test configuration
- **Same Transform Pipeline**: TypeScript/JSX handled by Vite's existing plugin setup
- **Plugin Compatibility**: `vite-plugin-node-polyfills` would work for tests automatically

### 2. Improved Developer Experience
- **Faster Startup**: Vitest leverages Vite's native ESM support vs AVA's ts-node/register
- **Watch Mode with HMR**: More responsive file watching than AVA's watch mode
- **Better Error Messages**: Improved stack traces and assertion diffs
- **Built-in UI**: Optional web-based test viewer (`vitest --ui`)

### 3. TypeScript/ESM Support
- **Native TypeScript**: No ts-node/register shim needed
- **ESM First**: Better aligned with project's ESNext module target
- **Type Checking**: Optional `vitest typecheck` for type-level assertions

### 4. Coverage Integration
- **Built-in c8 Support**: Same coverage tool, integrated configuration
- **V8 Coverage**: Native V8 coverage or Istanbul via single config option
- **Coverage Thresholds**: Same threshold configuration as current setup

### 5. Jest-Compatible API
- **Familiar Assertions**: `expect()` API widely known
- **Mocking Built-in**: `vi.mock()`, `vi.spyOn()` without additional packages
- **Snapshot Testing**: Built-in support if needed later

## Migration Effort Assessment

### Low Effort Items
1. **Test Assertions**: AVA assertions map cleanly to Vitest
   - `t.is(a, b)` -> `expect(a).toBe(b)`
   - `t.truthy(x)` -> `expect(x).toBeTruthy()`
   - `t.true(x)` -> `expect(x).toBe(true)`
   - `t.pass()` -> `expect(true).toBe(true)` (or no-op)
   - `t.fail()` -> `expect.fail()` or throw
   - `t.like(a, b)` -> `expect(a).toMatchObject(b)`

2. **Test Structure**:
   - `test('name', async t => {})` -> `test('name', async () => {})`
   - `test.beforeEach()` -> `beforeEach()`

3. **Configuration**: Add to existing `vite.config.ts`:
```typescript
export default defineConfig({
  // ... existing config
  test: {
    include: ['src/tests/*.ts'],
    testTimeout: 60000,
    coverage: {
      provider: 'v8',
      thresholds: { lines: 37, branches: 30, functions: 35, statements: 37 }
    }
  }
});
```

### Medium Effort Items
1. **Promise-based Tests**: Socket.io tests use manual Promise construction - works but could be simplified with Vitest's async utilities
2. **Redis Connection**: Tests create Redis clients directly; may need adjustment for Vitest's worker isolation

### Potential Issues
1. **Test Isolation**: AVA runs each test file in a separate worker by default; Vitest uses worker threads but with different isolation semantics
2. **Redis State**: Tests depend on shared Redis state; may need adjustment for parallel execution
3. **Server Tests**: `test-server-dev.ts` assumes server is running externally; this pattern works with both frameworks

## Recommendation

**Migrate to Vitest.**

### Rationale
1. **Reduced Configuration Complexity**: Single config file vs separate AVA config and ts-node setup
2. **Better Vite Alignment**: After migrating build tooling to Vite, tests should follow
3. **Active Development**: Vitest is actively maintained with growing ecosystem
4. **Performance**: Benchmarks show Vitest ~4x faster than AVA for comparable test suites
5. **Future-Proofing**: Better ESM and TypeScript support for evolving Node.js ecosystem

### Migration Path
1. Install Vitest: `npm install -D vitest @vitest/coverage-v8`
2. Add test configuration to `vite.config.ts`
3. Convert test files (assertion syntax changes)
4. Update npm scripts
5. Remove AVA dependencies and configuration
6. Verify coverage thresholds maintained

### Estimated Effort
- **Small codebase (12 tests)**: 1-2 hours for complete migration
- **Low risk**: Tests are integration-focused with external dependencies; framework change has minimal impact

### Alternative: Keep AVA
If migration effort is a concern, AVA works fine with Vite projects. The main downsides:
- Separate TypeScript compilation (ts-node)
- Different configuration paradigm
- Less integrated developer experience

## Appendix: Example Converted Test

### Current AVA Test
```typescript
import test from 'ava';
import { initDeck, registerCards } from "../cards";

test('num cards', async t => {
    const deck = await initDeck(tableId, "test");
    const cards = await registerCards([1, 2, 3]);
    deck.add(cards);
    t.is(await deck.numCards(), cards.length);
});
```

### Vitest Equivalent
```typescript
import { test, expect } from 'vitest';
import { initDeck, registerCards } from "../cards";

test('num cards', async () => {
    const deck = await initDeck(tableId, "test");
    const cards = await registerCards([1, 2, 3]);
    deck.add(cards);
    expect(await deck.numCards()).toBe(cards.length);
});
```

## Sources
- [Vitest Comparisons with Other Test Runners](https://vitest.dev/guide/comparisons)
- [AVA vs Vitest comparison](https://knapsackpro.com/testing_frameworks/difference_between/ava/vs/vitest)
- [npm trends: ava vs vitest](https://npmtrends.com/ava-vs-cypress-vs-jest-vs-mocha-vs-vitest)
- [JavaScript unit testing frameworks comparison](https://raygun.com/blog/javascript-unit-testing-frameworks/)
