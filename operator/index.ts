/**
 * CarbonX KYC Operator Service
 *
 * This service listens for KYC verification tasks from the CarbonXServiceManager contract
 * and submits signed responses. For hackathon demo, it uses mock verification
 * (always approves at the requested level).
 *
 * Architecture:
 * 1. Listen for KYCTaskCreated events
 * 2. Perform mock KYC verification
 * 3. Upload verification proof to IPFS (mock for hackathon)
 * 4. Sign the verification result
 * 5. Submit response to contract
 *
 * Based on Domalend AVS pattern for EigenLayer integration.
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

// Types
interface KYCTask {
  user: string;
  requiredLevel: number;
  taskCreatedBlock: number;
  status: number;
  requestId: string;
}

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
  // Try AVS abis folder first
  const abiPath = path.join(__dirname, "..", "abis", `${name}.json`);
  if (fs.existsSync(abiPath)) {
    return JSON.parse(fs.readFileSync(abiPath, "utf8"));
  }

  // Fallback: Try contracts out folder
  const contractsPath = path.join(
    __dirname,
    "..",
    "contracts",
    "out",
    `${name}.sol`,
    `${name}.json`
  );
  if (fs.existsSync(contractsPath)) {
    const artifact = JSON.parse(fs.readFileSync(contractsPath, "utf8"));
    return artifact.abi;
  }

  // Minimal ABI if files don't exist
  console.warn(`ABI file not found for ${name}, using minimal ABI`);
  return [
    "event KYCTaskCreated(uint32 indexed taskId, address indexed user, uint8 requiredLevel, bytes32 requestId)",
    "function respondToKYCTask(uint32 taskId, uint8 achievedLevel, string ipfsHash, bytes signature) external",
    "function isOperator(address operator) external view returns (bool)",
    "function getTask(uint32 taskId) external view returns (tuple(address user, uint8 requiredLevel, uint32 taskCreatedBlock, uint8 status, bytes32 requestId))",
  ];
}

// Mock KYC verification
async function verifyKYC(
  userAddress: string,
  requiredLevel: KYCLevel
): Promise<{ verified: boolean; achievedLevel: KYCLevel; proofData: any }> {
  console.log(`\n[KYC] Verifying user: ${userAddress}`);
  console.log(`[KYC] Required level: ${KYCLevelNames[requiredLevel]}`);

  // For hackathon demo: always approve at requested level
  // In production, this would integrate with actual KYC providers

  // Simulate verification delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Mock proof data
  const proofData = {
    timestamp: Date.now(),
    provider: "CarbonX Mock KYC",
    level: KYCLevelNames[requiredLevel],
    user: userAddress,
    verified: true,
    documents: ["id_verification", "address_proof"],
  };

  console.log(`[KYC] Verification complete: APPROVED at ${KYCLevelNames[requiredLevel]}`);

  return {
    verified: true,
    achievedLevel: requiredLevel,
    proofData,
  };
}

// Mock IPFS upload
async function uploadToIPFS(data: any): Promise<string> {
  // For hackathon demo: return mock IPFS hash
  // In production, this would use Pinata or similar
  const mockHash = `Qm${Buffer.from(JSON.stringify(data)).toString("base64").slice(0, 44)}`;
  console.log(`[IPFS] Uploaded proof: ${mockHash}`);
  return mockHash;
}

// Create signed response
async function signResponse(
  wallet: ethers.Wallet,
  taskId: number,
  userAddress: string,
  achievedLevel: KYCLevel,
  ipfsHash: string,
  contractAddress: string
): Promise<string> {
  const messageHash = ethers.solidityPackedKeccak256(
    ["uint32", "address", "uint8", "string", "address"],
    [taskId, userAddress, achievedLevel, ipfsHash, contractAddress]
  );

  return await wallet.signMessage(ethers.getBytes(messageHash));
}

// Process a single task
async function processTask(
  serviceManager: ethers.Contract,
  wallet: ethers.Wallet,
  taskId: number,
  task: KYCTask
): Promise<void> {
  console.log("=================================================");
  console.log(`[Task ${taskId}] Processing KYC verification task`);
  console.log(`[Task ${taskId}] User: ${task.user}`);
  console.log(`[Task ${taskId}] Required Level: ${KYCLevelNames[task.requiredLevel]}`);
  console.log(`[Task ${taskId}] Request ID: ${task.requestId}`);

  try {
    // Perform mock verification
    const result = await verifyKYC(task.user, task.requiredLevel);

    if (result.verified) {
      // Upload proof to IPFS
      const ipfsHash = await uploadToIPFS(result.proofData);

      // Sign the response
      const signature = await signResponse(
        wallet,
        taskId,
        task.user,
        result.achievedLevel,
        ipfsHash,
        await serviceManager.getAddress()
      );

      console.log(`[Task ${taskId}] Submitting response...`);

      // Submit response to contract
      const tx = await serviceManager.respondToKYCTask(
        taskId,
        result.achievedLevel,
        ipfsHash,
        signature
      );

      const receipt = await tx.wait();
      console.log(`[Task ${taskId}] Response submitted!`);
      console.log(`[Task ${taskId}] TX Hash: ${receipt.hash}`);
    } else {
      console.log(`[Task ${taskId}] Verification failed, not responding`);
    }
  } catch (error) {
    console.error(`[Task ${taskId}] Error:`, error);
  }

  console.log("=================================================\n");
}

// Monitor for new tasks using polling
async function monitorTasks(
  serviceManager: ethers.Contract,
  wallet: ethers.Wallet,
  processedTasks: Set<number>
): Promise<void> {
  console.log(`[Monitor] Polling for KYCTaskCreated events...`);

  // Get current block
  const provider = wallet.provider!;
  let lastCheckedBlock = await provider.getBlockNumber();

  // Polling interval (10 seconds)
  const POLL_INTERVAL = 10000;
  const BLOCK_RANGE = 100;

  setInterval(async () => {
    try {
      const currentBlock = await provider.getBlockNumber();

      if (currentBlock > lastCheckedBlock) {
        const fromBlock = lastCheckedBlock + 1;
        const toBlock = Math.min(fromBlock + BLOCK_RANGE, currentBlock);

        // Query events
        const filter = serviceManager.filters.KYCTaskCreated();
        const events = await serviceManager.queryFilter(filter, fromBlock, toBlock);

        for (const event of events) {
          const parsedEvent = event as ethers.EventLog;
          const taskId = Number(parsedEvent.args[0]);

          if (!processedTasks.has(taskId)) {
            processedTasks.add(taskId);

            // Fetch task details
            const task = await serviceManager.getTask(taskId);

            await processTask(serviceManager, wallet, taskId, {
              user: task.user,
              requiredLevel: Number(task.requiredLevel),
              taskCreatedBlock: Number(task.taskCreatedBlock),
              status: Number(task.status),
              requestId: task.requestId,
            });
          }
        }

        lastCheckedBlock = toBlock;
      }
    } catch (error) {
      console.error("[Monitor] Error polling events:", error);
    }
  }, POLL_INTERVAL);
}

// Main operator loop
async function main() {
  console.log("=================================================");
  console.log("CarbonX KYC Operator Service");
  console.log("EigenLayer AVS Pattern");
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
  console.log(`[Config] Operator: ${wallet.address}`);
  console.log(`[Config] Service Manager: ${serviceManagerAddress}`);

  // Load contract
  const abi = loadABI("CarbonXServiceManager");
  const serviceManager = new ethers.Contract(serviceManagerAddress, abi, wallet);

  // Check if registered as operator
  try {
    const isOperator = await serviceManager.isOperator(wallet.address);
    if (!isOperator) {
      console.log("\n[Warning] Not registered as operator in ServiceManager");
      console.log("[Warning] Please register through EigenLayer before responding to tasks");
    } else {
      console.log("\n[Setup] Registered as operator");
    }
  } catch (error) {
    console.log("[Setup] Could not check operator status (may be using simplified deployment)");
  }

  // Track processed tasks
  const processedTasks = new Set<number>();

  // Start monitoring
  console.log("\n[Operator] Starting task monitor...");
  console.log("[Operator] Listening for KYCTaskCreated events...\n");

  // Start polling
  await monitorTasks(serviceManager, wallet, processedTasks);

  // Also listen for real-time events if supported
  try {
    serviceManager.on("KYCTaskCreated", async (taskId: bigint, user: string, level: number) => {
      const taskIdNum = Number(taskId);

      if (processedTasks.has(taskIdNum)) {
        return;
      }

      processedTasks.add(taskIdNum);
      const task = await serviceManager.getTask(taskIdNum);

      await processTask(serviceManager, wallet, taskIdNum, {
        user: task.user,
        requiredLevel: Number(task.requiredLevel),
        taskCreatedBlock: Number(task.taskCreatedBlock),
        status: Number(task.status),
        requestId: task.requestId,
      });
    });
  } catch (error) {
    console.log("[Info] Real-time events not supported, using polling only");
  }

  console.log("[Operator] Service is running. Press Ctrl+C to stop.\n");

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n[Operator] Shutting down...");
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

// Run the operator
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

export { verifyKYC, uploadToIPFS, signResponse, processTask };
