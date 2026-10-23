import { z } from 'zod';

export const UPDATE_RESOURCE = 'docx-app://updates';
export const RELEASES_URL = 'https://github.com/eigenpal/docx-editor-mcp-app/releases';
export const UPDATE_API =
  'https://api.github.com/repos/eigenpal/docx-editor-mcp-app/releases/latest';
export const StableVersion = z
  .string()
  .max(64)
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
export const UpdateInfo = z.object({
  current: StableVersion,
  latest: StableVersion.nullable(),
});
export type UpdateInfo = z.infer<typeof UpdateInfo>;

export function isNewer(candidate: string, current: string): boolean {
  if (!StableVersion.safeParse(candidate).success || !StableVersion.safeParse(current).success)
    return false;
  const left = candidate.split('.').map(BigInt);
  const right = current.split('.').map(BigInt);
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}
