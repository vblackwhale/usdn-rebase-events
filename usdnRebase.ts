import { ethers } from "ethers";

// Your configuration
const PROVIDER_URL =
  "https://eth-mainnet.g.alchemy.com/v2/XXXXXXXXXXXXXXXXXXXXXXXXX"; // Replace with your Ethereum node URL
const START_BLOCK = 21436997; // Replace with your starting block
const USDN_CONTRACT_ADDRESS = "0xde17a000ba631c5d7c2bd9fb692efea52d90dee2"; // Replace with actual USDN contract address
let BATCH_SIZE = 1_000_000; // Number of blocks to query at once

// ABI Fragment for the Rebase event
const ABI_FRAGMENT = [
  "event Rebase(uint256 oldDivisor, uint256 newDivisor)",
];

// Helper function to format date as dd/mm/yy hh:mm
function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear().toString().slice(-2);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// Helper function to calculate and format token value
function calculateTokenValue(divisor: ethers.BigNumber): string {
  // For 18 decimal token, base value is 1 with 18 zeros
  const baseValue = ethers.BigNumber.from("1000000000000000000");

  // Token value = baseValue / divisor
  // Handling the division carefully to maintain precision
  const value = baseValue.mul(10000).div(divisor).toNumber() / 10000;

  // Format to 4 decimal places
  return value.toFixed(4);
}

// Calculate percentage increase from old to new value
function calculatePercentageIncrease(
  oldValue: string,
  newValue: string,
): string {
  const oldVal = parseFloat(oldValue);
  const newVal = parseFloat(newValue);
  const percentageIncrease = (newVal / oldVal - 1) * 100;

  // Format to 2 decimal places
  return percentageIncrease.toFixed(2);
}

async function main() {
  console.log("Starting USDN Rebase event tracker...");

  // Initialize provider
  const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);

  // Get current block number
  const currentBlock = await provider.getBlockNumber();
  console.log(`Current block: ${currentBlock}`);
  console.log(`Starting from block: ${START_BLOCK}`);

  // Initialize contract interface
  const usdnInterface = new ethers.utils.Interface(ABI_FRAGMENT);

  // Create filter for Rebase events
  const filter = {
    address: USDN_CONTRACT_ADDRESS,
    topics: [ethers.utils.id("Rebase(uint256,uint256)")],
  };

  // Initialize results array
  const rebaseEvents: any[] = [];

  // Process blocks in batches
  let fromBlock = START_BLOCK;

  console.log("Fetching rebase events...");

  while (fromBlock <= currentBlock) {
    const toBlock = Math.min(fromBlock + BATCH_SIZE - 1, currentBlock);

    console.log(`Scanning blocks ${fromBlock} to ${toBlock}...`);

    try {
      const logs = await provider.getLogs({
        ...filter,
        fromBlock,
        toBlock,
      });

      for (const log of logs) {
        const parsedLog = usdnInterface.parseLog(log);
        const blockTimestamp = (await provider.getBlock(log.blockNumber))
          .timestamp;
        const formattedDate = formatDate(blockTimestamp);
        const oldDivisor = parsedLog.args.oldDivisor;
        const newDivisor = parsedLog.args.newDivisor;
        const oldValue = calculateTokenValue(oldDivisor);
        const newValue = calculateTokenValue(newDivisor);
        const percentIncrease = calculatePercentageIncrease(
          oldValue,
          newValue,
        );

        rebaseEvents.push({
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
          oldDivisor: oldDivisor.toString(),
          newDivisor: newDivisor.toString(),
          timestamp: blockTimestamp,
          formattedDate: formattedDate,
          oldValue: oldValue,
          newValue: newValue,
          percentIncrease: percentIncrease,
        });

        console.log(
          log.blockNumber,
          `- ${formattedDate} - ` +
            `Rebased: ${oldValue} -> ${newValue} (+${percentIncrease}%)`,
        );
      }
    } catch (error) {
      console.error(
        `Error fetching logs for blocks ${fromBlock} to ${toBlock}:`,
        error,
      );
      // Reduce batch size if we hit an error
      BATCH_SIZE = Math.floor(BATCH_SIZE / 2);
      if (BATCH_SIZE < 1000) BATCH_SIZE = 1000; // Minimum batch size
      console.log(`Reduced batch size to ${BATCH_SIZE}`);
      continue;
    }

    fromBlock = toBlock + 1;
  }

  // Calculate effective changes from rebases
  const rebaseAnalysis = rebaseEvents.map((event: any, index) => {
    const oldDivisor = ethers.BigNumber.from(event.oldDivisor);
    const newDivisor = ethers.BigNumber.from(event.newDivisor);

    // Calculate the percentage change
    // (oldDivisor - newDivisor) / oldDivisor * 100 = percentage increase in token balances
    let percentageChange = 0;
    if (!oldDivisor.isZero()) {
      percentageChange =
        oldDivisor.sub(newDivisor).mul(10000).div(oldDivisor).toNumber() /
        100;
    }

    return {
      ...event,
      percentageChange: percentageChange,
    };
  });

  console.log(`Total rebase events found: ${rebaseEvents.length}`);

  // Print summary
  if (rebaseAnalysis.length > 0) {
    console.log("\n=== Rebase Summary ===");
    console.log(
      `First rebase: ${rebaseAnalysis[0].formattedDate} (Block ${rebaseAnalysis[0].blockNumber})`,
    );
    console.log(
      `Latest rebase: ${
        rebaseAnalysis[rebaseAnalysis.length - 1].formattedDate
      } (Block ${rebaseAnalysis[rebaseAnalysis.length - 1].blockNumber})`,
    );

    // Calculate overall token value growth
    const firstValue = parseFloat(rebaseAnalysis[0].oldValue);
    const latestValue = parseFloat(
      rebaseAnalysis[rebaseAnalysis.length - 1].newValue,
    );
    const totalValueGrowth = (latestValue / firstValue - 1) * 100;

    console.log(`Initial token value: ${rebaseAnalysis[0].oldValue}`);
    console.log(
      `Current token value: ${
        rebaseAnalysis[rebaseAnalysis.length - 1].newValue
      }`,
    );
    console.log(
      `Total token growth from rebases: ${totalValueGrowth.toFixed(4)}%`,
    );

    // Calculate average time between rebases
    if (rebaseAnalysis.length > 1) {
      const avgTimeBetweenRebases =
        rebaseAnalysis.reduce((acc, event, index) => {
          if (index === 0) return acc;
          return (
            acc + (event.timestamp - rebaseAnalysis[index - 1].timestamp)
          );
        }, 0) /
        (rebaseAnalysis.length - 1);

      const days = Math.floor(avgTimeBetweenRebases / 86400);
      const hours = Math.floor((avgTimeBetweenRebases % 86400) / 3600);
      const minutes = Math.floor((avgTimeBetweenRebases % 3600) / 60);

      console.log(
        `Average time between rebases: ${days}d ${hours}h ${minutes}m`,
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in main execution:", error);
    process.exit(1);
  });
