# AGENTS.md — Aturan Kerja Proyek Inovasi UNINUS

Dokumen ini adalah aturan kerja untuk setiap agent AI (Claude Code, dan lainnya) yang bekerja di folder `inovasi-uninus/`. Perbarui dokumen ini bila aturan berubah, dan jangan menyimpang diam-diam.

> **Cakupan:** Folder ini adalah proyek **terpisah** dari situs statis/PHP CMS di folder induk (`../CLAUDE.md`). Aturan di `../CLAUDE.md` (PHP CMS, Bootstrap, Apps Script) **tidak berlaku** di sini. Bila ada konflik, `AGENTS.md` ini yang menang.

## 1. Komunikasi

- Semua komunikasi dengan pengguna (penjelasan, laporan progres, pertanyaan, dokumentasi, pesan error yang ditampilkan ke pengguna akhir) wajib **Bahasa Indonesia**.
- Istilah teknis boleh Bahasa Inggris bila lebih tepat (mis. *migration*, *middleware*, *endpoint*).
- Nama variabel, fungsi, tabel, dan kode ditulis dalam Bahasa Inggris. Teks UI dan konten publik dalam Bahasa Indonesia (`lang="id"`).
- Jangan menyetujui ide pengguna begitu saja. Beri kritik dan alternatif disertai alasan teknis bila ada pendekatan yang lebih baik.
- Jangan mengambil keputusan penting berdasarkan asumsi. Catat sebagai *open question* di `docs/DECISIONS.md`, lalu konfirmasi ke pengguna.
- Mode "caveman" **tidak** aktif secara default. Gunakan hanya bila pengguna memintanya, dan tetap dalam Bahasa Indonesia.

## 2. Metodologi: Documentation-First, Bertahap

Urutan fase, tidak boleh dilompati tanpa persetujuan eksplisit:

0. Repository Audit → 1. Discovery → 2. Product Documentation → 3. System Architecture → 4. UI/UX Design → 5. Development → 6. Testing & QA → 7. Deployment Preparation.

- **Dilarang menulis kode implementasi sebelum Fase 0–4 selesai dan disetujui pengguna.**
- Setiap akhir fase: presentasikan hasil, minta persetujuan, baru lanjut.
- Setiap modul pada Fase 5 harus dapat diuji sebelum pindah ke modul berikutnya.
- Jangan mengklaim fitur selesai bila belum diuji. Laporkan hasil tes apa adanya, termasuk yang gagal.

## 3. Struktur Proyek (rencana, belum final)

Struktur final ditentukan di Fase 3 dan dicatat di `docs/SYSTEM_ARCHITECTURE.md`. Sampai itu disetujui, jangan membuat struktur kode.

```
inovasi-uninus/
├── AGENTS.md
├── README.md
├── docs/            PRD, arsitektur, database, API, UI/UX, role, workflow,
│                    deployment, security, testing, decisions
├── brand/           Aset identitas (logo), sumber kebenaran
├── .claude/skills/  Skill proyek (lihat §11)
└── (kode aplikasi — baru dibuat setelah Fase 4 disetujui)
```

Folder `opencode/` adalah tooling bawaan, bukan bagian aplikasi. Jangan diubah atau dihapus.

## 4. Teknologi

Stack di bawah adalah **rekomendasi awal, belum disetujui**. Jangan mengubah atau memasang dependensi utama tanpa persetujuan.

- Frontend: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, Lucide Icons.
- Backend: Node.js, Fastify, TypeScript, REST API.
- Database: PostgreSQL. ORM (Prisma atau Drizzle) dipilih di Fase 3 lewat evaluasi tertulis di `docs/DECISIONS.md`.
- Auth: session atau token yang aman, RBAC fleksibel (role baru tidak boleh memaksa perubahan arsitektur).
- Storage: S3-compatible atau sesuai infrastruktur UNINUS (menunggu keputusan hosting).
- Testing: unit, integration, E2E.
- Hindari *overengineering*. Prioritaskan *maintainability* dan *scalability*.

## 5. Coding & Naming Conventions

- TypeScript `strict`. Dilarang `any` tanpa komentar alasan.
- File dan folder: `kebab-case`. Komponen React: `PascalCase`. Variabel/fungsi: `camelCase`. Konstanta: `UPPER_SNAKE_CASE`.
- Tabel dan kolom database: `snake_case`, tabel jamak (`innovations`), primary key UUID, wajib `created_at` dan `updated_at`.
- Endpoint REST: kata benda jamak, huruf kecil (`/api/v1/innovations`). Format response konsisten dan didokumentasikan di `docs/API_DOCUMENTATION.md`.
- URL publik ramah SEO dan berbasis slug (`/inovasi/{slug}`).
- Satu fungsi satu tanggung jawab. Komentar hanya untuk menjelaskan *mengapa*, bukan *apa*.
- Ikuti gaya kode yang sudah ada. Jangan refactor di luar lingkup tugas.

## 6. Keamanan (wajib)

- Validasi semua input di sisi server (schema validation). Query hanya lewat ORM atau prepared statement.
- Password di-hash dengan algoritma modern (argon2id atau bcrypt). Dilarang menyimpan atau mencatat password polos.
- Secret hanya lewat environment variable. Jangan commit `.env`; sediakan `.env.example` tanpa nilai asli.
- Setiap endpoint sensitif wajib punya authorization (RBAC). Cek di server, bukan hanya di UI.
- Proteksi: XSS, CSRF (bila memakai cookie auth), rate limiting, cookie `HttpOnly`/`Secure`/`SameSite`.
- Upload: batasi ukuran, validasi MIME dan ekstensi, ubah nama file, simpan di luar web root, pindai bila memungkinkan.
- Pesan error ke klien tidak boleh membocorkan detail internal. Perubahan data penting dicatat di audit log.
- Jangan pernah membaca, menyalin, atau menulis ulang file kredensial di folder induk (mis. `user password.txt`, `akun-akun website wisuda.txt`). File itu bukan bagian proyek ini.

