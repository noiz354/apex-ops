# Apex Ops

Aplikasi CMMS (*Computerized Maintenance Management System*) untuk operasional
fasilitas — work order, service request, aset, inventory, inspeksi, purchasing,
dan audit trail dalam satu dashboard.

## Mulai cepat

```bash
npm ci
npm run db:setup
npm run dev
```

Buka http://localhost:3000 lalu login dengan akun demo:

| Email | Password |
|---|---|
| `m.vance@apexops.io` | `demo-pass-4821` |

Login memakai MFA (TOTP). Di mode demo, kode MFA ditampilkan sebagai
*dev hint* setelah password benar — cukup ketik kode itu. Di produksi,
gunakan aplikasi authenticator.

Atau via Docker (satu perintah):

```bash
docker compose up --build
```

Buka http://localhost:3817 dengan kredensial yang sama.

## Yang ada di dalam

- **Work Order** — buat, assign, start, hold, resume, complete, lengkap dengan
  guard optimistik dan jejak audit per transisi.
- **Service Request** — tiket permintaan yang bisa di-convert menjadi WO
  secara atomik (convert ganda ditolak).
- **Aset & Fasilitas** — direktori aset, dossier, hierarki fasilitas.
- **Inventory & Purchasing** — stok (receive/issue dengan guard stok negatif),
  PR → PO → goods receipt → invoice, vendor.
- **Inspeksi & Findings** — eksekusi inspeksi lapangan, temuan bisa
  di-convert menjadi WO.
- **Preventive Maintenance** — jadwal PM dan pembangkitan WO.
- **Auth & akses** — password hashing, sesi, TOTP MFA, rate limit, dan
  RBAC 6 peran (Enterprise Admin … Read-Only Auditor).
- **Audit trail** — log append-only dengan hash-chain yang bisa diverifikasi.

## Perintah berguna

```bash
npm test        # unit + integration tests
npm run typecheck
npm run lint
npm run db:reset   # reset + seed ulang database lokal
```

## Catatan

- Data seed (termasuk password demo di atas) hanya untuk pengembangan/demo —
  jangan dipakai di produksi.
- Variabel lingkungan: salin `.env.example` ke `.env` bila perlu
  menyesuaikan konfigurasi lokal.
