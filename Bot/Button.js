function getAdminButtons() {
    return {
      reply_markup: {
        keyboard: [
          [{ text: "👤 Adminlar" }, { text: "🛒 Mahsulotlar" }],
        ],
        resize_keyboard: true,
      },
    };
  }
  function getAdminFinenceButtons() {
    return {
      reply_markup: {
        keyboard: [
          [{ text: "💰 Kassa" }, { text: "❌ Xarajatlar" }],
        ],
        resize_keyboard: true,
      },
    };
  }
  
  function generateButtons(role) {
    if (role === "admin") {
      return getAdminButtons(); // Admin tugmalari
    }
  }
  function  generateFinanceButtons(role) {
    if (role === "admin") {
      return getAdminFinenceButtons(); // Admin tugmalari
    }
  }
  module.exports = { generateButtons ,generateFinanceButtons};
  