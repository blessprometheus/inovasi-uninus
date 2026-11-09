import { randomBytes } from "node:crypto";
import argon2 from "argon2";

/**
 * Argon2id dengan parameter minimum rekomendasi OWASP (19 MiB, 2 iterasi, 1 jalur). Server ini
 * dipakai bersama situs lain dan sudah padat (OQ-01), jadi memori per hash sengaja dijaga kecil.
 * Parameter ikut tertanam di hash, sehingga menaikkannya nanti tidak mematahkan hash lama.
 */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

/** False untuk hash rusak atau format tak dikenal; tidak pernah melempar karena input pengguna. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Hash palsu yang valid. Dipakai agar login untuk email yang tidak ada (atau akun terkunci) memakan
 * waktu sebesar login sungguhan, sehingga waktu respons tidak membocorkan email mana yang terdaftar.
 */
export function verifyAgainstDummy(password: string): Promise<boolean> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash.then((h) => verifyPassword(h, password));
}

const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Kata sandi sementara untuk akun baru atau yang diatur ulang super admin. 16 karakter dari alfabet
 * tanpa karakter membingungkan (l, I, 1, O, 0), diundi dengan rejection sampling supaya tanpa bias.
 */
export function generateTemporaryPassword(length = 16): string {
  const limit = 256 - (256 % TEMP_ALPHABET.length);
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < limit && out.length < length) out += TEMP_ALPHABET[byte % TEMP_ALPHABET.length];
    }
  }
  return out;
}
