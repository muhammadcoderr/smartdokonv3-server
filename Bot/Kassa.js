require('dotenv').config();
const axios = require('axios');
const Cashbox = require('../Models/Cashbox');


let activeMessages = {};
let transactionsCache = {}; // Tranzaksiya ma'lumotlari uchun cache

// Eski xabarlarni o‘chirish
function clearPreviousMessages(bot, chatId) {
  if (activeMessages[chatId]) {
    activeMessages[chatId].forEach((messageId) => {
      bot.deleteMessage(chatId, messageId).catch((err) => {
        console.error(`Xabarni o‘chirishda xatolik: ${err.message}`);
      });
    });
    activeMessages[chatId] = [];
  }
}

// Kassa tugmasi funksiyasi
function initKassa(bot) {
  bot.onText(/💰 Kassa/, async (msg) => {
    const chatId = msg.chat.id;

    clearPreviousMessages(bot, chatId);

    try {
      const cashbox = await Cashbox.findOne();
      const { cashBalance, cardBalance, bankBalance, transactions } = cashbox;

      transactionsCache[chatId] = transactions.reverse(); // Tranzaksiyalarni cache saqlash

      const message = `
📅 Kassa ma'lumotlari:
- 💵 Naqd: ${cashBalance.toLocaleString('uz-UZ')} so'm
- 💳 Karta: ${cardBalance.toLocaleString('uz-UZ')} so'm
- 🏦 Bank: ${bankBalance.toLocaleString('uz-UZ')} so'm
      `;

      bot.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📜 Tranzaksiyalar", callback_data: "transactions_0" }],
          ],
        },
      }).then((sentMessage) => {
        activeMessages[chatId] = [sentMessage.message_id];
      });

    } catch (error) {
      console.error('API dan ma\'lumot olishda xatolik:', error.message);
      bot.sendMessage(chatId, 'Ma\'lumotlarni olishda xatolik yuz berdi.');
    }
  });

  bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith("transactions_")) {
      const page = parseInt(data.split("_")[1]);
      sendTransactions(bot, chatId, page, query.message.message_id);
    }
  });
}

// Tranzaksiyalarni jo'natish
function sendTransactions(bot, chatId, page, messageId) {
  const transactions = transactionsCache[chatId] || [];
  const perPage = 10;
  const start = page * perPage;
  const end = start + perPage;
  const paginated = transactions.slice(start, end);

  if (paginated.length === 0) {
    return bot.answerCallbackQuery(chatId, { text: "Tranzaksiyalar topilmadi!", show_alert: true });
  }

  let message = `📜 Tranzaksiyalar (${start + 1}-${end}):\n\n`;

  paginated.forEach((t) => {
    const typeEmoji = t.type === "income" ? "🟢" : "🔴";
    const date = new Date(t.date).toLocaleString('uz-UZ', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });

    message += `📅 ${date}\n${typeEmoji} ${t.amount.toLocaleString('uz-UZ')} so'm (${t.paymentMethod}) - ${t.description}\n\n`;
});


  let buttons = [];
  if (start > 0) buttons.push({ text: "⬅️ Oldingi", callback_data: `transactions_${page - 1}` });
  if (end < transactions.length) buttons.push({ text: "Keyingi ➡️", callback_data: `transactions_${page + 1}` });

  bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [buttons] },
  }).catch(console.error);
}

module.exports = initKassa;
