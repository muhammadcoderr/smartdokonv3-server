const { v4: uuidv4 } = require("uuid");
let mongoose = require("mongoose"),
  express = require("express"),
  router = express.Router();
const mongoosePaginate = require("mongoose-paginate-v2");
let ProductSchema = require("../Models/Product");
const monitorStock = require("../Bot/monitorStock");
const deletedProduct = require("../Bot/deletedProduct");
const changeStream = ProductSchema.watch();
const authenticateToken = require("../middleware/authenticateToken");

// Add caching for categories and product names
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes cache

changeStream.on("change", async (change) => {
  if (change.operationType === "update") {
    // Clear relevant cache on updates
    cache.del(["categories", "productNames"]);

    const updatedProduct = await ProductSchema.findById(change.documentKey._id);
    if (updatedProduct && updatedProduct.avialable <= 1) {
      monitorStock.monitorStock(updatedProduct);
    }
  }
});

// Updated Product API with date filtering
router.get("/get-product", authenticateToken, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    let query = {};

    // Date filtering
    if (req.query.startDate && req.query.endDate) {
      query.updatedAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate + "T23:59:59.999Z"),
      };
    } else if (req.query.startDate) {
      query.updatedAt = { $gte: new Date(req.query.startDate) };
    } else if (req.query.endDate) {
      query.updatedAt = {
        $lte: new Date(req.query.endDate + "T23:59:59.999Z"),
      };
    }

    // Category filtering
    if (req.query.category) {
      query.category = req.query.category;
    }

    // Name filtering
    if (req.query.name) {
      query.name = { $regex: req.query.name, $options: "i" };
    }

    const pipeline = [
      { $match: query },
      {
        $facet: {
          paginatedResults: [
            { $sort: { updatedAt: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
          ],
          // Get total count
          totalCount: [{ $count: "count" }],
          // Get categories in one go
          categories: [
            { $group: { _id: "$category" } },
            { $project: { _id: 0, category: "$_id" } },
          ],
          aggregateData: [
            {
              $group: {
                _id: null,
                totalPrice: {
                  $sum: { $multiply: ["$sellingprice", "$avialable"] },
                },
                totalAvailable: { $sum: 1 },
              },
            },
          ],
        },
      },
    ];

    const [result] = await ProductSchema.aggregate(pipeline);

    const totalDocs = result.totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalDocs / limit);
    const categories = result.categories.map((item) => item.category);
    const aggregateData = result.aggregateData[0] || {
      totalPrice: 0,
      totalAvailable: 0,
    };

    res.json({
      data: result.paginatedResults,
      totalPages: totalPages,
      totalProducts: totalDocs,
      totalPrice: aggregateData.totalPrice,
      totalAvialable: aggregateData.totalAvailable,
      categories: categories,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalCount: totalDocs,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit: limit,
      },
    });
  } catch (error) {
    next(error);
  }
});

//  Get leftover products
router.get("/get-leftover", authenticateToken, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const months = parseInt(req.query.months) || 2;
    const currentDate = new Date();
    const cutoffDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - months,
      currentDate.getDate()
    );

    let matchStage = { updatedAt: { $lt: cutoffDate } };

    if (req.query.name) {
      matchStage.name = { $regex: req.query.name, $options: "i" };
    }

    const pipeline = [
      { $match: matchStage },
      {
        $facet: {
          paginatedResults: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const [result] = await ProductSchema.aggregate(pipeline);
    const totalDocs = result.totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalDocs / limit);

    res.json({
      data: result.paginatedResults,
      totalPages: totalPages,
      totalProducts: totalDocs,
    });
  } catch (error) {
    next(error);
  }
});

// Get product names with caching
router.get("/get-productname", authenticateToken, async (req, res, next) => {
  try {
    let productNames = cache.get("productNames");

    if (!productNames) {
      const products = await ProductSchema.find({}, { name: 1, _id: 0 }).lean();
      productNames = products.map((product) => product.name);

      cache.set("productNames", productNames, 300); // 5 minutes
    }

    res.json(productNames);
  } catch (error) {
    next(error);
  }
});

