require("dotenv").config();
const createError = require("http-errors");
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const connectDB = require("./config/db");
const startCronJobs = require("./cron/index");
const indexRouter = require("./routes/index");
if (process.env.APP_ENV === 'production') {
  const Sentry = require('@sentry/node');
  Sentry?.init({
    dsn: process.env.SENTRY_DSN,
  });
}
// const marketEventListener=require('./contract/marketEventListener');
// const KGCEventListener=require("./contract/kgcEventListener");
const fs = require("fs");
require('./seeders');

const app = express();
connectDB();

startCronJobs();

app.use(
  cors({
    origin: [
      process.env.FRONTEND_BASE_URL,
      process.env.FRONTEND_ADMIN_BASE_URL,
    ],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  })
);

app.use(
  session({
    secret: "cyberwolve",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }, // Adjust the maxAge as needed
  })
);

app.use(passport.initialize());
app.use(passport.session());

// view engine setup
/* app.engine("pug", require("pug").__express);
app.set("views", path.join(__dirname, "views")); */
app.set("view engine", "ejs");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use(express.static('assets'));
app.use('/uploads/images/', express.static(`${__dirname}/uploads/images/`));
app.use('/uploads/media/', express.static(`${__dirname}/uploads/media/`));

app.get('/api/uploads/images/:imageName', (req, res) => {
  const { imageName } = req.params;
   // Check if the image exists
   const imagePath = path.join(__dirname, 'uploads', 'images', imageName);
   if (fs.existsSync(imagePath)) {
     // Image exists, send it as a response
     res.sendFile(imagePath);
   } else {
     // Image does not exist, return a 404 error
     res.status(404).json({ error: 'Image not found' });
   }
});

// app.use(errorHandler);
app.use("/api", indexRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});
// marketEventListener.addContractToListen(
//   process.env.REGISTER_CONTRACT_ADDRESS
// );

// KGCEventListener.addContractToListen(
//   process.env.KGC_CONTRACT_ADDRESS
// );


// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
