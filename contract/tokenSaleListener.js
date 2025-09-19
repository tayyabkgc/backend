const { ethers } = require("ethers");
const conractInfo = require("./contractInfo");
const { syncTokenSaleFromChain } = require("../services/tokensExchange");
const provider = new ethers.JsonRpcProvider(process.env.CHAIN_STACK_SOCKET_URL);

const contract = new ethers.Contract(conractInfo.register.address, conractInfo.register.registerAbi, provider);

const listenTokenSales = () => {
    contract.on("KGCSold", async (seller, kgcAmount, usdtAmount, event) => {
        try {
            // Get tx hash from the log
            const txHash = event.log.transactionHash;

            // Optional: fetch full receipt
            const receipt = await event.getTransactionReceipt();

            // Build clean event data
            const saleData = {
                seller: seller.toLowerCase(),
                amount: kgcAmount.toString(),   // BigInt → string
                price: usdtAmount.toString(),   // BigInt → string
                txHash,
                blockNumber: event.log.blockNumber,
                timestamp: (await event.getBlock()).timestamp, // fetch block time
            };

            console.log("✅ Parsed KGCSold Event:", saleData);

            // Save to DB
            await syncTokenSaleFromChain(saleData, receipt);

        } catch (err) {
            console.error("❌ Error handling KGCSold event:", err);
        }
    });
    console.log("👂 Listening for TokenSold events on contract:", conractInfo.register.address);
};

module.exports = { listenTokenSales };
