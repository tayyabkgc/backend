const mongoose = require("mongoose");

const connectDB = () => {
  const DB_URI = process.env.MONGO_DATABASE_BASE_URI; // Replace with your MongoDB connection string

  try {
    // mongoose.set({ debug: true });
    mongoose.connect(DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const dbConnection = mongoose.connection;
  dbConnection.once("open", (_) => {
    console.log(`Database connected: ${DB_URI}`);
  });

  dbConnection.on("error", (err) => {
    console.error(`connection error: ${err}`);
  });
  return;
};

module.exports = connectDB;
