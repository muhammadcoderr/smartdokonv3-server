const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const Cashbox = require("../Models/Cashbox");
const authenticateToken = require("../middleware/authenticateToken");

// Add caching for better performance
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes cache

// Modellar
const PaymentSchema = require("../Models/Payment");
const ClientSchema = require("../Models/Client");
const ProductSchema = require("../Models/Product");
const { ProductNumber } = require("../Bot/ProductNumber");
const monitorStock = require("../Bot/monitorStock");

// Get all payments with aggregation pipeline
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let matchStage = {};

    // Date filtering
    if (req.query.date) {
      const date = new Date(req.query.date);
      const startDate = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      );
      const endDate = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() + 1
      );

      matchStage.createdAt = {
        $gte: startDate,
        $lt: endDate,
      };
    } else if (req.query.startDate && req.query.endDate) {
      matchStage.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate + "T23:59:59.999Z"),
      };
    } else if (req.query.startDate) {
      matchStage.createdAt = { $gte: new Date(req.query.startDate) };
    } else if (req.query.endDate) {
      matchStage.createdAt = {
        $lte: new Date(req.query.endDate + "T23:59:59.999Z"),
      };
    }

    // Build aggregation pipeline
    const pipeline = [
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      {
        $addFields: {
          clientId: { $toObjectId: "$clientId" }, // convert string to ObjectId
        },
      },
      {
        $lookup: {
          from: "clients",
          localField: "clientId",
          foreignField: "_id",
          as: "client",
          pipeline: [{ $project: { firstname: 1 } }],
        },
      },
      {
        $unwind: {
          path: "$client",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          clientName: "$client.firstname",
        },
      },
      {
        $project: {
          client: 0,
        },
      },
      {
        $facet: {
          paginatedResults: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const [result] = await PaymentSchema.aggregate(pipeline);
    let data = result.paginatedResults || [];
    const totalCount = result.totalCount[0]?.count || 0;

    // Populate products efficiently using a single query
    if (data.length > 0) {
      const allProductIds = [];
      data.forEach((payment) => {
        payment.products.forEach((product) => {
          if (
            product.productId &&
            !allProductIds.includes(product.productId.toString())
          ) {
            allProductIds.push(product.productId.toString());
          }
        });
      });

      const productsMap = {};
      if (allProductIds.length > 0) {
        const products = await ProductSchema.find(
          { _id: { $in: allProductIds } },
          { name: 1 }
        ).lean();

        products.forEach((product) => {
          productsMap[product._id.toString()] = product.name;
        });
      }

      // Map products to payments
      data = data.map((payment) => ({
        ...payment,
        products: payment.products.map((productItem) => ({
          ...productItem,
          productId:
            productsMap[productItem.productId?.toString()] ||
            productItem.productId,
        })),
      }));
    }

    let filteredData = data;

    if (req.query.clientName) {
      filteredData = filteredData.filter(
        (payment) =>
          payment.clientFirstName &&
          payment.clientFirstName
            .toLowerCase()
            .includes(req.query.clientName.toLowerCase())
      );
    }

    if (req.query.productName) {
      filteredData = filteredData.filter((payment) =>
        payment.products.some(
          (product) =>
            product.productId &&
            typeof product.productId === "string" &&
            product.productId
              .toLowerCase()
              .includes(req.query.productName.toLowerCase())
        )
      );
    }

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      data: filteredData,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNextPage,
        hasPrevPage,
        limit,
        skip,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get payment by ID with aggregation
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const paymentId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(paymentId)) {
      return res.status(400).json({ error: "Invalid payment ID format" });
    }

    const pipeline = [
      { $match: { _id: new mongoose.Types.ObjectId(paymentId) } },
      {
        $lookup: {
          from: "clients",
          localField: "clientId",
          foreignField: "_id",
          as: "client",
          pipeline: [{ $project: { firstname: 1 } }],
        },
      },
      {
        $unwind: {
          path: "$client",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          clientFirstName: "$client.firstname",
        },
      },
      {
        $project: {
          client: 0,
        },
      },
    ];

    const [payment] = await PaymentSchema.aggregate(pipeline);

    if (!payment) {
      return res.status(404).json({ error: "To'lov topilmadi" });
    }

    // Populate products efficiently
    if (payment.products && payment.products.length > 0) {
      const productIds = payment.products
        .map((p) => p.productId)
        .filter(Boolean);

      if (productIds.length > 0) {
        const products = await ProductSchema.find(
          { _id: { $in: productIds } },
          { name: 1 }
        ).lean();

        const productsMap = {};
        products.forEach((product) => {
          productsMap[product._id.toString()] = product.name;
        });

        payment.products = payment.products.map((productItem) => ({
          ...productItem,
          name:
            productsMap[productItem.productId?.toString()] ||
            productItem.productId,
        }));
      }
    }

    res.json(payment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Bonus value caching
const getBonusValue = () => {
  const cacheKey = "bonusValue";
  let bonusValue = cache.get(cacheKey);

  if (bonusValue === undefined) {
    const bonusFilePath = path.join(__dirname, "../DB/bonus.txt");
    try {
      bonusValue = parseInt(fs.readFileSync(bonusFilePath, "utf8").trim(), 10);
      cache.set(cacheKey, bonusValue, 60); // Cache for 1 minute
    } catch (error) {
      console.error("Bonus faylini o'qishda xatolik:", error);
      bonusValue = 0;
      cache.set(cacheKey, bonusValue, 60);
    }
  }

  return bonusValue;
};

// Update client bonus
const updateClientBonus = async (clientId, discountPrice) => {
  try {
    const bonusValue = getBonusValue();
    if (bonusValue > 0) {
      const bonusAmount = (discountPrice * bonusValue) / 100;

      // Use atomic update operation
      await ClientSchema.findByIdAndUpdate(
        clientId,
        { $inc: { bonus: bonusAmount } },
        { new: true }
      );
    }
  } catch (error) {
    console.error("Mijoz bonusini yangilashda xatolik:", error);
  }
};

// Create payment with transaction
router.post("/create", authenticateToken, async (req, res, next) => {
  try {
    const {
      products,
      clientId,
      indebtedness,
      type,
      discountPrice,
      cash,
      terminal,
      cashback,
      avialable,
    } = req.body;

    // Mahsulotlar sonini kamaytirish
    for (const item of products) {
      const product = await ProductSchema.findById(item.productId);
      if (product) {
        product.avialable -= item.quantity; // Mahsulot sonini kamaytirish
        await product.save();

        if (product.avialable <= 1) {
          await monitorStock.monitorStock(product); // Mahsulot tugaganda monitorStock chaqirish
        }

        if (product.avialable <= -1) {
          ProductNumber(product, item.quantity); // Minusga sotilgan miqdor
          await product.save();
        }
      }
    }

    // Mijozga qarz yozish (agar qarz bo'lsa)
    if (indebtedness > 0) {
      const client = await ClientSchema.findById(clientId);
      if (client) {
        client.debts.push({
          description: "To'lov qarzi",
          date: new Date().toISOString().split("T")[0], // Bugungi sana
          amount: indebtedness,
        });
        await client.save();
      }
    }

    // Mijozning bonus hisobini yangilash
    await updateClientBonus(clientId, discountPrice);

    // To'lovni yaratish
    const paymentData = {
      ...req.body,
      status: type === "pos" ? "success" : "waiting", // type ga qarab statusni o'zgartirish
    };

    const data = await PaymentSchema.create(paymentData);

    // Cashbox balanslarini yangilash
    const cashbox = await Cashbox.findOne(); // Birinchi cashbox ni topish
    if (cashbox) {
      if (cash > 0) {
        cashbox.cashBalance += cash; // Naqd pul balansini yangilash
      }
      if (terminal > 0) {
        cashbox.cardBalance += terminal; // Terminal orqali to'lov balansini yangilash
      }
      if (cashback > 0) {
        // Cashback mijozning bonus hisobidan chiqariladi
        const client = await ClientSchema.findById(clientId);
        if (client) {
          client.bonus -= cashback; // Bonus hisobidan chiqarish
          await client.save();
        }
      }
      await cashbox.save();
    }

    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Update payment with transaction
router.put("/update/:id", authenticateToken, async (req, res, next) => {
  try {
    const paymentId = req.params.id;
    const { cash, terminal, cashback } = req.body;

    // Avvalgi to'lov ma'lumotlarini topish
    const oldPayment = await PaymentSchema.findById(paymentId);
    if (!oldPayment) {
      return res.status(404).json({ msg: "To'lov topilmadi" });
    }

    // Cashbox ni topish
    const cashbox = await Cashbox.findOne();
    if (!cashbox) {
      return res.status(404).json({ error: "Cashbox topilmadi" });
    }

    // Avvalgi to'lov miqdorlarini Cashbox balanslaridan chiqarish
    if (oldPayment.cash > 0) {
      cashbox.cashBalance -= oldPayment.cash; // Naqd pul balansidan chiqarish
    }
    if (oldPayment.terminal > 0) {
      cashbox.cardBalance -= oldPayment.terminal; // Terminal balansidan chiqarish
    }
    if (oldPayment.cashback > 0) {
      // Cashback ni mijozning bonus hisobidan chiqarish
      const client = await ClientSchema.findById(oldPayment.clientId);
      if (client) {
        client.bonus -= oldPayment.cashback;
        await client.save();
      }
    }

    // Yangi to'lov miqdorlarini Cashbox balanslariga qo'shish
    if (cash > 0) {
      cashbox.cashBalance += cash; // Naqd pul balansini yangilash
    }
    if (terminal > 0) {
      cashbox.cardBalance += terminal; // Terminal orqali to'lov balansini yangilash
    }
    if (cashback > 0) {
      // Cashback mijozning bonus hisobiga qo'shiladi
      const client = await ClientSchema.findById(oldPayment.clientId);
      if (client) {
        client.bonus += cashback;
        await client.save();
      }
    }

    // Cashbox ni saqlash
    await cashbox.save();

    // To'lovni yangilash
    const updatedPayment = await PaymentSchema.findByIdAndUpdate(
      paymentId,
      req.body,
      {
        new: true,
      }
    );

    res.json(updatedPayment);
  } catch (error) {
    next(error);
  }
});

//  Delete payment with transaction
router.delete("/delete/:id", authenticateToken, async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const paymentId = req.params.id;

      if (!mongoose.Types.ObjectId.isValid(paymentId)) {
        throw new Error("Invalid payment ID format");
      }

      const payment = await PaymentSchema.findByIdAndDelete(paymentId, {
        session,
      });
      if (!payment) {
        throw new Error("To'lov topilmadi");
      }

      // Prepare cashbox update
      const cashboxUpdate = { $inc: {} };

      if (payment.cash > 0) {
        cashboxUpdate.$inc.cashBalance = -payment.cash;
      }
      if (payment.terminal > 0) {
        cashboxUpdate.$inc.cardBalance = -payment.terminal;
      }

      // Update cashbox if needed
      if (Object.keys(cashboxUpdate.$inc).length > 0) {
        await Cashbox.findOneAndUpdate({}, cashboxUpdate, {
          session,
          upsert: true,
        });
      }

      // Handle cashback
      if (payment.cashback > 0 && payment.clientId) {
        await ClientSchema.findByIdAndUpdate(
          payment.clientId,
          { $inc: { bonus: -payment.cashback } },
          { session }
        );
      }

      res.status(200).json({ msg: "To'lov muvaffaqiyatli o'chirildi" });
    });
  } catch (error) {
    next(error);
  } finally {
    await session.endSession();
  }
});

module.exports = router;
