require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Product = require('./models/Product');
const Sale = require('./models/Sale');
const Debt = require('./models/Debt');
const Purchase = require('./models/Purchase');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/kios_pupuk_tani_makmur';
(async () => {
  await mongoose.connect(MONGO_URI);
  await Promise.all([User.deleteMany({}), Product.deleteMany({}), Sale.deleteMany({}), Debt.deleteMany({}), Purchase.deleteMany({})]);
  const password = await bcrypt.hash('123456', 10);
  await User.insertMany([
    { name: 'Admin Tangerang', username: 'admin', password, role: 'admin' },
    { name: 'Operator Ibu', username: 'ibu', password, role: 'operator' }
  ]);
  const products = await Product.insertMany([
    { name: 'Urea Subsidi', category: 'Pupuk', stock: 120, unit: 'kg', price: 2500, minStock: 20 },
    { name: 'NPK Phonska', category: 'Pupuk', stock: 90, unit: 'kg', price: 3200, minStock: 20 },
    { name: 'ZA Petro', category: 'Pupuk', stock: 60, unit: 'kg', price: 2800, minStock: 15 }
  ]);
  await Purchase.create({ supplierName: 'CV Agro Lampung', productId: products[1]._id, productName: products[1].name, quantity: 25, unitCost: 2500, totalCost: 62500 });
  await Sale.create({ customerName: 'Pak Budi', productId: products[0]._id, productName: products[0].name, quantity: 10, totalAmount: 25000, paymentType: 'Tunai' });
  await Debt.create({ customerName: 'Pak Jaya', amount: 64000, note: 'Tempo NPK 20 kg' });
  console.log('Seed selesai. Login admin/123456 atau ibu/123456');
  await mongoose.disconnect();
})();
