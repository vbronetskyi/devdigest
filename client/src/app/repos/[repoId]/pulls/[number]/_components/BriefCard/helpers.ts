/** `path`, `path:line` or `path:start-end` → where to open it (the same rule the server grounds with). */
export function refTarget(ref: string): { file: string; line: number | null } {
  const m = ref.match(/^(.*):(\d+)(?:-\d+)?$/);
  return m ? { file: m[1]!, line: Number(m[2]) } : { file: ref, line: null };
}
