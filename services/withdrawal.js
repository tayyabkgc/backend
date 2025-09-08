const Withdrawal = require("../models/withdrawal.model.js");
const PartialWithdrawal = require("../models/partialWithdrawal.model.js");
const referral = require("../services/referral");

const mongoose = require("mongoose");
const UserOtherReward = require("../models/userOtherReward.model");
const UserStakeReward = require("../models/userStakingReward.model");
const { ObjectId } = require("mongoose").Types;
const {
  DEFAULT_STATUS,
  CONTRACT_EVENTS,
  TRANSACTION_STATUS,
  TRANSACTION_TYPES,
  OTHER_REWARD,
} = require("../config/constants.js");
const Transaction = require("../models/transaction.model.js");
const socket = require("../helpers/sockets");
const { transferFunds, getWithdrawalAmountFromContract } = require("../helpers/web3.js");
const PartialWithdrawals = require("../models/partialWithdrawal.model.js");
const helper = require("../helpers/index");
const {getAdminBlnc}=require('../helpers/web3');
const User = require("../models/user.model.js");

const create = async (req, response) => {
  const { userId, amount } = req.body;
  const { stakingAmount, otherRewardAmount } =
    await calculateTotalWithdrawalAmount(new ObjectId(userId));
  const partialWithdrawalAmountFixed=Number((Number(Number(amount)?.toFixed(6))-Number(Number(stakingAmount)?.toFixed(6)))?.toFixed(6))
  const otherRewardAmountFixed=Number(Number(otherRewardAmount).toFixed(6))
  let withdrawalAmountFromContract = 0;
  const withdrawal = new Withdrawal({
    userId,
  });
  const adminBlnc=await getAdminBlnc()
  //**** if there is no staking reward***//
  if (stakingAmount <= 0 && amount > 0) {
    if(adminBlnc<amount||amount>otherRewardAmountFixed){
      response.message = "Something went wrong please try again later";
      response.status = 200;
      response.success = false;
      return
    }
    response =await makePartialPayment({ userId, amount, withdrawal }, response);
    return response;
  } else if (
    partialWithdrawalAmountFixed > 0 &&
    partialWithdrawalAmountFixed > otherRewardAmountFixed
  ) {
    withdrawalAmountFromContract = amount - partialWithdrawalAmountFixed;
    response.success = false;
    response.message = "Insuficient funds";
    response.status = 400;
    return response;
  }
  //**** if withdrawal amount is greater than staking reward***//
  else if (
    partialWithdrawalAmountFixed > 0 &&
    partialWithdrawalAmountFixed <= otherRewardAmountFixed
  ) {
    withdrawalAmountFromContract = amount - partialWithdrawalAmountFixed;

    if(adminBlnc<partialWithdrawalAmountFixed){
      response.message = "Something went wrong please try again later";
      response.status = 200;
      response.success = false;
      return
    }
    await createPartialWithdrawal({
      userId,
      amount: partialWithdrawalAmountFixed,
      withdrawalId: withdrawal?._id,
    });
  } else {
    withdrawalAmountFromContract = amount;
  }
  withdrawal.amount = withdrawalAmountFromContract;
  await withdrawal.save();
  response.success = true;
  response.message = "Withdrawal added successfully";
  response.status = 201;
  response.data = {
    ...JSON.parse(JSON.stringify(withdrawal)),
    partialWithdrawalAmount:
    partialWithdrawalAmountFixed > 0 ? partialWithdrawalAmountFixed : 0,
    withdrawalAmountFromContract,
  };
  return response;
};
const makePartialPayment = async ({ userId, amount, withdrawal }, response) => {
  const partialWithdrawal = await createPartialWithdrawal({
    userId,
    amount,
    withdrawalId: withdrawal?._id,
  });
  const partialWithdrawalAmount = await PartialWithdrawal.findById(
    partialWithdrawal?._id
  ).populate("userId");
 const receipt= await withdrawAmount(
    partialWithdrawalAmount?.userId?.walletAddress,
    partialWithdrawalAmount?.amount,
    partialWithdrawalAmount?.userId?._id,
    partialWithdrawalAmount?._id
  );
  await updatePartialWithdrawal(receipt?.transactionHash)
  response.success = true;
  response.message = "Withdrawal added successfully";
  response.status = 201;
  response.data = {};
  return response;
};
const createPartialWithdrawal = async (payload) => {
  return await PartialWithdrawal.create(payload);
};

const completeWithdrawal = async (req, response) => {
  const { userId, txHash, fiatAmount, cryptoAmount } = req.body;
  const { id: withdrawalId } = req.params;
  const stake = await Withdrawal.findOne({ _id: withdrawalId });
  if (stake) {
    const transaction = await Transaction.create({
      userId,
      txHash,
      type: TRANSACTION_TYPES.WITHDRAWAL,
      fiatAmount,
      cryptoAmount,
      status: DEFAULT_STATUS.PENDING,
    });
    const updatedWithdrawal = await Withdrawal.findOneAndUpdate(
      { _id: withdrawalId },
      { transactionId: transaction?._id }
    );
    if (updatedWithdrawal) {
      response.success = true;
      response.message = "Withdrawal completed successfully";
      response.status = 200;
      response.data = updatedWithdrawal;
      return response;
    }
    response.success = fase;
    response.message = "Something went wrong";
    response.status = 400;
    return response;
  }
};

