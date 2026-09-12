/** Offline usernames: [A-Za-z0-9_], <=16 chars. prefix + random digits, id keeps them distinct. */
export function makeUsername(prefix: string, id: number): string {
  const suffix = `${id}_${Math.floor(Math.random() * 9000 + 1000)}`;
  const room = 16 - suffix.length;
  const p = prefix.replace(/[^A-Za-z0-9_]/g, "").slice(0, Math.max(0, room));
  return `${p}${suffix}`.slice(0, 16);
}
