/**
 * Membuat super admin pertama (atau mengatur ulang sandinya) dari server.
 *
 * Pakai:  npm run admin:create -- --email nama@uninus.ac.id --name "Nama Lengkap" [--reset] [--temporary]
 * Dengan --temporary, sandi acak dibuat dan dicetak SEKALI, dan pemilik akun wajib menggantinya saat masuk pertama.
 * Kata sandi ditanyakan di terminal (tidak tampil saat diketik). Untuk otomasi, boleh lewat variabel
 * lingkungan ADMIN_PASSWORD, tetapi jangan simpan di riwayat shell atau berkas yang di-commit.
 * Target: DATABASE_URL. Jalankan `npm run db:migrate` dan `npm run db:seed` lebih dulu.
 */
import { createSuperAdmin } from "../src/modules/users/bootstrap";
import { generateTemporaryPassword } from "../src/platform/auth/password";
import { createDatabase } from "../src/platform/db/client";

// Dibuat dari kode karakter, bukan literal, supaya tidak hilang saat berkas disalin.
const CTRL_C = String.fromCharCode(3);
const DELETE = String.fromCharCode(127);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Membaca satu baris dari terminal tanpa menampilkan karakternya. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error("Bukan terminal interaktif. Isi ADMIN_PASSWORD sebagai gantinya."));
    process.stdout.write(question);
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (ch === CTRL_C) {
          process.stdin.setRawMode(false);
          process.stdout.write("\n");
          return reject(new Error("Dibatalkan."));
        }
        if (ch === DELETE || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diatur.");
  const email = arg("email");
  const name = arg("name");
  if (!email || !name) throw new Error('Pakai: npm run admin:create -- --email nama@uninus.ac.id --name "Nama Lengkap" [--reset]');

  const temporary = process.argv.includes("--temporary");
  let password = temporary ? generateTemporaryPassword() : process.env.ADMIN_PASSWORD;
  if (!password) {
    password = await promptHidden("Kata sandi (min. 12 karakter): ");
    const again = await promptHidden("Ulangi kata sandi: ");
    if (password !== again) throw new Error("Kedua kata sandi tidak sama.");
  }

  const { db, pool } = createDatabase(url, { max: 1 });
  try {
    const result = await createSuperAdmin(db, { email, name, password, reset: process.argv.includes("--reset"), temporary });
    if (!result.ok) throw new Error(result.message);
    console.log(result.created ? `Super admin dibuat: ${email}` : `Kata sandi diatur ulang: ${email}`);
    if (temporary) console.log(`Kata sandi sementara (tampil sekali, wajib diganti saat masuk): ${password}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
