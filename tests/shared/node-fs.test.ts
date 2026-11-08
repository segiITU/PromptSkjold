import { nodeFs } from '../../src/shared/node-fs';

describe('nodeFs', () => {
  it('returns Node fs under Jest without eval', () => {
    const fs = nodeFs();
    expect(typeof fs.readFileSync).toBe('function');
    expect(fs.existsSync(__filename)).toBe(true);
  });

  it('throws where there is no Node process (browser)', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'process');
    Object.defineProperty(globalThis, 'process', { value: undefined, configurable: true });
    try {
      expect(() => nodeFs()).toThrow('Node fs is not available');
    } finally {
      if (original) Object.defineProperty(globalThis, 'process', original);
    }
  });
});
