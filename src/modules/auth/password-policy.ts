/**
 * Kebijakan kata sandi (docs/SECURITY.md, ADR-008). Fungsi murni tanpa dependensi, jadi formulir di
 * browser dan server memakai aturan yang persis sama. Server tetap memeriksa ulang.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Mengembalikan pesan Bahasa Indonesia bila ditolak, atau null bila diterima. */
export function checkPasswordPolicy(password: string, context: { email?: string; name?: string } = {}): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Kata sandi maksimal ${PASSWORD_MAX_LENGTH} karakter.`;
  if (password.trim() === "") return "Kata sandi tidak boleh hanya spasi.";
  if (new Set(password).size < 5) return "Kata sandi terlalu mudah ditebak. Gunakan lebih banyak karakter berbeda.";

  const lower = password.toLowerCase();
  const email = context.email?.toLowerCase();
  const local = email?.split("@")[0];
  if (email && lower === email) return "Kata sandi tidak boleh sama dengan email.";
  if (local && local.length >= 4 && lower.includes(local)) return "Kata sandi tidak boleh memuat bagian depan email Anda.";
  return null;
}
