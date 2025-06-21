require('dotenv').config();
const moment = require('moment');
const Costs = require('../Models/Costs'); // model joylashgan yo‘l to‘g‘ri bo‘lishi kerak

let activeMessages = {};
let pageTracker = {};

// Eski xabarlarni o‘chirish funksiyasi
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

// Bugungi xarajatlarni chiqarish funksiyasi
async function sendPaginatedCosts(bot, chatId, page = 1) {
  try {
    clearPreviousMessages(bot, chatId);

    const todayDate = moment().format('YYYY-MM-DD');
    const startOfDay = moment().startOf('day').toDate();
    const endOfDay = moment().endOf('day').toDate();

    const todayCosts = await Costs.find({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ createdAt: -1 });

    if (todayCosts.length === 0) {
      return bot.sendMessage(chatId, `📅 *Bugungi sana:* ${todayDate}\n❌ *Xarajatlar topilmadi!*`, {
        parse_mode: 'Markdown'
      });
    }

    const itemsPerPage = 5;
    const totalPages = Math.ceil(todayCosts.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const paginated = todayCosts.slice(startIndex, startIndex + itemsPerPage);

    let totalCosts = 0;
    let message = `📅 *Bugungi xarajatlar* (${todayDate})\n\n`;

    paginated.forEach((cost, index) => {
      totalCosts += cost.amount;

      const paymentTypeText =
        cost.paymentMethod === 'cash' ? '💵 Naqd' :
        cost.paymentMethod === 'card' ? '💳 Karta' :
        cost.paymentMethod === 'bank' ? '🏦 Bank' : '❓ Noma’lum';

      message += `📌 *#${startIndex + index + 1}*\n`;
      message += `👤 *Sotuvchi:* ${cost.sellername}\n`;
      message += `💰 *Miqdori:* ${cost.amount.toLocaleString('uz-UZ')} so'm\n`;
      message += `💳 *To‘lov turi:* ${paymentTypeText}\n`;
      message += `📝 *Izoh:* ${cost.description || 'Yo‘q'}\n\n`;
    });

    message += `📊 *Jami xarajatlar:* ${totalCosts.toLocaleString('uz-UZ')} so'm\n`;
    message += `📄 *Sahifa:* ${page}/${totalPages}`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: []
      }
    };

    if (page > 1) {
      keyboard.reply_markup.inline_keyboard.push([{
        text: '⬅️ Oldingi',
        callback_data: `costs_${page - 1}`
      }]);
    }

    if (page < totalPages) {
      keyboard.reply_markup.inline_keyboard.push([{
        text: 'Keyingisi ➡️',
        callback_data: `costs_${page + 1}`
      }]);
    }

    bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      ...keyboard
    }).then((sentMessage) => {
      activeMessages[chatId] = [sentMessage.message_id];
      pageTracker[chatId] = page;
    });

  } catch (error) {
    console.error("Xarajat ma'lumotlarini olishda xatolik:", error.message);
    bot.sendMessage(chatId, '❌ *Xarajat ma\'lumotlarini olishda xatolik yuz berdi!*', {
      parse_mode: 'Markdown'
    });
  }
}

// Telegram bot komandasi
function showTodaysCosts(bot) {
  // Foydalanuvchi komanda yuborganda
  bot.onText(/❌ Xarajatlar/, (msg) => {
    sendPaginatedCosts(bot, msg.chat.id);
  });

  // Inline tugmalar orqali sahifalash
  bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith("costs_")) {
      const page = parseInt(data.split("_")[1], 10);
      sendPaginatedCosts(bot, chatId, page);
      bot.answerCallbackQuery(query.id);
    }
  });
}

module.exports = showTodaysCosts;
