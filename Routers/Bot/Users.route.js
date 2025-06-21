const express = require('express');
const bcrypt = require('bcrypt'); // Parolni xeshlash uchun
const User = require('../Models/User.model'); // Foydalanuvchi modeli

const router = express.Router();

// 1. Foydalanuvchini ro'yxatdan o'tkazish
router.post('/register', async (req, res) => {
  const { username, password, role } = req.body;

  try {
    // Parolni xeshlash
    const hashedPassword = await bcrypt.hash(password, 10);

    // Yangi foydalanuvchini yaratish
    const newUser = new User({
      username,
      password: hashedPassword,
      role, // 'user' yoki 'admin'
    });

    await newUser.save();
    res.status(201).json({ message: 'Foydalanuvchi muvaffaqiyatli ro‘yxatdan o‘tdi!' });
  } catch (err) {
    res.status(500).json({ error: 'Xatolik yuz berdi: ' + err.message });
  }
});

// 2. Foydalanuvchilarni ko‘rish (faqat adminlar uchun)
router.get('/all', async (req, res) => {
  try {
    const users = await User.find().select('-password'); // Parollarni ko‘rsatmaslik
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ error: 'Xatolik yuz berdi: ' + err.message });
  }
});

// 3. Foydalanuvchini o‘chirish (faqat adminlar uchun)
router.delete('/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Foydalanuvchi muvaffaqiyatli o‘chirildi!' });
  } catch (err) {
    res.status(500).json({ error: 'Xatolik yuz berdi: ' + err.message });
  }
});

module.exports = router;
