const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const SellerSchema = require("../Models/Seller");
const authenticateToken = require("../middleware/authenticateToken");

// Import models
const ClientSchema = require("../Models/Client");

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

router.get("/verify-user", authenticateToken, async (req, res) => {
  try {
    const seller = await SellerSchema.findById(req.user.userId)
      .select("-password")
      .lean();

    if (!seller) {
      return res.status(404).json({ message: "Foydalanuvchi topilmadi!" });
    }

    res.json(seller);
  } catch (error) {
    console.error("Foydalanuvchi tekshirish xatoligi:", error);
    res.status(500).json({ message: "Ichki server xatosi" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { login, password } = req.body;
    const seller = await SellerSchema.findOne({ login });

    if (!seller) {
      return res.status(404).json({ message: "Login topilmadi!" });
    }

    if (seller.password !== password) {
      return res.status(401).json({ message: "Parol xato!" });
    }

    // Sotuvchi statusini tekshirish
    if (seller.status === "inactive") {
      return res.status(403).json({ message: "Sizning hisobingiz faol emas!" });
    }

    if (!JWT_SECRET_KEY) {
      return res
        .status(500)
        .json({ message: "Serverda JWT_SECRET_KEY topilmadi!" });
    }

    const token = jwt.sign(
      { sellerId: seller._id, login: seller.login },
      JWT_SECRET_KEY,
      { expiresIn: "5h" }
    );

    // lastSeen maydonini yangilash
    seller.lastseen = new Date();
    await seller.save();

    res.json({ token, seller });
  } catch (error) {
    console.error("Login xatoligi:", error);
    res.status(500).json({ message: "Ichki server xatosi" });
  }
});

router.post("/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword, userType } = req.body;
    let userId;

    if (req.user.sellerId) {
      userId = req.user.sellerId;
    } else if (req.user.id) {
      userId = req.user.id;
    } else {
      return res.status(400).json({ message: "Invalid token structure" });
    }

    // Validate request
    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Current password and new password are required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "New password must be at least 6 characters long" });
    }

    let user;
    let UserModel;

    if (userType === "client") {
      UserModel = ClientSchema;
    } else if (userType === "seller") {
      UserModel = SellerSchema;
    } else if (userType === "admin") {
      UserModel = SellerSchema;
    } else {
      return res.status(400).json({ message: "Invalid user type" });
    }

    user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.password !== currentPassword) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
});

// Update profile endpoint
router.put("/update-profile", authenticateToken, async (req, res) => {
  try {
    const { userType } = req.body;
    let userId;

    if (req.user.sellerId) {
      userId = req.user.sellerId;
    } else if (req.user.id) {
      userId = req.user.id;
    } else {
      return res.status(400).json({ message: "Invalid token structure" });
    }

    const updateData = { ...req.body };
    delete updateData.password;
    delete updateData.userType;
    delete updateData._id;

    let UserModel;

    if (userType === "client") {
      UserModel = ClientSchema;
    } else if (userType === "seller") {
      UserModel = SellerSchema;
    } else {
      return res.status(400).json({ message: "Invalid user type" });
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
});

// Get user profile endpoint
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const { userType } = req.query;
    let userId;

    // Extract the correct user ID based on the token structure
    if (req.user.sellerId) {
      userId = req.user.sellerId; // For seller tokens
    } else if (req.user.id) {
      userId = req.user.id; // For client tokens or generic tokens
    } else {
      return res.status(400).json({ message: "Invalid token structure" });
    }

    let UserModel;

    // Determine which model to use based on user type
    if (userType === "client") {
      UserModel = ClientSchema;
    } else if (userType === "seller") {
      UserModel = SellerSchema;
    } else {
      return res.status(400).json({ message: "Invalid user type" });
    }

    // Find the user
    const user = await UserModel.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