// Get finished products
router.get("/get-finished", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    let matchStage = { avialable: { $lt: 5 } };
    if (req.query.name) {
      matchStage.name = { $regex: req.query.name, $options: "i" };
    }

    const pipeline = [
      { $match: matchStage },
      {
        $facet: {
          paginatedResults: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const [result] = await ProductSchema.aggregate(pipeline);
    const totalDocs = result.totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalDocs / limit);

    res.json({
      data: result.paginatedResults,
      totalPages: totalPages,
      totalProducts: totalDocs,
    });
  } catch (error) {
    next(error);
  }
});

//  Get product by ID with lean query
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const clientId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ error: "Invalid product ID format" });
    }
    const client = await ProductSchema.findById(clientId).lean();

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    res.json(client);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Generate unique barcode with better collision handling
const generateUniqueBarcode = async () => {
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const barcode =
      Date.now().toString().slice(-8) + Math.floor(1000 + Math.random() * 9000);

    // Use lean() and only check existence
    const existingProduct = await ProductSchema.findOne({ barcode })
      .lean()
      .select("_id");
    if (!existingProduct) {
      return barcode;
    }
    attempts++;
  }

  // Fallback to UUID if collision keeps happening
  return uuidv4().replace(/-/g, "").slice(0, 12);
};

// Create product
router.route("/create").post(authenticateToken, async (req, res, next) => {
  try {
    const barcode = req.body.barcode || (await generateUniqueBarcode());
    const data = await ProductSchema.create({ ...req.body, barcode });

    cache.del(["categories", "productNames"]);

    // Check stock asynchronously to not block response
    if (data.avialable <= 1) {
      setImmediate(() => monitorStock.monitorStock(data));
    }

    const successMessage = "Yangi mahsulot muvaffaqiyatli yaratildi";
    console.log(successMessage, data);
    res.status(201).json({ message: successMessage, data });
  } catch (error) {
    console.error("Mahsulot yaratishda xatolik:", error);
    res
      .status(500)
      .json({ message: "Ichki server xatosi", error: error.message });
  }
});

// Update product
router.route("/update/:id").put(authenticateToken, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid product ID format" });
    }

    const data = await ProductSchema.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!data) {
      return res.status(404).json({ message: "Mahsulot topilmadi!" });
    }

    cache.del(["categories", "productNames"]);
    if (data.avialable <= 1) {
      setImmediate(() => monitorStock.monitorStock(data));
    }

    console.log("Mahsulot muvaffaqiyatli yangilandi:", data);
    res
      .status(200)
      .json({ message: "Mahsulot muvaffaqiyatli yangilandi", data });
  } catch (error) {
    console.error("Yangilashda xatolik:", error);
    res
      .status(500)
      .json({ message: "Ichki server xatosi", error: error.message });
  }
});

// Delete product
router
  .route("/delete/:id")
  .delete(authenticateToken, async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid product ID format" });
      }

      const data = await ProductSchema.findByIdAndDelete(req.params.id);
      if (data) {
        cache.del(["categories", "productNames"]);

        // Handle deletion notification asynchronously
        setImmediate(() => deletedProduct.deletedProduct(data));

        res.status(200).json({
          msg: "Post deleted successfully",
        });
      } else {
        res.status(404).json({
          msg: "Post not found",
        });
      }
    } catch (error) {
      next(error);
    }
  });

// Get product by barcode with index hint
router.get(
  "/by-barcode/:barcode",
  authenticateToken,
  async (req, res, next) => {
    try {
      const barcode = req.params.barcode;
      const product = await ProductSchema.findOne({ barcode }).lean();

      if (!product) {
        return res.status(404).json({ message: "Mahsulot topilmadi" });
      }

      res.json(product);
    } catch (error) {
      console.error("Error fetching product by barcode:", error);
      res
        .status(500)
        .json({ message: "Ichki server xatosi", error: error.message });
    }
  }
);

module.exports = router;
