const UserOtherReward = require("../models/userOtherReward.model");
const LeadershipBonus = require("../models/leadershipBonus.model");
const moment = require("moment");
const cron = require("node-cron");
const CronLog = require("../models/cronLogs.model");
const { sendCronFailureEmail, sendCappingLimitEmail } = require("../helpers/mail");
const referral = require("../services/referral");
const {OTHER_REWARD} = require('../config/constants');
const socket = require("../helpers/sockets");

let timeout;
let retryCount = 0;

const saveLeadershipBonusCron = cron.schedule("30 0 * * *", async () => {
  try {
    await saveLeadershipBonusReward();
  } catch (error) {
    console.log("Something went wrong in userRewardDetails", error?.message);
  }
});

const saveLeadershipBonusReward = async () => {
  try {
    let today = moment().subtract(1, "day").toDate();
    const startOfToday = new Date(today.setUTCHours(0, 0, 0, 0));

    const leadershipBonus = await LeadershipBonus.aggregate([
      {
        $addFields: {
          endDayDate: { $toDate: "$endDay" }, // Convert string to date
        },
      },
      {
        $match: {
          endDayDate: { $gte: new Date(moment(today).format("YYYY-MM-DD")) },
          processedAt: { $ne: startOfToday },
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
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          endDayDate: 0
        },
      },
    ])
    // .limit(parseInt(process.env.BATCH_SIZE_FOR_OTHER_REWARD));
    if (leadershipBonus.length > 0) {
      for (let i = 0; i < leadershipBonus.length; i++) {
        await upsertDataInUserOtherReward(
          leadershipBonus[i],
          today,
          startOfToday
        );
      }
    }
    console.log(
      "Successfully process the userRewardDetails cron",
      leadershipBonus
    );
  } catch (error) {
    CronLog.create({
      title: "userRewardDetails",
      error: error?.message,
    });
    console.log("Failed to process userRewardDetails cron: ", error);

    if (retryCount < process.env.MAX_RETRIES) {
      if (timeout) clearTimeout(timeout);
      retryCount++;

      console.log(
        `Retrying in ${process.env.RETRY_INTERVAL / 1000} seconds...`
      );

      timeout = setTimeout(async () => {
        console.log("Retrying userRewardDetails...");
        await saveLeadershipBonusReward();
      }, process.env.RETRY_INTERVAL);
    } else {
      console.error(`Maximum retries reached for userRewardDetails.`);
      await sendCronFailureEmail("saveUserRewardDetailsCron");
    }
  }
};

const upsertDataInUserOtherReward = async (payload, today, startOfToday) => {
  if (!payload?.userId) {
    return;
  }

  const isExist = await UserOtherReward.findOne({
    userId: payload?.userId,
    type: OTHER_REWARD.LEADERSHIP,
    rankId: payload?.rankId,
    date: { $eq: today },
  });

  const capping = await referral.handleCappingEvent(payload?.userId);
  if(capping?.isCappingReached){
    sendCappingLimitEmail(payload?.user?.email);
  }
   if (!isExist) {
    await UserOtherReward.create({
      userId: payload?.userId,
      type: OTHER_REWARD.LEADERSHIP,
      amount: payload?.amount,
      rankId: payload?.rankId,
      date: today,
    });

    await LeadershipBonus.updateOne(
      { _id: payload?._id },
      { processedAt: startOfToday }
    );
  }
};

module.exports = {
  saveLeadershipBonusCron
};
