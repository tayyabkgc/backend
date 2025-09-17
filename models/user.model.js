const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const phonePattern = /^\+(?:[0-9]●?){6,14}[0-9]$/;
const validatePhone = (phoneNumber) => {
  return phonePattern.test(phoneNumber);
};

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      trim: true,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    userName: {
      type: String,
      required: false,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    kycStatus: {
      type: String,
      enum: [
        "created",
        "readyToReview",
        "approved",
        "inReview",
        "rejected",
        "blocked",
        "deleted",
        "pending",
      ],
      default: "pending",
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    is2faEnabled: {
      type: Boolean,
      required: false,
      default: false,
    },
    address: {
      type: String,
      required: false,
    },
    city: {
      type: String,
      required: false,
    },
    zipCode: {
      type: String,
      required: false,
    },
    state: {
      type: String,
      required: false,
    },
    country: {
      type: String,
      required: false,
    },
    role: {
      type: String,
      ref: "Role",
      required: false,
    },
    profilePicture: {
      type: String,
      required: false,
      default:
        "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y",
    },
    status: {
      type: String,
      enum: ["pending", "active", "banned"],
      default: "pending",
    },
    signupMethod: {
      type: String,
      enum: ["google", "manual"],
      default: "manual",
    },
    walletAddress: {
      type: String,
      required: false,
    },
    walletType: {
      type: String,
      enum: ["metaMask", "tokenPocket", "trustWallet", "safePal"],
      required: false,
    },
    registrationFeePaid: {
      type: Boolean,
      default: false,
    },
    registrationTransactionId: {
      type: mongoose.Types.ObjectId,
      ref: "Transaction",
    },
    referredBy: {
      type: mongoose.Types.ObjectId,
      ref: "User",
    },
    phoneNumber: {
      type: String,
      required: false,
      // validate: [validatePhone, "Please fill a valid phone nnumber!!"],
    },
    otpCode: {
      type: Number,
      default: null,
    },
    otpExpiry: {
      type: Date,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
      required: false
    },
    referralProcessedAt: {
      type: Date,
      default: null,
      required: false
    },
    userRankId:
    {
      type: Number,
      required: false,
      default: null
    },
    isKGCSaleInactive: {
      type: Boolean,
      default: false,
    },
    isWithdrawInactive: {
      type: Boolean,
      default: false,
    },
     isLevelIncomeInactive: {
      type: Boolean,
      default: false,
    },
    userRankIdRecord:
    {
      type: Number,
      required: false,
      default: null
    },
    BannedAt: {
      type: Date,
      default: null,
      required: false
    },
  },
  {
    timestamps: true,
    // collection: 'users'
  }
);

userSchema.pre("save", async function (next) {
  const user = this;
  if (user.isModified("password")) {
    user.password = await bcrypt.hash(user.password, 10);
  }

  next();
});

const User = mongoose.model("User", userSchema);

module.exports = User;
