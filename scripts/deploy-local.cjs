const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const ROOT = path.join(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");

function updateEnvFile(filePath, entries) {
  let lines = [];

  if (fs.existsSync(filePath)) {
    lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  }

  const used = new Set();

  const next = lines.map((line) => {
    for (const [key, value] of Object.entries(entries)) {
      if (line.startsWith(`${key}=`)) {
        used.add(key);
        return `${key}=${value}`;
      }
    }
    return line;
  });

  for (const [key, value] of Object.entries(entries)) {
    if (!used.has(key)) {
      next.push(`${key}=${value}`);
    }
  }

  while (next.length && next[next.length - 1] === "") {
    next.pop();
  }

  fs.writeFileSync(filePath, `${next.join("\n")}\n`);
}

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

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Network:",
    network.name,
    network.config.url || "in-process"
  );

  console.log("Deployer:", deployer.address);

  const TestERC20 = await ethers.getContractFactory("TestERC20");

  // ------------------------------------------------------------------
  // Deploy local WETC
  // ------------------------------------------------------------------

  const wetcSupply = ethers.parseUnits("1000000", 18);

  const wetc = await TestERC20.deploy(
    "Test Wrapped ETC",
    "WETC",
    18,
    wetcSupply
  );

  await waitForReceipt(
    wetc.deploymentTransaction(),
    "WETC deploy"
  );

  console.log("WETC:", wetc.target);

  // ------------------------------------------------------------------
  // Deploy first Lot Token
  // ------------------------------------------------------------------

  const strn10kSupply = ethers.parseUnits("100000", 0);

  const strn10k = await TestERC20.deploy(
    "STRN10K",
    "STRN10K",
    0,
    strn10kSupply
  );

  await waitForReceipt(
    strn10k.deploymentTransaction(),
    "STRN10K deploy"
  );

  console.log("STRN10K:", strn10k.target);

  // ------------------------------------------------------------------
  // Deploy second Lot Token so we can exercise multi-market behavior
  // ------------------------------------------------------------------

  const testLotSupply = ethers.parseUnits("100000", 0);

  const testLot = await TestERC20.deploy(
    "Test Lot Token",
    "TESTLOT",
    0,
    testLotSupply
  );

  await waitForReceipt(
    testLot.deploymentTransaction(),
    "TESTLOT deploy"
  );

  console.log("TESTLOT:", testLot.target);

  // ------------------------------------------------------------------
  // Deploy SaturnLotExchange
  // ------------------------------------------------------------------

  const SaturnLotExchange =
    await ethers.getContractFactory("SaturnLotExchange");

  const exchange =
    await SaturnLotExchange.deploy(wetc.target, deployer.address);

  const deploymentReceipt = await waitForReceipt(
    exchange.deploymentTransaction(),
    "SaturnLotExchange deploy"
  );

  console.log("SaturnLotExchange:", exchange.target);

  // ------------------------------------------------------------------
  // Save local deployment data
  // ------------------------------------------------------------------

  const addresses = {
    WETC_ADDRESS: wetc.target,
    STRN10K_ADDRESS: strn10k.target,
    TESTLOT_ADDRESS: testLot.target,
    SATURN_LOT_EXCHANGE_ADDRESS: exchange.target,
    EXCHANGE_DEPLOYMENT_BLOCK: deploymentReceipt.blockNumber,
    STRN10K_MARKET_ID: "",
    TESTLOT_MARKET_ID: ""
  };

  updateEnvFile(ENV_PATH, addresses);

  console.log("");
  console.log("Local deployment complete.");
  console.log("");
  console.log("WETC:", wetc.target);
  console.log("Exchange:", exchange.target);
  console.log("");
  console.log("Exchange deployed inactive with no approved markets.");
  console.log("Saved deployment values to .env");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});