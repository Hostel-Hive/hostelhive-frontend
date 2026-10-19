import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

// Lazy route modules can take longer than the default one-second DOM wait on
// Windows and under coverage instrumentation. Keep assertions bounded while
// waiting for the actual visible UI, rather than inserting fixed sleeps.
configure({ asyncUtilTimeout: 5000 });

// Vitest globals are disabled, so Testing Library cannot install these hooks
// automatically. Match its React act setup using the explicitly imported hooks.
const actEnvironment = 'IS_REACT_ACT_ENVIRONMENT';
let previousActEnvironment: unknown;
beforeAll(() => {
  previousActEnvironment = Reflect.get(globalThis, actEnvironment);
  Reflect.set(globalThis, actEnvironment, true);
});
afterAll(() => {
  if (previousActEnvironment === undefined)
    Reflect.deleteProperty(globalThis, actEnvironment);
  else Reflect.set(globalThis, actEnvironment, previousActEnvironment);
});

afterEach(cleanup);
