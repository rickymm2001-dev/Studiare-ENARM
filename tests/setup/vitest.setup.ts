// Matchers de Testing Library (toBeInTheDocument, toHaveTextContent y demás)
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
