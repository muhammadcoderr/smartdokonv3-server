let mongoose = require("mongoose"),
  express = require("express"),
  router = express.Router();

let PaymentSchema = require("../Models/Payment");
let SellerSchema = require("../Models/Seller");
const authenticateToken = require("../middleware/authenticateToken");

router.get("/", async (req, res, next) => {
  try {
    const { page = 1, limit = 20, name } = req.query;
    const query = name ? { firstname: { $regex: name, $options: "i" } } : {};
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
    };

    const result = await SellerSchema.paginate(query, options);

    res.json({
      data: result.docs,
      totalPages: result.totalPages,
      currentPage: result.page,
    });
  } catch (error) {
    next(error);
  }
});
router.get("/get-all", async (req, res, next) => {
  try {
    const data = await SellerSchema.find().exec();

    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/edit/:id", authenticateToken, async (req, res) => {
  try {
    const sellerId = req.params.id;
    const seller = await SellerSchema.findById(sellerId);

    if (!seller) {
      return res.status(404).json({ error: "Seller not found" });
    }

    res.json(seller);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:username", authenticateToken, async (req, res) => {
  try {
    const sellerUsername = req.params.username;
    const seller = await SellerSchema.findOne({ firstname: sellerUsername });

    if (!seller) {
      return res.status(404).json({ error: "Seller not found" });
    }

    const salesData = await PaymentSchema.find({
      sellername: seller.firstname,
    });

    const responseData = {
      seller: seller.toObject(),
      sales: salesData,
    };

    res.json(responseData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.route("/create").post(authenticateToken, async (req, res, next) => {
  try {
    if (!req.body.firstname) {
      return res.status(400).json({ error: "Firstname is required" });
    }

    const data = await SellerSchema.create(req.body);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.route("/update/:id").put(authenticateToken, async (req, res, next) => {
  try {
    const data = await SellerSchema.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router
  .route("/delete/:id")
  .delete(authenticateToken, async (req, res, next) => {
    try {
      const data = await SellerSchema.findByIdAndDelete(req.params.id);
      if (data) {
        res.status(200).json({
          msg: "Seller deleted successfully",
        });
      } else {
        res.status(404).json({
          msg: "Seller not found",
        });
      }
    } catch (error) {
      next(error);
    }
  });

module.exports = router;
