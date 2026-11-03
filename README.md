# Inovasi UNINUS

Katalog digital hasil penelitian dan inovasi dosen Universitas Islam Nusantara. Domain target: `inovasi.uninus.ac.id`.

**Status:** Fase 0–4 disetujui. Fase 5 (Development) berjalan: setup proyek Next.js selesai, berikutnya database dan autentikasi.

## Mulai dari sini

| Dokumen | Isi |
|---|---|
| [AGENTS.md](AGENTS.md) | Aturan kerja (bahasa, fase, keamanan, git, skill) |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Keputusan (ADR) dan open questions |
| [docs/PRD.md](docs/PRD.md) | Kebutuhan produk |
| [docs/SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md) | Arsitektur |
| [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md) | ERD dan skema |
| [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) | Kontrak API |
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | Alur verifikasi |
| [docs/USER_ROLES.md](docs/USER_ROLES.md) | RBAC |
| [docs/UI_UX_GUIDELINES.md](docs/UI_UX_GUIDELINES.md) | Design system dan wireframe |
| [docs/SECURITY.md](docs/SECURITY.md) | Keamanan |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment |

Dokumen `docs/TESTING.md` dibuat di awal Fase 5.

## Stack (disetujui)

Next.js (App Router) + TypeScript, Tailwind CSS + shadcn/ui, PostgreSQL + Drizzle ORM, login lewat SSO UNINUS (OIDC).

## Menjalankan secara lokal

Prasyarat: Node.js 24 (LTS terbaru) dan npm.

```bash
npm ci
cp .env.example .env.local
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
npm run build
```
