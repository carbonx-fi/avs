/**
 * CarbonX KYC Task Creation Utility
 *
 * Creates a test KYC verification task for development/demo purposes.
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

// KYC Levels
enum KYCLevel {
  NONE = 0,
  BASIC = 1,
  INTERMEDIATE = 2,
  ADVANCED = 3,
  ACCREDITED = 4,
}

const KYCLevelNames = ["NONE", "BASIC", "INTERMEDIATE", "ADVANCED", "ACCREDITED"];

// Load ABI
function loadABI(name: string): any {
  const abiPath = path.join(__dirname, "..", "abis", `${name}.json`);
  if (fs.existsSync(abiPath)) {
    return JSON.parse(fs.readFileSync(abiPath, "utf8"));
  }

  // Minimal ABI if file doesn't exist
  return [
    "function requestKYC(uint8 requiredLevel) external returns (uint32 taskId)",
    "event KYCTaskCreated(uint32 indexed taskId, address indexed user, uint8 requiredLevel, bytes32 requestId)",
  ];
}

async function main() {
  console.log("=================================================");
  console.log("CarbonX KYC Task Creator");
  console.log("=================================================\n");

  // Load configuration
  const privateKey = process.env.OPERATOR_PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL || "https://rpc.sepolia.mantle.xyz";
  const serviceManagerAddress = process.env.SERVICE_MANAGER_ADDRESS;

  if (!privateKey) {
    console.error("Error: OPERATOR_PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  if (!serviceManagerAddress) {
    console.error("Error: SERVICE_MANAGER_ADDRESS not set in .env");
    process.exit(1);
  }

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`[Config] RPC URL: ${rpcUrl}`);
  console.log(`[Config] Sender: ${wallet.address}`);
  console.log(`[Config] Service Manager: ${serviceManagerAddress}`);

  // Load contract
  const abi = loadABI("CarbonXServiceManager");
  const serviceManager = new ethers.Contract(serviceManagerAddress, abi, wallet);

  // Parse command line arguments
  const args = process.argv.slice(2);
  const level = parseInt(args[0] || "2"); // Default to INTERMEDIATE

  console.log(`\n[Task] Creating KYC task...`);
  console.log(`[Task] User: ${wallet.address}`);
  console.log(`[Task] Required Level: ${KYCLevelNames[level]} (${level})`);

  try {
    // Create the task
    const tx = await serviceManager.requestKYC(level);
    console.log(`[Task] Transaction sent: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[Task] Transaction confirmed!`);

    // Parse the KYCTaskCreated event
    const taskCreatedEvent = receipt.logs.find((log: any) => {
      try {
        const parsed = serviceManager.interface.parseLog({
          topics: log.topics,
          data: log.data,
        });
        return parsed?.name === "KYCTaskCreated";
      } catch {
        return false;
      }
    });

    if (taskCreatedEvent) {
      const parsed = serviceManager.interface.parseLog({
        topics: taskCreatedEvent.topics,
        data: taskCreatedEvent.data,
      });
      console.log(`[Task] Task ID: ${parsed?.args[0]}`);
      console.log(`[Task] Request ID: ${parsed?.args[3]}`);
    }

    console.log("\n[Success] KYC task created successfully!");
    console.log("[Note] The operator service should pick this up and respond.");
  } catch (error) {
    console.error("[Error] Failed to create task:", error);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
