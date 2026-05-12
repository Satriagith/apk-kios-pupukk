# Kios Pupuk Tani Makmur - Fullstack MongoDB Local

Aplikasi fullstack berbasis Node.js, Express, EJS, dan MongoDB local untuk mengelola kios pupuk jarak jauh.

## Fitur terbaru
- Login manual dan login sentuhan
- Role admin dan operator
- Dashboard dark UI
- Manajemen stok pupuk
- Penjualan dengan validasi stok ketat
- Modul pembelian / restok supplier
- Piutang tempo
- Laporan harian dan bulanan
- Export laporan ke PDF
- Export laporan ke Excel
- Edit dan hapus data penting
- Batas stok minimum untuk peringatan restok

## Database local
Gunakan MongoDB local:
`mongodb://127.0.0.1:27017/kios_pupuk_tani_makmur`

## Cara menjalankan
1. Install MongoDB Community Server dan nyalakan servicenya.
2. Salin `.env.example` menjadi `.env`.
3. Jalankan:
```bash
npm install
npm run seed
npm run dev
```
4. Buka `http://localhost:3000`
5. Masuk ke menu laporan lalu klik tombol Export Excel atau Export PDF.

## Akun awal
- admin / 123456
- ibu / 123456

## Struktur koleksi
- users
- products
- sales
- purchases
- debts
