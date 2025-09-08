const ResponseHelper = require("../helpers/response");
const services = require("../services/index");
const User = require("../models/user.model");
const { ObjectId } = require("mongoose").Types;
const { DEFAULT_STATUS } = require("../config/constants");
const Transaction = require("../models/transaction.model");
const Stake = require("../models/stake.model");
const TokenExchange = require("../models/tokenExchange.model");
const Withdrawal = require("../models/withdrawal.model");
const { totalWithdrawalAmount, totalPartialWithdrawalAmount } = require("../services/withdrawal");

class FundsTransferController {
  /**
   * @param req request body
   * @param res callback response object
   * @description This method to get user notification listing
   */
  static async create(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      if (req?.body?.toUserId) {
        const user = await User.findById(new ObjectId(req?.body?.toUserId));
        if (user?.status === DEFAULT_STATUS.BANNED) {
          response.message = "Invalid User Id";
          response.status = 400;
          return;
        }
      }

      response = await services.fundsTranferService.createFundsTransfer(
        req.body,
        response
      );
    } catch (error) {
      console.error("create funds error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  static async complete(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {

      response = await services.fundsTranferService.completeFundsTransfer(
        req,
        response
      );
    } catch (error) {
      console.error("create funds error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  static async getFundsByUser(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );
    response = await services.fundsTranferService.getFundsTransferByPayload(
      req,
      response
    );

    try {
    } catch (error) {
      console.error("funds fetch error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }
  static async availableToConvert(req, res) {
    try {
      const userId = req.params.userId;
      if (!userId) {
        return res.status(400).json(ResponseHelper.getResponse(false, "User ID is required", {}, 400));
      }

      const objectIdUserId = new ObjectId(userId);

      const partialWithdrawalAmount = await totalPartialWithdrawalAmount(objectIdUserId)
      const withdrawalAmount = await totalWithdrawalAmount(objectIdUserId);
      const withdrawalAmountToDeduct = (withdrawalAmount[0]?.totalAmount || 0) + (partialWithdrawalAmount[0]?.totalAmount || 0)
      // console.log("withdrawalAmountToDeduct",withdrawalAmountToDeduct)
      // Aggregate the total sell amount
      const [registerAmount,] = await Promise.all([
        TokenExchange.aggregate([
          { $match: { userId: objectIdUserId, type: "sell", status: "completed" } },
          { $group: { _id: null, totalSell: { $sum: "$amount" } } }
        ]),

      ]);


      const totalRegister = registerAmount[0]?.totalSell || 0;
      const availableAmountToConvert = withdrawalAmountToDeduct - totalRegister;

      return res.status(200).json(
        ResponseHelper.getResponse(true, "Available amount to convert retrieved successfully", { availableAmountToConvert }, 200)
      );
    } catch (error) {
      console.error("Error fetching available amount to convert:", error);
      return res.status(500).json(
        ResponseHelper.getResponse(false, error.message || "An internal server error occurred", {}, 500)
      );
    }
  }

}

module.exports = FundsTransferController;
