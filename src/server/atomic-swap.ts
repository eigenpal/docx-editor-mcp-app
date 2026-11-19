import { join } from 'node:path';
import { REPO_ROOT } from './paths.js';

type Binding = { swap(left: string, right: string): void };
let binding: Binding | undefined;

/** The native call exchanges both names without an intermediate missing path. */
export function swapFiles(left: string, right: string): void {
  if (!binding) {
    if (!['darwin', 'linux'].includes(process.platform)) {
      throw new Error('This system has no supported atomic file swap. Save a copy instead.');
    }
    const target = process.platform === 'darwin' ? 'darwin' : `linux-${process.arch}`;
    const module = { exports: {} as Binding };
    try {
      process.dlopen(module, join(REPO_ROOT, 'dist/native', `atomic-swap-${target}.node`));
      binding = module.exports;
    } catch (cause) {
      throw new Error('The atomic file swap module is unavailable. Save a copy instead.', {
        cause,
      });
    }
  }
  binding.swap(left, right);
}