## 7. Data & Konten

- **Dilarang** mengarang nama dosen, hasil penelitian, nomor HKI/paten, atau informasi akademik apa pun.
- Data dummy hanya untuk development, harus jelas ditandai (mis. awalan `[DUMMY]`), dan dipisah dari seed produksi.
- Field inovasi tidak semuanya wajib. Jangan memaksa data yang mungkin belum tersedia.
- Jangan membuat tombol atau fitur yang hanya dekorasi. Setiap form punya validasi, setiap API punya error handling.

## 8. Testing

- Unit test untuk logika bisnis (terutama transisi status workflow dan RBAC).
- Integration test untuk API dan database. E2E test untuk alur utama (katalog, detail, pengajuan, verifikasi).
- Authorization test wajib: pastikan setiap role ditolak pada resource yang bukan haknya.
- Cek aksesibilitas (target WCAG 2.2 AA) dan responsif (desktop, tablet, mobile) sebelum UI dinyatakan selesai.
- Bug fix harus disertai test yang mereproduksi bug tersebut.

## 9. Dokumentasi

Dokumen wajib (dibuat bertahap sesuai fase, bukan sekaligus):

`README.md`, `AGENTS.md`, `docs/PRD.md`, `docs/SYSTEM_ARCHITECTURE.md`, `docs/DATABASE_DESIGN.md`, `docs/API_DOCUMENTATION.md`, `docs/UI_UX_GUIDELINES.md`, `docs/USER_ROLES.md`, `docs/WORKFLOW.md`, `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, `docs/TESTING.md`, `docs/DECISIONS.md`.

- Dokumentasi harus mencerminkan implementasi sebenarnya. Setiap perubahan arsitektur memperbarui dokumen terkait **dalam perubahan yang sama**.
- `docs/DECISIONS.md` memuat keputusan (ADR singkat: konteks, opsi, keputusan, alasan) dan daftar *open questions*.

## 10. Git Workflow

- Repositori belum diinisialisasi. Jangan menjalankan `git init`, commit, atau push tanpa diminta pengguna.
- Setelah aktif: branch per fitur (`feat/…`, `fix/…`, `docs/…`), tidak commit langsung ke `main`.
- Pesan commit mengikuti Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), ditulis ringkas dan jelas.
- Laporkan perubahan file beserta alasannya secara berkala.

## 11. Penggunaan Skills & Subagents

Periksa dulu apa yang benar-benar tersedia. **Jangan mengarang skill atau tool yang tidak ada.**

Skill terpasang di proyek (`.claude/skills/`):
- `ui-ux-pro-max` — Fase 4 (design system, palet, tipografi, wireframe) dan review UI di Fase 5–6.
- `caveman*` — hanya bila pengguna meminta gaya ringkas atau pesan commit ringkas.

Skill bawaan lingkungan yang relevan per fase:

| Fase | Skill |
|---|---|
| 1–3 Analisis & arsitektur | `anthropic-skills:senior-architect`, `anthropic-skills:cs-fullstack-engineer`, `anthropic-skills:docs` |
| 3 Database & API | `anthropic-skills:engineering-advanced-skills` (database-designer, api-design-reviewer) |
| 4 UI/UX | `ui-ux-pro-max`, `design:design-system`, `design:design-critique`, `design:ux-copy`, `design:design-handoff` |
| 5 Backend | `anthropic-skills:senior-backend` |
| 5 Frontend | `anthropic-skills:senior-frontend` |
| 5–6 Keamanan | `security-review`, `anthropic-skills:senior-security`, `anthropic-skills:ai-security` (bila ada fitur AI) |
| 6 Testing | `anthropic-skills:senior-qa`, `design:accessibility-review` |
| 5–6 Review kode | `code-review`, `simplify` |

Aturan:
- Pilih skill sesuai tugas, jangan memakai semuanya sekaligus.
- Skill `claude-seo` belum terpasang (butuh `/plugin`, yang tidak tersedia di sesi non-interaktif). Sampai terpasang, SEO dikerjakan manual mengacu §10 di master prompt.
- Gunakan subagent hanya untuk pekerjaan independen yang bisa diparalelkan, dan hanya bila pengguna menyetujuinya.

## 12. Larangan

Tanpa alasan kuat dan persetujuan eksplisit pengguna, dilarang:
- Mengubah stack utama atau konfigurasi penting (build, lint, TypeScript, CI, environment, deployment).
- Menghapus atau menimpa file/data yang sudah ada.
- Melakukan deployment atau menyentuh server produksi.
- Menambah fitur di luar kebutuhan yang telah disepakati.
- Mengirim data proyek ke layanan eksternal.

<!-- BEGIN:nextjs-agent-rules -->

## Next.js di proyek ini bukan Next.js yang Anda hafal

Versi ini (16.x) punya perubahan API dan konvensi. Baca panduan terkait di `node_modules/next/dist/docs/` sebelum menulis kode Next.js, dan perhatikan peringatan deprecation. `cacheComponents` aktif: akses data runtime (cookies, headers) harus di dalam batas `Suspense`, dan cache memakai `use cache` + `cacheTag`.

Blok ini dibuat dan ditambahkan kembali oleh `next dev`; biarkan tetap ada di commit supaya pohon kerja bersih.

<!-- END:nextjs-agent-rules -->
