require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const User = require('../Models/Bot/Users');
const Client = require('../Models/Client');
const Payment = require('../Models/Payment');
const Debts = require('../Models/Debts');
const { default: mongoose } = require('mongoose');

class ClientBot {
    constructor() {
        this.bot = new TelegramBot(process.env.BOT_TOKEN_CLIENT, { polling: true });
        this.userStates = new Map();
        this.initializeBot();
    }

    initializeBot() {
        this.bot.onText(/\/start(.*)/, async (msg, match) => {
            await this.handleStart(msg, match[1]);
        });

        this.bot.on('callback_query', async (callbackQuery) => {
            await this.handleCallbackQuery(callbackQuery);
        });

        this.bot.on('message', async (msg) => {
            if (!msg.text || msg.text.startsWith('/')) return;
            await this.handleTextMessage(msg);
        });

        console.log('Client bot is running...');
    }

    async handleStart(msg, referralCode = '') {
        const chatId = msg.chat.id;
        const firstName = msg.chat.first_name || 'Foydalanuvchi';
        
        try {
            const existingBotUser = await User.findOne({ chatId });
            
            if (!existingBotUser) {
                const newBotUser = new User({
                    chatId,
                    username: msg.chat.username || `NoUsername_${chatId}`,
                    firstName: msg.chat.first_name || 'Ismi yo\'q',
                    lastName: msg.chat.last_name || 'Familiyasi yo\'q',
                    role: 'client'
                });
                await newBotUser.save();
            }

            let existingClient = null;
            
            if (existingBotUser && existingBotUser.clientId) {
                existingClient = await Client.findById(existingBotUser.clientId);
            }

            if (existingClient) {
                await this.showMainMenu(chatId, existingClient.firstname);
            } else {
                await this.showWelcomeMenu(chatId, firstName, referralCode.trim());
            }
        } catch (error) {
            console.error('Error in handleStart:', error);
            await this.bot.sendMessage(chatId, 'Xatolik yuz berdi. Iltimos qayta urinib ko\'ring.');
        }
    }