const getWithdrawalByPayload = async (req, response) => {
  const { userId } = req.params;
  const { status = DEFAULT_STATUS.INACTIVE } = req.query;
  const withdrawal = await Withdrawal.findOne({
    userId: new ObjectId(userId),
    status,
  })
    .populate("userId")
    .populate("transactionId");

  response.success = true;
  response.message = "Withdrawal fetched successfully";
  response.status = 200;
  response.data = withdrawal || {};
  return response;
};

const getAllWithdrawalsByPayload = async (req, response) => {
  const { userId } = req.params;
  const { status = DEFAULT_STATUS.INACTIVE, page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;
  const withdrawals = await Withdrawal.find({
    userId: new ObjectId(userId),
    status,
  })
    .populate("userId")
    .populate("transactionId")
    .skip(skip)
    .limit(parseInt(limit));

  response.success = true;
  response.message = "Withdrawals fetched successfully";
  response.status = 200;
  response.data = withdrawals;
};

const updateWithdrawal = (query, payload) => {
  return Withdrawal.findOneAndUpdate(query, payload);
};

const handleWithdrawalEvent = async (txHash) => {
  const transaction = await Transaction.findOneAndUpdate(
    { txHash },
    { status: TRANSACTION_STATUS.COMPLETED }
  );
  if (transaction) {
    const withdrawal = await Withdrawal.findOneAndUpdate(
      {
        transactionId: transaction?._id,
        status: DEFAULT_STATUS.PENDING,
      },
      { status: DEFAULT_STATUS.ACTIVE }
    );


    if (withdrawal) {
      const partialWithdrawalAmount = await PartialWithdrawal.findOne({
        withdrawalId: withdrawal?._id,
      }).populate("userId");
      if (partialWithdrawalAmount) {
        const receipt = await withdrawAmount(
          partialWithdrawalAmount?.userId?.walletAddress,
          partialWithdrawalAmount?.amount,
          partialWithdrawalAmount?.userId?._id,
          partialWithdrawalAmount?._id
        );
        await updatePartialWithdrawal(receipt?.transactionHash);
      } else {
        socket.io
          .to(`${withdrawal?.userId}`)
          .emit(CONTRACT_EVENTS.WITHDRAWAL, {});
      }
    }
  }
};

const updateStake = (query, payload) => {
  return Stake.findOneAndUpdate(query, payload);
};


const getWithdrawalAmount = async (req, response) => {
  const { userID } = req.params;
  const userId = new ObjectId(userID);
  const { combinedTotalAmount, stakingAmount, otherRewardAmount } =
    await calculateTotalWithdrawalAmount(userId);
  response.success = true;
  response.message = "Withdrawal amount calculated";
  response.status = 200;
  response.data = { combinedTotalAmount, stakingAmount, otherRewardAmount };
  return response;
};

const calculateTotalWithdrawalAmount = async (_id) => {
  const stakingRewardBonus = await referral.stakingRewardAmount(_id);
  const referralLevelBonus = await referral.referralLevelAmount(_id,  OTHER_REWARD.INCOME_LEVEL);
  const leadershipBonus = await referral.referralLevelAmount(_id,  OTHER_REWARD.LEADERSHIP)
  const instantRewardBonus =  await referral.referralLevelAmount(_id,  OTHER_REWARD.INSTANT_BONUS);
  const partialWithdrawalAmount=await totalPartialWithdrawalAmount(_id)
  const withdrawalAmount = await totalWithdrawalAmount(_id);
 const withdrawalAmountToDeduct=(withdrawalAmount[0]?.totalAmount || 0)+(partialWithdrawalAmount[0]?.totalAmount||0)
  const totalBonus =helper.convertNegativeToZero( stakingRewardBonus + referralLevelBonus + leadershipBonus + instantRewardBonus)
  const availableBonusBalance =helper.convertNegativeToZero( totalBonus - (withdrawalAmountToDeduct))
  const stakingAmount = helper.convertNegativeToZero((stakingRewardBonus + instantRewardBonus) - (withdrawalAmount[0]?.totalAmount || 0));
  const otherRewardAmount =helper.convertNegativeToZero( (leadershipBonus+referralLevelBonus-(partialWithdrawalAmount[0]?.totalAmount||0)));
  // const combinedTotalAmount = helper.getAbsoluteAmount(availableBonusBalance);
  const combinedTotalAmount = helper.convertNegativeToZero(availableBonusBalance);
  console.log("withdrawalAmountToDeduct",partialWithdrawalAmount,withdrawalAmount)
  return {
    combinedTotalAmount: Number(combinedTotalAmount),
    stakingAmount,
    otherRewardAmount,

    stakingRewardBonus,
    referralLevelBonus,
    leadershipBonus,
    instantRewardBonus,
    withdrawalAmount:withdrawalAmountToDeduct,
    totalBonus,
    availableBonusBalance:Number(combinedTotalAmount)
  };
};

const userStakeReward = (userId) => {
  return UserStakeReward.aggregate([
    {
      $match: { userId },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $unwind: "$user",
    },
    {
      $match: {
        "user.status": DEFAULT_STATUS.ACTIVE,
      },
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$amount" },
      },
    },
    {
      $project: {
        _id: 0,
        totalAmount: 1,
      },
    },
  ]);
};

