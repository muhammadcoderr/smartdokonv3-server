require('dotenv').config();
const User = require('../Models/Bot/Users'); // Foydalanuvchi modeli
const ITEMS_PER_PAGE = 5; // Har bir sahifada foydalanuvchi soni

let activeMessages = {}; // Har bir chat uchun faol xabarlarni saqlash

// Faol xabarlarni o'chirish funksiyasi
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

// Admin panelini boshlash funksiyasi
function initAdminPanel(bot) {
  // Foydalanuvchilarni sahifalash funksiyasi
  async function showPage(chatId, users, page, totalPages) {
    clearPreviousMessages(bot, chatId); // Eski xabarlarni o'chirish

    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;

    const currentPageUsers = users.slice(startIndex, endIndex);

    const buttons = {
      reply_markup: {
        inline_keyboard: currentPageUsers.map((user) => [
          { text: user.username || `Foydalanuvchi_${user.chatId}`, callback_data: `user_${user._id}` },
        ]),
      },
    };

    if (totalPages > 1) {
      const paginationButtons = [];
      if (page > 1) {
        paginationButtons.push({ text: '⬅️ Oldingi', callback_data: `page_${page - 1}` });
      }
      if (page < totalPages) {
        paginationButtons.push({ text: 'Keyingi ➡️', callback_data: `page_${page + 1}` });
      }

      buttons.reply_markup.inline_keyboard.push(paginationButtons);
    }

    const usersText = currentPageUsers
      .map(
        (user, index) =>
          `${startIndex + index + 1}. ${user.username || `Foydalanuvchi_${user.chatId}`} (${user.role})`
      )
      .join('\n');

    bot.sendMessage(
      chatId,
      `Foydalanuvchilar ro'yxati (sahifa ${page}/${totalPages}):\n\n${usersText}`,
      buttons
    ).then((sentMessage) => {
      activeMessages[chatId] = [sentMessage.message_id];
    });
  }

  // Adminlar tugmasi
  bot.onText(/👤 Adminlar/, async (msg) => {
    const chatId = msg.chat.id;

    const user = await User.findOne({ chatId });
    if (!user || user.role !== 'admin') {
      return bot.sendMessage(chatId, 'Kechirasiz, Siz admin emassiz.');
    }

    const allUsers = await User.find();
    const totalPages = Math.ceil(allUsers.length / ITEMS_PER_PAGE);

    showPage(chatId, allUsers, 1, totalPages);
  });

  // Callback-lar
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    clearPreviousMessages(bot, chatId); // Eski xabarlarni o'chirish

    if (data.startsWith('page_')) {
      const page = parseInt(data.split('_')[1], 10);

      const allUsers = await User.find();
      const totalPages = Math.ceil(allUsers.length / ITEMS_PER_PAGE);
      return showPage(chatId, allUsers, page, totalPages);
    }

    if (data.startsWith('user_')) {
      const userId = data.split('_')[1];
      const user = await User.findById(userId);

      if (!user) {
        return bot.sendMessage(chatId, 'Foydalanuvchi topilmadi.');
      }

      const text = `
Foydalanuvchi ma'lumotlari:
ID: ${user.chatId}
Ism: ${user.firstName}
Familiya: ${user.lastName || 'Yo‘q'}
Username: ${user.username || 'Yo‘q'}
Rol: ${user.role}
      `;

      const buttons = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Admin qilish', callback_data: `makeadmin_${user._id}` },
              { text: 'Adminlikdan olish', callback_data: `removeadmin_${user._id}` },
            ],
          ],
        },
      };

      bot.sendMessage(chatId, text, buttons).then((sentMessage) => {
        activeMessages[chatId] = [sentMessage.message_id];
      });
    }

    if (data.startsWith('makeadmin_')) {
      const userId = data.split('_')[1];
      await User.findByIdAndUpdate(userId, { role: 'admin' });
      bot.sendMessage(chatId, 'Foydalanuvchi admin qilindi.');
    }

    if (data.startsWith('removeadmin_')) {
      const userId = data.split('_')[1];
      const adminCount = await User.countDocuments({ role: 'admin' });

      if (adminCount <= 1) {
        return bot.sendMessage(chatId, 'Oxirgi adminni o‘chira olmaysiz.');
      }

      await User.findByIdAndUpdate(userId, { role: 'user' });
      bot.sendMessage(chatId, 'Adminlik o‘chirildi.');
    }
  });

  // /addadmin buyrug'i
  bot.onText(/\/addadmin (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = match[1].trim();

    const admin = await User.findOne({ chatId, role: 'admin' });
    if (!admin) {
      return bot.sendMessage(chatId, 'Sizda bu amalni bajarish uchun ruxsat yo‘q.');
    }

    const user = await User.findOne({ chatId: userId });
    if (!user) {
      return bot.sendMessage(chatId, 'Foydalanuvchi topilmadi.');
    }

    await User.findOneAndUpdate({ chatId: userId }, { role: 'admin' });
    bot.sendMessage(chatId, 'Foydalanuvchi muvaffaqiyatli admin qilindi.');
  });
}

module.exports = initAdminPanel;