    async showWelcomeMenu(chatId, firstName, referralCode = '') {
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📝 Ro\'yxatdan o\'tish', callback_data: `register_${referralCode}` }],
                    [{ text: '🔐 Kirish', callback_data: 'login' }]
                ]
            }
        };

        const message = `Assalomu alaykum, ${firstName}! 👋\n\n` +
                       `Bizning xizmatimizdan foydalanish uchun ro'yxatdan o'ting yoki tizimga kiring.\n\n` +
                       `${referralCode ? `🎁 Sizda taklif kodi bor: ${referralCode}` : ''}`;

        await this.bot.sendMessage(chatId, message, keyboard);
    }

    async showMainMenu(chatId, firstName) {
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '👤 Mening ma\'lumotlarim', callback_data: 'my_info' }],
                    [{ text: '🎁 Bonuslarim', callback_data: 'my_bonuses' }],
                    [{ text: '📦 Oxirgi buyurtmalarim', callback_data: 'my_orders' }],
                    [{ text: '💳 Qarzlarim', callback_data: 'my_debts' }],
                    [{ text: '📞 Yordam', callback_data: 'help' }]
                ]
            }
        };

        const message = `Xush kelibsiz, ${firstName}! 🏪\n\n` +
                       `Kerakli bo'limni tanlang:`;

        await this.bot.sendMessage(chatId, message, keyboard);
    }

    async handleCallbackQuery(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const data = callbackQuery.data;
        const messageId = callbackQuery.message.message_id;
    
        try {
            await this.bot.answerCallbackQuery(callbackQuery.id);
            const user = await User.findOne({ chatId });
            if (!user) {
                await this.bot.sendMessage(chatId, 'Foydalanuvchi topilmadi. Iltimos, /start buyrug\'ini yuboring.');
                return;
            }
    
            if (data === 'contact_support') {
                await this.bot.sendMessage(chatId, 
                    `📞 Iltimos, biz bilan bog'lanish uchun quyidagi raqamga qo'ng'iroq qiling: +998901234567\n` +
                    `Yoki Telegram orqali aloqaga chiqish uchun @SupportBot ga yozing.`
                );
            } else if (data.startsWith('register_')) {
                const referralCode = data.replace('register_', '');
                await this.startRegistration(chatId, referralCode);
            } else if (data === 'login') {
                await this.startLogin(chatId);
            } else if (data === 'my_info') {
                await this.showClientInfo(chatId);
            } else if (data === 'my_bonuses') {
                await this.showClientBonuses(chatId);
            } else if (data === 'my_orders') {
                await this.showClientOrders(chatId);
            } else if (data === 'my_debts') {
                await this.showClientDebts(chatId);
            } else if (data === 'help') {
                await this.showHelp(chatId);
            } else if (data === 'back_to_menu') {
                const client = user?.clientId ? await Client.findById(user.clientId) : null;
                await this.showMainMenu(chatId, client?.firstname || 'Foydalanuvchi');
            
            }
        } catch (error) {
            console.error('Error in handleCallbackQuery:', error);
            await this.bot.sendMessage(chatId, 'Xatolik yuz berdi. Iltimos qayta urinib ko\'ring.');
        }
    }

    async startRegistration(chatId, referralCode) {
        this.userStates.set(chatId, { 
            state: 'REGISTRATION_NAME',
            referralCode 
        });

        await this.bot.sendMessage(chatId, 
            '📝 Ro\'yxatdan o\'tish\n\n' +
            'Iltimos, to\'liq ismingizni kiriting:'
        );
    }

    async startLogin(chatId) {
        this.userStates.set(chatId, { state: 'LOGIN_PHONE' });

        await this.bot.sendMessage(chatId,
            '🔐 Tizimga kirish\n\n' +
            'Iltimos, telefon raqamingizni kiriting:\n' +
            '(Masalan: 998901234567 - + belgisisiz)'
        );
    }

    async handleTextMessage(msg) {
        const chatId = msg.chat.id;
        const text = msg.text;
        const userState = this.userStates.get(chatId);

        if (!userState) return;

        try {
            switch (userState.state) {
                case 'REGISTRATION_NAME':
                    await this.handleRegistrationName(chatId, text, userState);
                    break;
                case 'REGISTRATION_PHONE':
                    await this.handleRegistrationPhone(chatId, text, userState);
                    break;
                case 'REGISTRATION_ADDRESS':
                    await this.handleRegistrationAddress(chatId, text, userState);
                    break;
                case 'LOGIN_PHONE':
                    await this.handleLoginPhone(chatId, text);
                    break;
            }
        } catch (error) {
            console.error('Error in handleTextMessage:', error);
            await this.bot.sendMessage(chatId, 'Xatolik yuz berdi. Iltimos qayta urinib ko\'ring.');
        }
    }

    async handleRegistrationName(chatId, name, userState) {
        userState.firstname = name;
        userState.state = 'REGISTRATION_PHONE';
        this.userStates.set(chatId, userState);

        await this.bot.sendMessage(chatId,
            'Iltimos, telefon raqamingizni kiriting:\n' +
            '(Masalan: 998901234567 - + belgisisiz)'
        );
    }

    async handleRegistrationPhone(chatId, phone, userState) {
        const phoneRegex = /^998\d{9}$/;
        const phoneNumber = parseInt(phone);
        
        if (!phoneRegex.test(phone) || isNaN(phoneNumber)) {
            await this.bot.sendMessage(chatId,
                'Telefon raqami noto\'g\'ri formatda!\n' +
                'Iltimos, to\'g\'ri formatda kiriting: 998901234567'
            );
            return;
        }

        const existingClient = await Client.findOne({ phone: phoneNumber });
        if (existingClient) {
            await this.bot.sendMessage(chatId,
                'Bu telefon raqami allaqachon ro\'yxatdan o\'tgan!\n' +
                'Iltimos, kirish bo\'limidan foydalaning yoki boshqa raqam kiriting.'
            );
            return;
        }

        userState.phone = phoneNumber;
        userState.state = 'REGISTRATION_ADDRESS';
        this.userStates.set(chatId, userState);

        await this.bot.sendMessage(chatId,
            'Iltimos, manzilingizni kiriting:'
        );
    }

    async handleRegistrationAddress(chatId, address, userState) {
        try {
            const newClient = new Client({
                firstname: userState.firstname,
                phone: userState.phone,
                address: address,
                bonus: 0,
                debts: []
            });

            if (userState.referralCode) {
                const referrer = await Client.findOne({ referralCode: userState.referralCode });
                if (referrer) {
                    referrer.bonus = (referrer.bonus || 0) + 50000;
                    await referrer.save();
                    newClient.bonus = 25000; 

                    const referrerUser = await User.findOne({ clientId: referrer._id });
                    if (referrerUser && referrerUser.chatId) {
                        await this.bot.sendMessage(referrerUser.chatId,
                            `🎉 Tabriklaymiz!\n\n` +
                            `Sizning taklif kodingiz orqali yangi mijoz ro'yxatdan o'tdi!\n` +
                            `Sizga 50,000 so'm bonus qo'shildi! 💰`
                        );
                    }
                }
            }
            newClient.referralCode = this.generateReferralCode();

            await newClient.save();
            await User.updateOne({ chatId }, { clientId: newClient._id });
            this.userStates.delete(chatId);

            const successMessage = `✅ Muvaffaqiyatli ro'yxatdan o'tdingiz!\n\n` +
                                  `👤 Ism: ${userState.firstname}\n` +
                                  `📞 Telefon: ${userState.phone}\n` +
                                  `📍 Manzil: ${address}\n` +
                                  `🎁 Bonus: ${newClient.bonus.toLocaleString()} so'm\n` +
                                  `🔗 Sizning taklif kodingiz: ${newClient.referralCode}`;

            await this.bot.sendMessage(chatId, successMessage);

            setTimeout(() => {
                this.showMainMenu(chatId, userState.firstname);
            }, 2000);

        } catch (error) {
            console.error('Error in registration:', error);
            await this.bot.sendMessage(chatId, 'Ro\'yxatdan o\'tishda xatolik yuz berdi. Iltimos qayta urinib ko\'ring.');
        }
    }

    async handleLoginPhone(chatId, phone) {
        try {
            const phoneNumber = parseInt(phone);
            
            if (isNaN(phoneNumber)) {
                await this.bot.sendMessage(chatId,
                    'Telefon raqami noto\'g\'ri formatda!\n' +
                    'Iltimos, to\'g\'ri formatda kiriting: 998901234567'
                );
                return;
            }
            
            const client = await Client.findOne({ phone: phoneNumber });
            
            if (!client) {
                await this.bot.sendMessage(chatId,
                    'Bu telefon raqami tizimda topilmadi!\n' +
                    'Iltimos, avval ro\'yxatdan o\'ting.'
                );
                this.userStates.delete(chatId);
                return;
            }
            await User.updateOne({ chatId }, { clientId: client._id });

            this.userStates.delete(chatId);

            await this.bot.sendMessage(chatId,
                `✅ Muvaffaqiyatli kirdingiz!\n\n` +
                `Xush kelibsiz, ${client.firstname}! 👋`
            );

            setTimeout(() => {
                this.showMainMenu(chatId, client.firstname);
            }, 1000);

        } catch (error) {
            console.error('Error in login:', error);
            await this.bot.sendMessage(chatId, 'Kirishda xatolik yuz berdi. Iltimos qayta urinib ko\'ring.');
        }
    }

    async showClientInfo(chatId) {
        try {
            console.log('showClientInfo - chatId:', chatId, 'Type:', typeof chatId);
            const user = await User.findOne({ chatId: Number(chatId) });
            console.log('showClientInfo - user:', user);
            if (!user) {
                console.log('showClientInfo - No user found for chatId:', chatId);
                await this.bot.sendMessage(chatId, 'Foydalanuvchi topilmadi. Iltimos, /start buyrug\'ini yuboring.');
                return;
            }
            if (!user.clientId || !mongoose.Types.ObjectId.isValid(user.clientId)) {
                console.log('showClientInfo - No or invalid clientId for chatId:', chatId);
                await this.bot.sendMessage(chatId, 
                    'Mijoz ma\'lumotlari topilmadi. Iltimos, ro\'yxatdan o\'ting yoki tizimga kiring.',
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📝 Ro\'yxatdan o\'tish', callback_data: 'register_' }],
                                [{ text: '🔐 Kirish', callback_data: 'login' }]
                            ]
                        }
                    }
                );
                return;
            }
            const client = await Client.findById(user.clientId);
            console.log('showClientInfo - client:', client);
            if (!client) {
                console.log('showClientInfo - No client found for clientId:', user.clientId);
                await this.bot.sendMessage(chatId, 'Mijoz ma\'lumotlari topilmadi. Iltimos, ro\'yxatdan o\'ting yoki tizimga kiring.');
                return;
            }
            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Orqaga', callback_data: 'back_to_menu' }],
                        [{ text: '🔗 Taklif kodini ulashish', callback_data: 'share_referral' }]
                    ]
                }
            };
            const birthDate = client.birthday ? client.birthday.toLocaleDateString('uz-UZ') : 'Kiritilmagan';
            const message = `👤 Sizning ma'lumotlaringiz:\n\n` +
                           `📝 Ism: ${client.firstname}\n` +
                           `📞 Telefon: ${client.phone}\n` +
                           `📍 Manzil: ${client.address || 'Kiritilmagan'}\n` +
                           `🎂 Tug'ilgan kun: ${birthDate}\n` +
                           `🔗 Taklif kodingiz: ${client.referralCode || 'Mavjud emas'}\n\n` +
                           `💡 Taklif kodingizni do'stlaringiz bilan ulashing va bonus oling!`;
            await this.bot.sendMessage(chatId, message, keyboard);
        } catch (error) {
            console.error('Error showing client info:', error);
            await this.bot.sendMessage(chatId, 'Ma\'lumotlarni yuklashda xatolik yuz berdi.');
        }
    }

    async showClientBonuses(chatId) {
        try {
            const user = await User.findOne({ chatId });
            if (!user || !user.clientId) {
                await this.bot.sendMessage(chatId, 'Mijoz ma\'lumotlari topilmadi.');
                return;
            }

            const client = await Client.findById(user.clientId);
            if (!client) {
                await this.bot.sendMessage(chatId, 'Mijoz ma\'lumotlari topilmadi.');
                return;
            }

            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Orqaga', callback_data: 'back_to_menu' }]
                    ]
                }
            };

            const message = `🎁 Sizning bonuslaringiz:\n\n` +
                           `💰 Joriy bonus: ${(client.bonus || 0).toLocaleString()} so'm\n\n` +
                           `📋 Bonus tarixi:\n` +
                           `• Ro'yxatdan o'tish bonusi\n` +
                           `• Taklif bonuslari\n` +
                           `• Xarid bonuslari\n\n` +
                           `💡 Ko'proq bonus olish uchun:\n` +
                           `- Do'stlaringizni taklif qiling\n` +
                           `- Muntazam xarid qiling\n` +
                           `- Aksiyalarda qatnashing`;

            await this.bot.sendMessage(chatId, message, keyboard);
        } catch (error) {
            console.error('Error showing bonuses:', error);
            await this.bot.sendMessage(chatId, 'Bonus ma\'lumotlarini yuklashda xatolik yuz berdi.');
        }
    }

    async showClientOrders(chatId) {
        try {
            const user = await User.findOne({ chatId });
            if (!user || !user.clientId) {
                await this.bot.sendMessage(chatId, 'Mijoz ma\'lumotlari topilmadi.');
                return;
            }

            const recentOrders = await Payment.find({ clientId: user.clientId.toString() })
                                            .sort({ createdAt: -1 })
                                            .limit(5);

            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Orqaga', callback_data: 'back_to_menu' }]
                    ]
                }
            };

            let message = `📦 Oxirgi buyurtmalaringiz:\n\n`;

            if (recentOrders.length === 0) {
                message += `Hali buyurtmalar yo'q.\n\n`;
            } else {
                recentOrders.forEach((order, index) => {
                    const orderDate = order.date || order.createdAt?.toLocaleDateString('uz-UZ') || 'Noma\'lum';
                    message += `${index + 1}. 📅 ${orderDate}\n`;
                    message += `   💰 Summa: ${(order.totalPrice || 0).toLocaleString()} so'm\n`;
                    message += `   💸 Chegirma: ${(order.discountPrice || 0).toLocaleString()} so'm\n`;
                    message += `   📋 Status: ${order.status || 'Bajarilgan'}\n`;
                    if (order.products && order.products.length > 0) {
                        message += `   📦 Mahsulotlar: ${order.products.length} ta\n`;
                    }
                    message += `\n`;
                });
            }

            message += `💡 To'liq buyurtmalar tarixini ko'rish uchun do'konimizga murojaat qiling.`;

            await this.bot.sendMessage(chatId, message, keyboard);
        } catch (error) {
            console.error('Error showing orders:', error);
            await this.bot.sendMessage(chatId, 'Buyurtmalar ma\'lumotlarini yuklashda xatolik yuz berdi.');
        }
    }

    async showClientDebts(chatId) {
        try {
            const user = await User.findOne({ chatId });
            if (!user || !user.clientId) {
                await this.bot.sendMessage(chatId, 'Mijoz ma\'lumotlari topilmadi.');
                return;
            }

            const client = await Client.findById(user.clientId);
            if (!client) {
                await this.bot.sendMessage(chatId, 'Mijoz ma\'lumotlari topilmadi.');
                return;
            }

            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Orqaga', callback_data: 'back_to_menu' }],
                        [{ text: '💳 To\'lov qilish', callback_data: 'make_payment' }]
                    ]
                }
            };

            let message = `💳 Sizning qarzlaringiz:\n\n`;
            let totalDebt = 0;

            if (!client.debts || client.debts.length === 0) {
                message += `✅ Sizda qarz yo'q! Ajoyib!\n\n`;
            } else {
                client.debts.forEach((debt, index) => {
                    if (debt.amount > 0) {
                        message += `${index + 1}. 📅 ${debt.date}\n`;
                        message += `   💰 Summa: ${debt.amount.toLocaleString()} so'm\n`;
                        message += `   📝 Izoh: ${debt.description || 'Izoh yo\'q'}\n`;
                        message += `\n`;
                        totalDebt += debt.amount;
                    }
                });

                if (totalDebt > 0) {
                    message += `🔴 Jami qarz: ${totalDebt.toLocaleString()} so'm\n\n`;
                } else {
                    message = `💳 Sizning qarzlaringiz:\n\n✅ Sizda qarz yo'q! Ajoyib!\n\n`;
                }
            }

            message += `💡 Qarzni to'lash uchun do'konimizga tashrif buyuring yoki aloqaga chiqing.`;

            await this.bot.sendMessage(chatId, message, keyboard);
        } catch (error) {
            console.error('Error showing debts:', error);
            await this.bot.sendMessage(chatId, 'Qarz ma\'lumotlarini yuklashda xatolik yuz berdi.');
        }
    }

    async showHelp(chatId) {
        const phoneNumber = '+998901234567'; 
        const phoneRegex = /^\+998\d{9}$/;
        
        if (!phoneRegex.test(phoneNumber)) {
            console.error('Invalid phone number format:', phoneNumber);
            await this.bot.sendMessage(chatId, 'Xatolik: Yordam telefon raqami noto\'g\'ri. Iltimos, administrator bilan bog\'laning.');
            return;
        }
    
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📞 Aloqa', callback_data: 'contact_support' }], 
                    [{ text: '📍 Manzil', callback_data: 'show_location' }],
                    [{ text: '🔙 Orqaga', callback_data: 'back_to_menu' }]
                ]
            }
        };
    
        const message = `📞 Yordam va aloqa:\n\n` +
                       `🏪 Do'kon nomi: Smart Dokon\n` +
                       `📞 Telefon: ${phoneNumber}\n` +
                       `📍 Manzil: Andijon\n` +
                       `🕐 Ish vaqti: 9:00 - 21:00\n\n` +
                       `❓ Tez-tez so'raladigan savollar:\n` +
                       `• Qanday qilib bonus olish mumkin?\n` +
                       `• Qarzni qanday to'lash mumkin?\n` +
                       `• Buyurtma berish mumkinmi?\n\n` +
                       `💬 Qo'shimcha yordam uchun "Aloqa" tugmasini bosing yoki ${phoneNumber} raqamiga qo'ng'iroq qiling!`;
    
        try {
            await this.bot.sendMessage(chatId, message, keyboard);
        } catch (error) {
            console.error('Error sending help message:', error);
            await this.bot.sendMessage(chatId, 'Yordam ma\'lumotlarini yuklashda xatolik yuz berdi.');
        }
    }

    generateReferralCode() {
        return Math.random().toString(36).substr(2, 8).toUpperCase();
    }
}

module.exports = ClientBot;