const userOtherReward = (userId, type, value) => {
  return UserOtherReward.aggregate([
    {
      $match: {
        userId,
        ...(type && { type }), // Conditionally include type
        type: value, // Exclude records with type 'instant_bonus'
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $unwind: "$user",
    },
    {
      $match: {
        "user.status": DEFAULT_STATUS.ACTIVE,
      },
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$amount" },
      },
    },
    {
      $project: {
        _id: 0,
        totalAmount: 1,
      },
    },
  ]);
};
const totalWithdrawalAmount = async (userId) => {
 const user=await User.findById(new ObjectId(userId))
 const amount=await getWithdrawalAmountFromContract(user?.walletAddress)
 return [
  {
    totalAmount:amount||0
  }
 ]
  // return Withdrawal.aggregate([
  //   {
  //     $match: { userId, status: DEFAULT_STATUS.ACTIVE },
  //   },
  //   {
  //     $lookup: {
  //       from: "users",
  //       localField: "userId",
  //       foreignField: "_id",
  //       as: "user",
  //     },
  //   },
  //   {
  //     $unwind: "$user",
  //   },
  //   {
  //     $match: {
  //       "user.status": DEFAULT_STATUS.ACTIVE,
  //     },
  //   },
  //   {
  //     $group: {
  //       _id: null,
  //       totalAmount: { $sum: "$amount" },
  //     },
  //   },
  //   {
  //     $project: {
  //       _id: 0,
  //       totalAmount: 1,
  //     },
  //   },
  // ]);
};
const totalPartialWithdrawalAmount = (userId) => {
  return PartialWithdrawal.aggregate([
    {
      $match: { userId, status: DEFAULT_STATUS.ACTIVE },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $unwind: "$user",
    },
    {
      $match: {
        "user.status": DEFAULT_STATUS.ACTIVE,
      },
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$amount" },
      },
    },
    {
      $project: {
        _id: 0,
        totalAmount: 1,
      },
    },
  ]);
};
const withdrawAmount = async (
  toAddress,
  amount,
  userId,
  partialWithdrawalAmountId
) => {
  const receipt = await transferFunds(
    toAddress,
    amount,
    userId,
    partialWithdrawalAmountId
  );
  return receipt;
};
const updatePartialWithdrawal = async (txHash) => {
  const tx = await Transaction.findOneAndUpdate(
    { txHash },
    { status: TRANSACTION_STATUS.COMPLETED }
  );
  if (tx) {
    const partialWithdrawal = await PartialWithdrawals.findOneAndUpdate(
      {
        transactionId: tx?._id,
      },
      { status: DEFAULT_STATUS.ACTIVE }
    );
    if (partialWithdrawal) {
      socket.io
        .to(`${partialWithdrawal?.userId}`)
        .emit(CONTRACT_EVENTS.WITHDRAWAL, {});
    }
  }
};
const getPendingWithdrawals = async () => {
  const ninetySecondsAgo = new Date(Date.now() - 90 * 1000);
  return await Withdrawal.find(
    {
      status: "pending",
      createdAt: { $lt: ninetySecondsAgo },
      transactionId: { $ne: null },
    }
    //  }
  ).populate("transactionId");
};
const getPendingPartialWithdrawals = async () => {
  const ninetySecondsAgo = new Date(Date.now() - 90 * 1000);
  return await PartialWithdrawals.find(
    {
      status: "pending",
      createdAt: { $lt: ninetySecondsAgo },
      transactionId: { $ne: null },
    }
    //  }
  ).populate("transactionId");
};
module.exports = {
  create,
  getWithdrawalByPayload,
  getAllWithdrawalsByPayload,
  updateWithdrawal,
  handleWithdrawalEvent,
  getWithdrawalAmount,
  completeWithdrawal,
  withdrawAmount,
  userStakeReward,
  userOtherReward,
  totalWithdrawalAmount,
  updatePartialWithdrawal,
  calculateTotalWithdrawalAmount,
  getPendingWithdrawals,
  getPendingPartialWithdrawals,
  totalPartialWithdrawalAmount
};
