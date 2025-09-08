const services = require("../services/index");
const LeadershipBonus = require("../models/leadershipBonus.model");
const moment = require("moment");
const UserRank = require("../models/userRank.model");
const { ObjectId } = require("mongoose").Types;
const cron = require("node-cron");
const {SETTING} = require("../config/constants");
const { getSettingWithKey } = require("../helpers/setting");
const CronLog = require("../models/cronLogs.model");
const { sendCronFailureEmail } = require("../helpers/mail");

let timeout;
let retryCount = 0;

const starRewardDistributionCron = cron.schedule("20 0 * * *", async () => {
  try {
    await distributeStarReward();
  } catch (error) {
    console.log(
      "Something went wrong in starRewardDistribution",
      error?.message
    );
  }
});

const distributeStarReward = async () => {
  try {
    let dataPayload = [];
    const startDate = moment().subtract(1, "day").toDate();
    const startOfToday = new Date(startDate.setUTCHours(0, 0, 0, 0));

    const userRanks = await services.rankService.getUserRank(startOfToday);
    const turnOver = await services.stakeService.calculateGlobalTurnOver(
      startOfToday
    );
    const rewardCycleDuration = await getSettingWithKey(
      SETTING.STAKE_DURATION
    );
    const rewardCycleUnit = await getSettingWithKey(
      SETTING.STAKE_DURATION_UNIT
    );
    if (turnOver.length > 0 && userRanks.length > 0) {
      for (let i = 0; i < userRanks.length; i++) {
        const rewardPercentage = userRanks[i]?.rankData?.rewardPercentage;
        const rewardAmount = (
          turnOver[0]?.totalAmount * (rewardPercentage / 100)
        );
        const amountToDistribute =
          (rewardAmount) / rewardCycleDuration;

        const bonusDetails = {
          userId: userRanks[i]?.userId,
          amount: amountToDistribute,
          startDay: moment(startOfToday).format("YYYY-MM-DD"),
          endDay: moment(startOfToday)
            .add(
              rewardCycleDuration, rewardCycleUnit
            )
            .format("YYYY-MM-DD"),
          totalTurnOver: turnOver[0]?.totalAmount,
          rewardAmount: rewardAmount,
          rewardPercentage: rewardPercentage,
          rankId: userRanks[i]?.rankId?._id,
        };

        await saveLeadershipBonusDetails(bonusDetails);
        await UserRank.updateOne(
          { _id: new ObjectId(userRanks[i]?._id) },
          { processedAt: startOfToday }
        );
        dataPayload.push(bonusDetails);
      }
    }
    console.log("🚀 ~ RewardDistribution  executed successfully:");
    return dataPayload;
  } catch (error) {
    CronLog.create({
      title: "starRewardDistributionCron",
      error: error?.message,
    });
    console.log("🚀 ~ Something went wrong in rewardDistribution:", error);

    if (retryCount < process.env.MAX_RETRIES) {
      if (timeout) clearTimeout(timeout);
      retryCount++;

      console.log(
        `Retrying in ${process.env.RETRY_INTERVAL / 1000} seconds...`
      );
      
      timeout = setTimeout(async () => {
        await distributeStarReward();
      }, process.env.RETRY_INTERVAL);
    } else {
      console.error(`Maximum retries reached for starRewardDistributionCron.`);
      await sendCronFailureEmail("starRewardDistributionCron");
    }
  }
};

const saveLeadershipBonusDetails = async (dataPayload) => {
  const isExits = await LeadershipBonus.findOne({
    userId: dataPayload.userId,
    startDay: dataPayload.startDay,
    rankId: dataPayload.rankId,
  });

  if (!isExits) {
    await LeadershipBonus.create(dataPayload);
  }
};

module.exports = { starRewardDistributionCron };
