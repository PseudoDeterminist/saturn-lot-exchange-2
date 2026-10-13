const { ethers, network } = require("hardhat");

async function waitForReceipt(tx, label) {
  const hash = tx.hash;

  for (let i = 0; i < 30; i += 1) {
    try {
      const receipt = await ethers.provider.getTransactionReceipt(hash);

      if (receipt) {
        if (receipt.status !== 1) {
          throw new Error(`${label} reverted: ${hash}`);
        }

        return receipt;
      }
    } catch (err) {
      if (!String(err).includes("transaction indexing is in progress")) {
        throw err;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${label}: ${hash}`);
}

async function seedMarket(
  exchange,
  wetc,
  lotToken,
  marketId,
  label
) {
  const maxApprove = ethers.MaxUint256;

  await waitForReceipt(
    await wetc.approve(exchange.target, maxApprove),
    `${label} WETC approve`
  );

  await waitForReceipt(
    await lotToken.approve(exchange.target, maxApprove),
    `${label} lot token approve`
  );

  const sellSeeds = label === "TESTLOT"
    ? [
        { tick: 305, lots: 15 },
        { tick: 306, lots: 25 },
        { tick: 307, lots: 35 },
        { tick: 308, lots: 45 },
        { tick: 309, lots: 55 }
      ]
    : [
        { tick: 121, lots: 60 },
        { tick: 122, lots: 56 },
        { tick: 123, lots: 52 },
        { tick: 124, lots: 48 },
        { tick: 125, lots: 44 }
      ];

  const buySeeds = label === "TESTLOT"
    ? [
        { tick: 304, lots: 18 },
        { tick: 303, lots: 28 },
        { tick: 302, lots: 38 },
        { tick: 301, lots: 48 },
        { tick: 300, lots: 58 }
      ]
    : [
        { tick: 120, lots: 60 },
        { tick: 119, lots: 56 },
        { tick: 118, lots: 52 },
        { tick: 117, lots: 48 },
        { tick: 116, lots: 44 }
      ];

  for (const order of sellSeeds) {
    await waitForReceipt(
      await exchange.placeSell(
        marketId,
        order.tick,
        order.lots
      ),
      `${label} seed sell ${order.tick}`
    );
  }

  for (const order of buySeeds) {
    await waitForReceipt(
      await exchange.placeBuy(
        marketId,
        order.tick,
        order.lots
      ),
      `${label} seed buy ${order.tick}`
    );
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();

  const exchangeAddress =
    process.env.SATURN_LOT_EXCHANGE_ADDRESS;
  const wetcAddress =
    process.env.WETC_ADDRESS;
  const strn10kAddress =
    process.env.STRN10K_ADDRESS;
  const testLotAddress =
    process.env.TESTLOT_ADDRESS;
  const strn10kMarketId =
    process.env.STRN10K_MARKET_ID;
  const testLotMarketId =
    process.env.TESTLOT_MARKET_ID;

  if (
    !exchangeAddress ||
    !wetcAddress ||
    !strn10kAddress ||
    !testLotAddress ||
    !strn10kMarketId ||
    !testLotMarketId
  ) {
    throw new Error("Missing local deployment values in .env");
  }

  console.log(
    "Network:",
    network.name,
    network.config.url || "in-process"
  );
  console.log("Seeder:", deployer.address);
  console.log("Exchange:", exchangeAddress);

  const exchange = await ethers.getContractAt(
    "SaturnLotExchange",
    exchangeAddress
  );

  const wetc = await ethers.getContractAt(
    "TestERC20",
    wetcAddress
  );

  const strn10k = await ethers.getContractAt(
    "TestERC20",
    strn10kAddress
  );

  const testLot = await ethers.getContractAt(
    "TestERC20",
    testLotAddress
  );

  if (!(await exchange.exchangeActive())) {
    throw new Error("Exchange is not active");
  }

  const actualStrn10kMarketId =
    await exchange.marketIdOf(strn10kAddress);

  const actualTestLotMarketId =
    await exchange.marketIdOf(testLotAddress);

  if (actualStrn10kMarketId !== BigInt(strn10kMarketId)) {
    throw new Error("STRN10K market ID does not match .env");
  }

  if (actualTestLotMarketId !== BigInt(testLotMarketId)) {
    throw new Error("TESTLOT market ID does not match .env");
  }

  await seedMarket(
    exchange,
    wetc,
    strn10k,
    BigInt(strn10kMarketId),
    "STRN10K"
  );

  console.log("Seeded STRN10K / WETC book.");

  await seedMarket(
    exchange,
    wetc,
    testLot,
    BigInt(testLotMarketId),
    "TESTLOT"
  );

  console.log("Seeded TESTLOT / WETC book.");
  console.log("");
  console.log("Local order books seeded.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
