require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const User = require('./models/User');
const Product = require('./models/Product');
const Sale = require('./models/Sale');
const Debt = require('./models/Debt');
const Purchase = require('./models/Purchase');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/kios_pupuk_tani_makmur';

mongoose.connect(MONGO_URI).then(()=>console.log('MongoDB connected')).catch(err=>console.error(err));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'kios-pupuk-rahasia',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));
app.use(async (req, res, next) => {
  res.locals.currentUser = null;
  if (req.session.userId) res.locals.currentUser = await User.findById(req.session.userId);
  next();
});
const ensureAuth = (req, res, next) => req.session.userId ? next() : res.redirect('/login');
const ensureAdmin = async (req, res, next) => {
  if (!req.session.userId) return res.redirect('/login');
  const user = await User.findById(req.session.userId);
  if (!user || user.role !== 'admin') return res.status(403).send('Akses ditolak');
  next();
};
const renderWithMessage = async (res, view, payload = {}) => res.render(view, { error: null, success: null, ...payload });
const rupiah = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const reportData = async () => {
  const today = new Date();
  const startDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const dailySales = await Sale.aggregate([{ $match: { createdAt: { $gte: startDay, $lt: endDay } } }, { $group: { _id: null, total: { $sum: '$totalAmount' }, qty: { $sum: '$quantity' } } }]);
  const monthlySales = await Sale.aggregate([{ $match: { createdAt: { $gte: startMonth, $lt: endMonth } } }, { $group: { _id: null, total: { $sum: '$totalAmount' }, qty: { $sum: '$quantity' } } }]);
  const dailyPurchases = await Purchase.aggregate([{ $match: { createdAt: { $gte: startDay, $lt: endDay } } }, { $group: { _id: null, total: { $sum: '$totalCost' }, qty: { $sum: '$quantity' } } }]);
  const monthlyPurchases = await Purchase.aggregate([{ $match: { createdAt: { $gte: startMonth, $lt: endMonth } } }, { $group: { _id: null, total: { $sum: '$totalCost' }, qty: { $sum: '$quantity' } } }]);
  const lowStock = await Product.find({ $expr: { $lte: ['$stock', '$minStock'] } });
  return {
    dailySales: dailySales[0] || { total: 0, qty: 0 },
    monthlySales: monthlySales[0] || { total: 0, qty: 0 },
    dailyPurchases: dailyPurchases[0] || { total: 0, qty: 0 },
    monthlyPurchases: monthlyPurchases[0] || { total: 0, qty: 0 },
    lowStock
  };
};

