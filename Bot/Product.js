require('dotenv').config();
const axios = require('axios'); // API bilan ishlash uchun
const Product = require('../Models/Product'); // to‘liq yo‘lni yozing


// Faol xabarlarni o'chirish uchun massiv
let activeMessages = {};

// Eski xabarlarni o'chirish funksiyasi
function clearPreviousMessages(bot, chatId) {
  if (activeMessages[chatId]) {
    activeMessages[chatId].forEach((messageId) => {
      bot.deleteMessage(chatId, messageId).catch((err) => {
        console.error(`Xabarni o'chirishda xatolik: ${err.message}`);
      });
    });
    activeMessages[chatId] = [];
  }
}

// Mahsulotlar tugmasi funksiyasi
function initProduct(bot) {
  bot.onText(/🛒 Mahsulotlar/, (msg) => {
    const chatId = msg.chat.id;

    // Eski xabarlarni o'chirish
    clearPreviousMessages(bot, chatId);

    // Mahsulotlar bo'limi uchun tugmalar
    const keyboard = {
      reply_markup: {
        keyboard: [
          [{ text: "🕒 Qolib ketgan mahsulotlar" }, { text: "🚫 Tugagan mahsulotlar" }],
          [{ text: "🔙 Orqaga" }],
        ],
        resize_keyboard: true,
      },
    };

    bot.sendMessage(chatId, "Mahsulotlar bo'limini tanlang:", keyboard).then((sentMessage) => {
      activeMessages[chatId] = [sentMessage.message_id];
    });
  });

  // Qolib ketgan mahsulotlar
  bot.onText(/🕒 Qolib ketgan mahsulotlar/, (msg) => {
    const chatId = msg.chat.id;
  
    bot.sendMessage(chatId, "Qancha oy ichida sotilmagan mahsulotlarni ko'rishni xohlaysiz? (Oy) kiriting:").then(() => {
      bot.once("message", async (reply) => {
        const months = parseInt(reply.text);
        if (isNaN(months) || months < 1) {
          return bot.sendMessage(chatId, "Iltimos, to'g'ri oy kiriting (1 yoki undan katta son).");
        }
  
        try {
          // API orqali mahsulotlar ro'yxatini olish
          const products = await Product.find(); // to‘g‘ridan-to‘g‘ri MongoDB'dan olish
  
          // Hozirgi sana
          const now = new Date();
  
          // Qolib ketgan mahsulotlarni filtrlash
          const filteredProducts = products.filter((product) => {
            const updatedAt = new Date(product.updatedAt);
            const monthsDifference = (now.getFullYear() - updatedAt.getFullYear()) * 12 + (now.getMonth() - updatedAt.getMonth());
            return monthsDifference >= months; // Kirilgan oydan ko'p vaqt yangilanmagan mahsulotlar
          });
  
          if (filteredProducts.length === 0) {
            const keyboard = {
              reply_markup: {
                keyboard: [
                  [{ text: "🕒 Qolib ketgan mahsulotlar" }, { text: "🚫 Tugagan mahsulotlar" }],
                  [{ text: "🔙 Orqaga" }],
                ],
                resize_keyboard: true,
              },
            };
            return bot.sendMessage(chatId, `Oxirgi ${months} oy ichida sotilmagan mahsulotlar topilmadi.`, keyboard);
          }
  
          // Mahsulotlarni formatlash
          let message = `📦 Oxirgi ${months} oy ichida sotilmagan mahsulotlar:\n\n`;
          filteredProducts.forEach((product, index) => {
            message += `${index + 1}. ${product.name} - Qolgan: ${product.avialable} dona\n`;
          });
  
          bot.sendMessage(chatId, message);
        } catch (error) {
          console.error("API dan ma'lumot olishda xatolik:", error.message);
          bot.sendMessage(chatId, "Ma'lumotlarni olishda xatolik yuz berdi.");
        }
      });
    });
  });
  

  // Tugagan mahsulotlar
  bot.onText(/🚫 Tugagan mahsulotlar/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      // API orqali mahsulotlar ro'yxatini olish
      const products = await Product.find(); // to‘g‘ridan-to‘g‘ri MongoDB'dan olish
      
      // Tugagan mahsulotlarni filtrlash
      const depletedProducts = products.filter((product) => product.avialable <= 1);

      if (depletedProducts.length == 0) {
        return bot.sendMessage(chatId, "Tugagan mahsulotlar topilmadi.");
      }

      // Mahsulotlarni formatlash
      let message = "🚫 Tugagan mahsulotlar:\n\n";
      depletedProducts.forEach((product, index) => {
        message += `${index + 1}. ${product.name} - Qolgan: ${product.avialable}\n`; 
      });

      bot.sendMessage(chatId, message);
    } catch (error) {
      console.error("API dan ma'lumot olishda xatolik:", error.message);
      bot.sendMessage(chatId, "Ma'lumotlarni olishda xatolik yuz berdi.");
    }
  });
}

module.exports = initProduct;
