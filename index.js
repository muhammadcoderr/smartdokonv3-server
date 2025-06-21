const express = require("express");
require("dotenv").config();
const cors = require("cors");
const mongoose = require("mongoose");
const Start = require("./Bot/Start.js");
const ClientBot = require("./Bot/ClientBot.js");
const clientBot = new ClientBot();
const fs = require("fs");
const path = require("path");
const app = express();
app.use(express.json());
app.use(cors());
// clientBot()

//MongoDB Connecting
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("Connected MongoDB!"));

//connecting
app.listen(process.env.PORT, () => {
  console.log(`Server is running on http://localhost:${process.env.PORT}`);
});

//Status
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  console.log("Request Body:", req.body);
  next();
});

//Routers
const ClientRoute = require("./Routers/Client.route");
const CostsRoute = require("./Routers/Costs.route");
const PaymentRoute = require("./Routers/Payment.route");
const ProductRoute = require("./Routers/Product.route");
const SellerRoute = require("./Routers/Seller.route");
const ReturnedRoute = require("./Routers/Returned.route");
const DebtsRoute = require("./Routers/Debts.route");
const CashboxRoute = require("./Routers/Cashbox.route");
const AuthRoute = require("./Routers/auth.route.js");
app.use("/client", ClientRoute);
app.use("/costs", CostsRoute);
app.use("/payment", PaymentRoute);
app.use("/product", ProductRoute);
app.use("/seller", SellerRoute);
app.use("/returned", ReturnedRoute);
app.use("/debts", DebtsRoute);
app.use("/cashbox", CashboxRoute);
app.use("/auth", AuthRoute);
//errors
app.use(function (err, req, res, next) {
  console.error(err.message);
  if (!err.statusCode) err.statusCode = 500;
  res.status(err.statusCode).send(err.message);
});
