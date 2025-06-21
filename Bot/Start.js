require('dotenv').config(); // .env fayldan o'qish uchun
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const User = require('../Models/Bot/Users'); // Foydalanuvchi modeli
const { generateButtons,generateFinanceButtons } = require('./Button.js'); // Tugmalar moduli
const initAdminPanel = require('./Admin'); // Admin.js fayli
const initKassa = require('./Kassa.js')
const initProduct = require('./Product.js')
const showTodaysCosts = require('./showTodaysCosts.js')
const Costs = require('./Costs.js')
const deleteProduct = require('./deletedProduct.js')
const monitorStock = require('./monitorStock.js')
const productNumber = require('./ProductNumber.js')
// Bot tokeni
const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_TOKEN_FINANCE = process.env.BOT_TOKEN_FINANCE

// Botni ishga tushirish
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const botFinance = new TelegramBot(BOT_TOKEN_FINANCE, { polling: true });
initAdminPanel(bot);
initKassa(botFinance)
initProduct(bot)
showTodaysCosts(botFinance)
Costs.setBot(botFinance)
deleteProduct.setBot(bot)
monitorStock.setBot(bot)
productNumber.setBot(bot)

// Foydalanuvchini bazaga saqlash yoki yangilash funksiyasi
async function saveUserToDatabase(msg) {
  const chatId = msg.chat.id;
  const username = msg.chat.username || `NoUsername_${chatId}`;
  const firstName = msg.chat.first_name || 'Ismi yo\'q';
  const lastName = msg.chat.last_name || 'Familiyasi yo\'q';

  // Default roli - "user"
  const role = 'user';

  try {
    // Foydalanuvchi bazada bormi yoki yo'qmi, tekshirish
    const existingUser = await User.findOne({ chatId });

    if (!existingUser) {
      const newUser = new User({
        chatId,
        username,
        firstName,
        lastName,
        role, // Default rol
      });

      await newUser.save();
      console.log(`Foydalanuvchi saqlandi: ${username}`);
      return role;
    } else {
      console.log(`Foydalanuvchi allaqachon bazada: ${chatId}`);
      return existingUser.role; // Bazadagi foydalanuvchining rolini qaytarish
    }
  } catch (err) {
    console.error('Foydalanuvchini saqlashda xatolik:', err.message);
    return null;
  }
}

// /start buyrug'iga ishlov berish
function Start() {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.chat.first_name || 'Foydalanuvchi';

    // Foydalanuvchini bazaga saqlash va uning rolini olish
    const role = await saveUserToDatabase(msg);

    if (role === 'admin') {
      // Agar foydalanuvchi admin bo'lsa, tugmalarni yuborish
      const adminButtons = generateButtons('admin');
      bot.sendMessage(chatId, `Assalomu alaykum, ${firstName}!\nAdmin panelga xush kelibsiz!`, adminButtons);
    } else if (role == 'user') {
      // Oddiy foydalanuvchi uchun tugmalarni yuborish
      bot.sendMessage(chatId, `Assalomu alaykum, ${firstName}! \nKechirasiz bu bot faqat adminlar uchun ❌`);
    } else {
      // Agar ma'lumotlarni saqlashda xatolik yuz bersa
      bot.sendMessage(chatId, 'Kechirasiz, tizimda xatolik yuz berdi. Qayta urinib ko\'ring.');
    }
  });
  botFinance.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.chat.first_name || 'Foydalanuvchi';

    // Foydalanuvchini bazaga saqlash va uning rolini olish
    const role = await saveUserToDatabase(msg);

    if (role === 'admin') {
      // Agar foydalanuvchi admin bo'lsa, tugmalarni yuborish
      const adminFinanceButtons = generateFinanceButtons('admin');
      botFinance.sendMessage(chatId, `Assalomu alaykum, ${firstName}!\nAdmin panelga xush kelibsiz!`, adminFinanceButtons);
    } else if (role == 'user') {
      // Oddiy foydalanuvchi uchun tugmalarni yuborish
      botFinance.sendMessage(chatId, `Assalomu alaykum, ${firstName}! \nKechirasiz bu bot faqat adminlar uchun ❌`);
    } else {
      // Agar ma'lumotlarni saqlashda xatolik yuz bersa
      botFinance.sendMessage(chatId, 'Kechirasiz, tizimda xatolik yuz berdi. Qayta urinib ko\'ring.');
    }
  });
  bot.onText(/🔙 Orqaga/, async (msg) => {
    const chatId = msg.chat.id;
    const adminButtons = generateButtons('admin');
    bot.sendMessage(chatId, 'Kerakli bo\'limni tanlang!', adminButtons);

  })
  botFinance.onText(/🔙 Orqaga/, async (msg) => {
    const chatId = msg.chat.id;
    const adminFinenceButtons = generateFinanceButtons('admin');
    botFinance.sendMessage(chatId, 'Kerakli bo\'limni tanlang!', adminFinenceButtons);

  })
  console.log('Telegram bot ishlamoqda...');
}

module.exports = Start;
