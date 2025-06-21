const mongoose = require("mongoose"),
  express = require("express"),
  router = express.Router();
const { v4: uuidv4 } = require("uuid");
const authenticateToken = require("../middleware/authenticateToken");

// Models
const ClientSchema = require("../Models/Client");
const PaymentSchema = require("../Models/Payment");
const Cashbox = require("../Models/Cashbox");

// Get all clients with pagination and name filter
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, name } = req.query;
    const query = name ? { firstname: { $regex: name, $options: "i" } } : {}; // Case-insensitive search
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
    };

    const result = await ClientSchema.paginate(query, options);

    res.json({
      data: result.docs,
      totalPages: result.totalPages,
      currentPage: result.page,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/get-clientname", authenticateToken, async (req, res, next) => {
  try {
    const clients = await ClientSchema.find().select("firstname").exec();
    const clientNames = clients.map((client) => client.firstname);
    res.json(clientNames);
  } catch (error) {
    next(error);
  }
});

router.get("/get-client/debts", authenticateToken, async (req, res, next) => {
  try {
    const { name } = req.query;
    let query = {};
    if (name) {
      query = { firstname: { $regex: name, $options: "i" } };
    }
    const clients = await ClientSchema.find(query).exec();
    let debts = clients.map((client) => {
      const totalDebt = client.debts.reduce(
        (acc, debt) => acc + debt.amount,
        0
      );
      const lastDebt =
        client.debts.length > 0 ? client.debts[client.debts.length - 1] : null;

      // Modal ichidagi qarzlar ro'yxatini tartiblash
      const sortedDebts = client.debts.sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );

      return {
        _id: client._id,
        firstname: client.firstname,
        totalDebt,
        lastDebtDate: lastDebt ? lastDebt.date : null,
        debts: sortedDebts, // Tartiblangan qarzlar ro'yxati
      };
    });

    // Mijozlarni qarz miqdori bo'yicha saralash
    debts.sort((a, b) => b.totalDebt - a.totalDebt);

    res.json(debts);
  } catch (error) {
    next(error);
  }
});

// Add client debt
router.post(
  "/add-client/debt/:id",
  authenticateToken,
  async (req, res, next) => {
    try {
      const { description, date, amount } = req.body;
      const client = await ClientSchema.findById(req.params.id);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      client.debts.push({ description, date, amount });
      await client.save();
      res.json(client);
    } catch (error) {
      next(error);
    }
  }
);

// Pay client debt - FIXED VERSION
router.post("/pay-debt/:id", authenticateToken, async (req, res, next) => {
  try {
    const { amount } = req.body;
    const clientId = req.params.id;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res
        .status(400)
        .json({ error: "To'lov summasi noto'g'ri yoki kiritilmagan" });
    }

    const client = await ClientSchema.findById(clientId);
    if (!client) {
      return res.status(404).json({ error: "Mijoz topilmadi" });
    }

    if (!client.debts || client.debts.length === 0) {
      return res.status(400).json({ error: "Mijozning qarzi yo'q" });
    }

    const totalDebt = client.debts.reduce((acc, debt) => acc + debt.amount, 0);

    if (amount > totalDebt) {
      return res.status(400).json({
        error: `To'lov summasi umumiy qarzdan ko'p. Umumiy qarz: ${totalDebt}`,
      });
    }

    let remainingPayment = parseFloat(amount);
    const updatedDebts = [];

    const sortedDebts = [...client.debts].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    for (const debt of sortedDebts) {
      if (remainingPayment <= 0) {
        updatedDebts.push(debt);
        continue;
      }

      const debtAmount = parseFloat(debt.amount);

      if (remainingPayment >= debtAmount) {
        remainingPayment -= debtAmount;
      } else {
        const newDebt = {
          _id: debt._id,
          description: debt.description,
          date: debt.date,
          amount: debtAmount - remainingPayment,
        };
        updatedDebts.push(newDebt);
        remainingPayment = 0;
      }
    }

    for (const debt of sortedDebts) {
      const debtAmount = parseFloat(debt.amount);
      if (remainingPayment > 0) {
        if (remainingPayment >= debtAmount) {
          remainingPayment -= debtAmount;
        } else {
          break;
        }
      } else {
        const wasProcessed =
          updatedDebts.some(
            (ud) => ud._id.toString() === debt._id.toString()
          ) ||
          sortedDebts
            .slice(
              0,
              sortedDebts.findIndex(
                (d) => d._id.toString() === debt._id.toString()
              )
            )
            .reduce((sum, d) => sum + parseFloat(d.amount), 0) <
            parseFloat(amount);

        if (!wasProcessed) {
          updatedDebts.push(debt);
        }
      }
    }

    client.debts = updatedDebts;

    await client.save();
    res.json({
      success: true,
      message: "To'lov muvaffaqiyatli amalga oshirildi",
    });
  } catch (error) {
    console.error("Pay debt error:", error);
    next(error);
  }
});