app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.render('login', { error: 'Username tidak ditemukan.' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.render('login', { error: 'Password salah.' });
  req.session.userId = user._id;
  res.redirect('/dashboard');
});
app.post('/touch-login/:role', async (req, res) => {
  const user = await User.findOne({ role: req.params.role });
  if (!user) return res.redirect('/login');
  req.session.userId = user._id;
  res.redirect('/dashboard');
});
app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));
app.get('/dashboard', ensureAuth, async (req, res) => {
  const totalProducts = await Product.countDocuments();
  const totalStock = await Product.aggregate([{ $group: { _id: null, total: { $sum: '$stock' } } }]);
  const totalSales = await Sale.aggregate([{ $group: { _id: null, total: { $sum: '$totalAmount' } } }]);
  const totalDebts = await Debt.aggregate([{ $match:{status:'Belum Lunas'}},{ $group: { _id: null, total: { $sum: '$amount' } } }]);
  const totalPurchases = await Purchase.aggregate([{ $group: { _id: null, total: { $sum: '$totalCost' } } }]);
  const recentProducts = await Product.find().sort({ updatedAt: -1 }).limit(5);
  const recentSales = await Sale.find().sort({ createdAt: -1 }).limit(5);
  res.render('dashboard', { stats: { totalProducts, totalStock: totalStock[0]?.total || 0, totalSales: totalSales[0]?.total || 0, totalDebts: totalDebts[0]?.total || 0, totalPurchases: totalPurchases[0]?.total || 0 }, recentProducts, recentSales, error:null, success:null });
});
app.get('/products', ensureAuth, async (req, res) => { const products = await Product.find().sort({ createdAt: -1 }); renderWithMessage(res, 'products', { products, editItem: null }); });
app.post('/products', ensureAuth, async (req, res) => { const { name, category, stock, unit, price, minStock } = req.body; if (Number(stock) < 0 || Number(price) < 0) return renderWithMessage(res, 'products', { products: await Product.find(), editItem: null, error: 'Stok dan harga tidak boleh negatif.' }); await Product.create({ name, category, stock, unit, price, minStock }); res.redirect('/products'); });
app.get('/products/:id/edit', ensureAuth, async (req, res) => { const products = await Product.find().sort({ createdAt: -1 }); const editItem = await Product.findById(req.params.id); renderWithMessage(res, 'products', { products, editItem }); });
app.post('/products/:id/update', ensureAuth, async (req, res) => { const { name, category, stock, unit, price, minStock } = req.body; if (Number(stock) < 0 || Number(price) < 0) return renderWithMessage(res, 'products', { products: await Product.find(), editItem: await Product.findById(req.params.id), error: 'Nilai stok atau harga tidak valid.' }); await Product.findByIdAndUpdate(req.params.id, { name, category, stock, unit, price, minStock }); res.redirect('/products'); });
app.post('/products/:id/delete', ensureAdmin, async (req, res) => { await Product.findByIdAndDelete(req.params.id); res.redirect('/products'); });
app.get('/sales', ensureAuth, async (req, res) => { const sales = await Sale.find().sort({ createdAt: -1 }); const products = await Product.find().sort({ name: 1 }); renderWithMessage(res, 'sales', { sales, products, editItem: null }); });
app.post('/sales', ensureAuth, async (req, res) => { const { customerName, productId, quantity, paymentType } = req.body; const qty = Number(quantity); const product = await Product.findById(productId); if (!product) return renderWithMessage(res, 'sales', { sales: await Sale.find(), products: await Product.find(), editItem: null, error: 'Produk tidak ditemukan.' }); if (qty <= 0) return renderWithMessage(res, 'sales', { sales: await Sale.find(), products: await Product.find(), editItem: null, error: 'Jumlah penjualan harus lebih dari 0.' }); if (product.stock < qty) return renderWithMessage(res, 'sales', { sales: await Sale.find(), products: await Product.find(), editItem: null, error: `Stok ${product.name} tidak cukup. Sisa stok: ${product.stock}.` }); const totalAmount = qty * Number(product.price); await Sale.create({ customerName, productId: product._id, productName: product.name, quantity: qty, totalAmount, paymentType }); product.stock -= qty; await product.save(); if (paymentType === 'Tempo') await Debt.create({ customerName, amount: totalAmount, note: `Piutang dari penjualan ${product.name}` }); res.redirect('/sales'); });
app.get('/sales/:id/edit', ensureAuth, async (req, res) => { const sales = await Sale.find().sort({ createdAt: -1 }); const products = await Product.find().sort({ name: 1 }); const editItem = await Sale.findById(req.params.id); renderWithMessage(res, 'sales', { sales, products, editItem }); });
app.post('/sales/:id/update', ensureAuth, async (req, res) => { const sale = await Sale.findById(req.params.id); if (!sale) return res.redirect('/sales'); const oldProduct = await Product.findById(sale.productId); if (oldProduct) { oldProduct.stock += sale.quantity; await oldProduct.save(); } const { customerName, productId, quantity, paymentType } = req.body; const qty = Number(quantity); const product = await Product.findById(productId); if (!product || qty <= 0 || product.stock < qty) return renderWithMessage(res, 'sales', { sales: await Sale.find(), products: await Product.find(), editItem: sale, error: 'Perubahan gagal. Cek produk atau stok.' }); const totalAmount = qty * Number(product.price); product.stock -= qty; await product.save(); sale.customerName = customerName; sale.productId = product._id; sale.productName = product.name; sale.quantity = qty; sale.totalAmount = totalAmount; sale.paymentType = paymentType; await sale.save(); res.redirect('/sales'); });
app.post('/sales/:id/delete', ensureAdmin, async (req, res) => { const sale = await Sale.findById(req.params.id); if (sale) { const product = await Product.findById(sale.productId); if (product) { product.stock += sale.quantity; await product.save(); } await Sale.findByIdAndDelete(req.params.id); } res.redirect('/sales'); });
app.get('/purchases', ensureAuth, async (req, res) => { const purchases = await Purchase.find().sort({ createdAt: -1 }); const products = await Product.find().sort({ name: 1 }); renderWithMessage(res, 'purchases', { purchases, products, editItem: null }); });
app.post('/purchases', ensureAuth, async (req, res) => { const { supplierName, productId, quantity, unitCost } = req.body; const qty = Number(quantity), cost = Number(unitCost); const product = await Product.findById(productId); if (!product || qty <= 0 || cost < 0) return renderWithMessage(res, 'purchases', { purchases: await Purchase.find(), products: await Product.find(), editItem: null, error: 'Data pembelian tidak valid.' }); const totalCost = qty * cost; await Purchase.create({ supplierName, productId: product._id, productName: product.name, quantity: qty, unitCost: cost, totalCost }); product.stock += qty; await product.save(); res.redirect('/purchases'); });
app.get('/purchases/:id/edit', ensureAuth, async (req, res) => { const purchases = await Purchase.find().sort({ createdAt: -1 }); const products = await Product.find().sort({ name: 1 }); const editItem = await Purchase.findById(req.params.id); renderWithMessage(res, 'purchases', { purchases, products, editItem }); });
app.post('/purchases/:id/update', ensureAuth, async (req, res) => { const purchase = await Purchase.findById(req.params.id); if (!purchase) return res.redirect('/purchases'); const oldProduct = await Product.findById(purchase.productId); if (oldProduct) { oldProduct.stock -= purchase.quantity; if (oldProduct.stock < 0) oldProduct.stock = 0; await oldProduct.save(); } const { supplierName, productId, quantity, unitCost } = req.body; const qty = Number(quantity), cost = Number(unitCost); const product = await Product.findById(productId); if (!product || qty <= 0 || cost < 0) return renderWithMessage(res, 'purchases', { purchases: await Purchase.find(), products: await Product.find(), editItem: purchase, error: 'Perubahan pembelian tidak valid.' }); product.stock += qty; await product.save(); purchase.supplierName = supplierName; purchase.productId = product._id; purchase.productName = product.name; purchase.quantity = qty; purchase.unitCost = cost; purchase.totalCost = qty * cost; await purchase.save(); res.redirect('/purchases'); });
app.post('/purchases/:id/delete', ensureAdmin, async (req, res) => { const purchase = await Purchase.findById(req.params.id); if (purchase) { const product = await Product.findById(purchase.productId); if (product) { product.stock = Math.max(0, product.stock - purchase.quantity); await product.save(); } await Purchase.findByIdAndDelete(req.params.id); } res.redirect('/purchases'); });
app.get('/debts', ensureAuth, async (req, res) => { const debts = await Debt.find().sort({ createdAt: -1 }); renderWithMessage(res, 'debts', { debts }); });
app.post('/debts/:id/pay', ensureAuth, async (req, res) => { await Debt.findByIdAndUpdate(req.params.id, { status: 'Lunas' }); res.redirect('/debts'); });
app.post('/debts/:id/delete', ensureAdmin, async (req, res) => { await Debt.findByIdAndDelete(req.params.id); res.redirect('/debts'); });
app.get('/reports', ensureAuth, async (req, res) => { const data = await reportData(); res.render('reports', { ...data, error:null, success:null }); });
app.get('/reports/export/excel', ensureAuth, async (req, res) => {
  const data = await reportData();
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet('Ringkasan');
  summary.columns = [{ header: 'Item', key: 'item', width: 28 }, { header: 'Nilai', key: 'value', width: 24 }];
  summary.addRows([
    { item: 'Penjualan Hari Ini', value: data.dailySales.total },
    { item: 'Qty Penjualan Hari Ini', value: data.dailySales.qty },
    { item: 'Penjualan Bulan Ini', value: data.monthlySales.total },
    { item: 'Qty Penjualan Bulan Ini', value: data.monthlySales.qty },
    { item: 'Pembelian Hari Ini', value: data.dailyPurchases.total },
    { item: 'Qty Pembelian Hari Ini', value: data.dailyPurchases.qty },
    { item: 'Pembelian Bulan Ini', value: data.monthlyPurchases.total },
    { item: 'Qty Pembelian Bulan Ini', value: data.monthlyPurchases.qty }
  ]);
  const lowStockSheet = workbook.addWorksheet('Stok Minimum');
  lowStockSheet.columns = [{ header: 'Produk', key: 'name', width: 28 }, { header: 'Stok', key: 'stock', width: 14 }, { header: 'Satuan', key: 'unit', width: 12 }, { header: 'Stok Minimum', key: 'minStock', width: 18 }];
  data.lowStock.forEach(p => lowStockSheet.addRow({ name: p.name, stock: p.stock, unit: p.unit, minStock: p.minStock }));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="laporan-kios-pupuk.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});
app.get('/reports/export/pdf', ensureAuth, async (req, res) => {
  const data = await reportData();
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="laporan-kios-pupuk.pdf"');
  doc.pipe(res);
  doc.fontSize(18).text('Laporan Kios Pupuk Tani Makmur', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Penjualan Hari Ini: ${rupiah(data.dailySales.total)} | Qty: ${data.dailySales.qty}`);
  doc.text(`Penjualan Bulan Ini: ${rupiah(data.monthlySales.total)} | Qty: ${data.monthlySales.qty}`);
  doc.text(`Pembelian Hari Ini: ${rupiah(data.dailyPurchases.total)} | Qty: ${data.dailyPurchases.qty}`);
  doc.text(`Pembelian Bulan Ini: ${rupiah(data.monthlyPurchases.total)} | Qty: ${data.monthlyPurchases.qty}`);
  doc.moveDown().fontSize(14).text('Produk dengan Stok Minimum');
  doc.moveDown(0.5);
  if (!data.lowStock.length) {
    doc.fontSize(12).text('Tidak ada produk di bawah batas minimum.');
  } else {
    data.lowStock.forEach((p, i) => doc.fontSize(11).text(`${i + 1}. ${p.name} - stok ${p.stock} ${p.unit}, minimum ${p.minStock} ${p.unit}`));
  }
  doc.end();
});
app.get('/users', ensureAdmin, async (req, res) => { const users = await User.find().sort({ createdAt: -1 }); renderWithMessage(res, 'users', { users, editItem: null }); });
app.post('/users', ensureAdmin, async (req, res) => { const { name, username, password, role } = req.body; const exists = await User.findOne({ username }); if (exists) return renderWithMessage(res, 'users', { users: await User.find(), editItem: null, error: 'Username sudah dipakai.' }); const hashed = await bcrypt.hash(password, 10); await User.create({ name, username, password: hashed, role }); res.redirect('/users'); });
app.post('/users/:id/delete', ensureAdmin, async (req, res) => { if (String(req.session.userId) === req.params.id) return res.redirect('/users'); await User.findByIdAndDelete(req.params.id); res.redirect('/users'); });
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
