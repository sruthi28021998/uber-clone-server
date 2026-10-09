export const toNum = (v) =>
  v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);