// Delete client debt
router.delete(
  "/delete-client/debt/:clientId/:debtId",
  authenticateToken,
  async (req, res, next) => {
    try {
      const { clientId, debtId } = req.params;
      const client = await ClientSchema.findById(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      client.debts = client.debts.filter(
        (debt) => debt._id.toString() !== debtId
      );
      await client.save();
      res.json(client);
    } catch (error) {
      next(error);
    }
  }
);

router.get("/get-all", async (req, res, next) => {
  try {
    const data = await ClientSchema.find().exec();

    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get client by id and their sales data
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    const client = await ClientSchema.findById(clientId);

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    const salesData = await PaymentSchema.find({
      clientname: client.firstname,
    });

    const responseData = {
      client: client.toObject(),
      sales: salesData,
    };

    res.json(responseData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new client with referral bonus
router.route("/create").post(authenticateToken, async (req, res, next) => {
  try {
    const { getReferal, phone, ...clientData } = req.body;

    // Telefon raqami allaqachon mavjudligini tekshirish
    const existingClient = await ClientSchema.findOne({ phone });
    if (existingClient) {
      return res.status(400).json({
        error:
          "Telefon raqami allaqachon mavjud. Iltimos, boshqa raqam kiriting.",
      });
    }

    // Yangi mijoz uchun avtomatik referal kod generatsiya qilish
    clientData.referralCode = uuidv4().slice(0, 8); // 8 ta belgili noyob kod

    // Bonus, totalSpent, discountRate va purchases ni default qiymatlar bilan to'ldirish
    clientData.bonus = 0;
    clientData.totalSpent = 0;
    clientData.discountRate = 0;
    clientData.purchases = [];

    // Agar getReferal kiritilgan bo'lsa, referalni tekshirish va bonus qo'shish
    if (getReferal) {
      const referrer = await ClientSchema.findOne({ referralCode: getReferal });

      if (referrer) {
        // Referalni kiritgan mijozga 5000 bonus qo'shish
        referrer.bonus += 5000;
        await referrer.save();
      }
    }

    // Yangi mijozni yaratish
    const data = await ClientSchema.create({ phone, ...clientData });
    res.json(data);
  } catch (error) {
    next(error); // Boshqa xatoliklar uchun
  }
});

// Update client by id
router.route("/update/:id").put(authenticateToken, async (req, res, next) => {
  try {
    const data = await ClientSchema.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    console.log("Client    successfully!");
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Delete client by id
router
  .route("/delete/:id")
  .delete(authenticateToken, async (req, res, next) => {
    try {
      const data = await ClientSchema.findByIdAndDelete(req.params.id);
      if (data) {
        res.status(200).json({
          msg: "Client deleted successfully",
        });
      } else {
        res.status(404).json({
          msg: "Client not found",
        });
      }
    } catch (error) {
      next(error);
    }
  });

module.exports = router;
