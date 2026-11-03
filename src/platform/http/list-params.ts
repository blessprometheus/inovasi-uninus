type RawParam = string | string[] | undefined;

function pickFirst(v: RawParam): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Parameter daftar publik (?q=&page=) dari URL: tidak dipercaya, jadi dipangkas dan dinormalkan. */
export function parseListParams(params: { q?: RawParam; page?: RawParam }) {
  const q = pickFirst(params.q)?.trim().slice(0, 100) || undefined;
  const requested = Number.parseInt(pickFirst(params.page) ?? "1", 10);
  const page = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 10_000) : 1;
  return { q, page };
}
