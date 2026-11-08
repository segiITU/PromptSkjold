/**
 * Node's `fs`, for the Jest/Node test paths only. In the browser there is no `process.getBuiltinModule`,
 * so this throws and the callers' browser branch (chrome-extension:// URLs) is used instead.
 * Deliberately not `eval('require')`: the packaged extension should contain no `eval` call at all.
 */
export function nodeFs(): typeof import('fs') {
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  const fs = proc?.getBuiltinModule?.('fs') as typeof import('fs') | undefined;
  if (!fs) throw new Error('Node fs is not available in this runtime.');
  return fs;
}
