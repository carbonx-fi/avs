/**
 * CarbonX AVS Operator Service
 *
 * This service handles two types of verification tasks:
 * 1. KYC Verification - User identity verification
 * 2. Project Verification - Carbon project RWA verification
 *
 * For hackathon demo, it uses mock verification (always approves).
 *
 * Based on EigenLayer AVS pattern.
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// ============ Types ============

interface KYCTask {
  user: string;
  requiredLevel: number;
  taskCreatedBlock: number;
  status: number;
}

interface ProjectSubmission {
  owner: string;
  name: string;
  methodology: string;
  registry: string;
  registryId: string;
  location: string;
  category: number;
  vintage: number;
  estimatedCredits: bigint;
  documentationUri: string;
  submittedBlock: number;
  status: number;
}

// ============ Enums ============

enum KYCLevel {
  NONE = 0,
  BASIC = 1,
  INTERMEDIATE = 2,
  ADVANCED = 3,
  ACCREDITED = 4,
}

enum VerificationStatus {
  PENDING = 0,
  BASIC = 1,
  STANDARD = 2,
  PREMIUM = 3,
  REJECTED = 4,
}

const KYCLevelNames = ["NONE", "BASIC", "INTERMEDIATE", "ADVANCED", "ACCREDITED"];
const VerificationStatusNames = ["PENDING", "BASIC", "STANDARD", "PREMIUM", "REJECTED"];
const CategoryNames = ["FOREST", "OCEAN", "ENERGY", "WASTE", "COMMUNITY", "TECH"];

// ============ ABIs ============

const KYC_ABI = [
  "event NewTaskCreated(uint32 indexed taskId, tuple(address user, uint8 requiredLevel, uint32 taskCreatedBlock, uint8 status) task)",
  "function respondToTask(uint32 taskId, uint8 achievedLevel, bytes signature) external",
  "function isOperator(address operator) external view returns (bool)",
  "function getTask(uint32 taskId) external view returns (tuple(address user, uint8 requiredLevel, uint32 taskCreatedBlock, uint8 status))",
  "function operators(address) external view returns (bool)",
];

const PROJECT_ABI = [
  "event ProjectSubmitted(uint32 indexed taskId, address indexed owner, string name, uint8 category, uint16 vintage, string registryId)",
  "function respondToTask(uint32 taskId, uint8 status, uint8 qualityScore, uint256 verifiedCredits, string verificationUri, bytes signature) external",
  "function isOperator(address operator) external view returns (bool)",
  "function getSubmission(uint32 taskId) external view returns (tuple(address owner, string name, string methodology, string registry, string registryId, string location, uint8 category, uint16 vintage, uint256 estimatedCredits, string documentationUri, uint32 submittedBlock, uint8 status))",
  "function operators(address) external view returns (bool)",
];

// ============ KYC Verification ============

async function verifyKYC(userAddress: string, requiredLevel: KYCLevel): Promise<{ verified: boolean; achievedLevel: KYCLevel }> {
  console.log(`\n[KYC] Verifying user: ${userAddress}`);
  console.log(`[KYC] Required level: ${KYCLevelNames[requiredLevel]}`);

  // Mock verification - always approve for hackathon
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log(`[KYC] Result: APPROVED at ${KYCLevelNames[requiredLevel]}`);
  return { verified: true, achievedLevel: requiredLevel };
}

async function processKYCTask(
  contract: ethers.Contract,
  wallet: ethers.Wallet,
  taskId: number,
  task: KYCTask
): Promise<void> {
  console.log("\n=================================================");
  console.log(`[KYC Task ${taskId}] Processing...`);
  console.log(`  User: ${task.user}`);
  console.log(`  Level: ${KYCLevelNames[task.requiredLevel]}`);

  try {
    const result = await verifyKYC(task.user, task.requiredLevel);

    if (result.verified) {
      // Sign response
      const messageHash = ethers.solidityPackedKeccak256(
        ["uint32", "address", "uint8", "address"],
        [taskId, task.user, result.achievedLevel, await contract.getAddress()]
      );
      const signature = await wallet.signMessage(ethers.getBytes(messageHash));

      console.log(`[KYC Task ${taskId}] Submitting response...`);
      const tx = await contract.respondToTask(taskId, result.achievedLevel, signature);
      const receipt = await tx.wait();
      console.log(`[KYC Task ${taskId}] SUCCESS! TX: ${receipt.hash}`);
    }
  } catch (error: any) {
    console.error(`[KYC Task ${taskId}] Error:`, error.message);
  }
  console.log("=================================================\n");
}

// ============ Project Verification ============

async function verifyProject(submission: ProjectSubmission): Promise<{
  verified: boolean;
  status: VerificationStatus;
  qualityScore: number;
  verifiedCredits: bigint;
}> {
  console.log(`\n[Project] Verifying: ${submission.name}`);
  console.log(`  Category: ${CategoryNames[submission.category]}`);
  console.log(`  Registry: ${submission.registry} (${submission.registryId})`);
  console.log(`  Location: ${submission.location}`);
  console.log(`  Vintage: ${submission.vintage}`);
  console.log(`  Estimated Credits: ${ethers.formatEther(submission.estimatedCredits)} tonnes`);

  // Mock verification - always approve for hackathon
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Generate quality score (85-100 for demo)
  const qualityScore = 85 + Math.floor(Math.random() * 16);

  // Verify 90-100% of estimated credits
  const verificationRate = 0.9 + Math.random() * 0.1;
  const verifiedCredits = BigInt(Math.floor(Number(submission.estimatedCredits) * verificationRate));

  console.log(`[Project] Result: APPROVED`);
  console.log(`  Quality Score: ${qualityScore}`);
  console.log(`  Verified Credits: ${ethers.formatEther(verifiedCredits)} tonnes`);

  return {
    verified: true,
    status: VerificationStatus.STANDARD, // Standard verification for demo
    qualityScore,
    verifiedCredits,
  };
}

async function processProjectTask(
  contract: ethers.Contract,
  wallet: ethers.Wallet,
  taskId: number,
  submission: ProjectSubmission
): Promise<void> {
  console.log("\n=================================================");
  console.log(`[Project Task ${taskId}] Processing...`);
  console.log(`  Project: ${submission.name}`);
  console.log(`  Owner: ${submission.owner}`);

  try {
    const result = await verifyProject(submission);

    if (result.verified) {
      // Mock verification URI
      const verificationUri = `ipfs://Qm${Buffer.from(submission.name).toString("base64").slice(0, 40)}`;

      // Sign response
      const messageHash = ethers.solidityPackedKeccak256(
        ["uint32", "address", "uint8", "uint8", "uint256", "address"],
        [taskId, submission.owner, result.status, result.qualityScore, result.verifiedCredits, await contract.getAddress()]
      );
      const signature = await wallet.signMessage(ethers.getBytes(messageHash));

      console.log(`[Project Task ${taskId}] Submitting response...`);
      const tx = await contract.respondToTask(
        taskId,
        result.status,
        result.qualityScore,
        result.verifiedCredits,
        verificationUri,
        signature
      );
      const receipt = await tx.wait();
      console.log(`[Project Task ${taskId}] SUCCESS! TX: ${receipt.hash}`);
    }
  } catch (error: any) {
    console.error(`[Project Task ${taskId}] Error:`, error.message);
  }
  console.log("=================================================\n");
}

// ============ Monitoring ============

async function monitorKYC(
  contract: ethers.Contract,
  wallet: ethers.Wallet,
  processedTasks: Set<string>,
  provider: ethers.JsonRpcProvider
): Promise<void> {
  let lastBlock = await provider.getBlockNumber();
  const POLL_INTERVAL = 10000;

  setInterval(async () => {
    try {
      const currentBlock = await provider.getBlockNumber();
      if (currentBlock <= lastBlock) return;

      const filter = contract.filters.NewTaskCreated();
      const events = await contract.queryFilter(filter, lastBlock + 1, currentBlock);

      for (const event of events) {
        const parsedEvent = event as ethers.EventLog;
        const taskId = Number(parsedEvent.args[0]);
        const key = `kyc-${taskId}`;

        if (!processedTasks.has(key)) {
          processedTasks.add(key);
          const task = await contract.getTask(taskId);
          await processKYCTask(contract, wallet, taskId, {
            user: task.user,
            requiredLevel: Number(task.requiredLevel),
            taskCreatedBlock: Number(task.taskCreatedBlock),
            status: Number(task.status),
          });
        }
      }

      lastBlock = currentBlock;
    } catch (error: any) {
      if (!error.message.includes("eth_newFilter")) {
        console.error("[KYC Monitor] Error:", error.message);
      }
    }
  }, POLL_INTERVAL);
}

async function monitorProjects(
  contract: ethers.Contract,
  wallet: ethers.Wallet,
  processedTasks: Set<string>,
  provider: ethers.JsonRpcProvider
): Promise<void> {
  let lastBlock = await provider.getBlockNumber();
  const POLL_INTERVAL = 10000;

  setInterval(async () => {
    try {
      const currentBlock = await provider.getBlockNumber();
      if (currentBlock <= lastBlock) return;

      const filter = contract.filters.ProjectSubmitted();
      const events = await contract.queryFilter(filter, lastBlock + 1, currentBlock);

      for (const event of events) {
        const parsedEvent = event as ethers.EventLog;
        const taskId = Number(parsedEvent.args[0]);
        const key = `project-${taskId}`;

        if (!processedTasks.has(key)) {
          processedTasks.add(key);
          const submission = await contract.getSubmission(taskId);
          await processProjectTask(contract, wallet, taskId, {
            owner: submission.owner,
            name: submission.name,
            methodology: submission.methodology,
            registry: submission.registry,
            registryId: submission.registryId,
            location: submission.location,
            category: Number(submission.category),
            vintage: Number(submission.vintage),
            estimatedCredits: submission.estimatedCredits,
            documentationUri: submission.documentationUri,
            submittedBlock: Number(submission.submittedBlock),
            status: Number(submission.status),
          });
        }
      }

      lastBlock = currentBlock;
    } catch (error: any) {
      if (!error.message.includes("eth_newFilter")) {
        console.error("[Project Monitor] Error:", error.message);
      }
    }
  }, POLL_INTERVAL);
}

// ============ Main ============

async function main() {
  console.log("=================================================");
  console.log("CarbonX AVS Operator Service");
  console.log("Handles: KYC + Project Verification");
  console.log("=================================================\n");

  // Load config
  const privateKey = process.env.OPERATOR_PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL || "https://rpc.sepolia.mantle.xyz";
  const kycAddress = process.env.SERVICE_MANAGER_ADDRESS || "0xbDe5421D508C781c401E2af2101D74A23E39cBd6";
  const projectAddress = process.env.PROJECT_VERIFICATION_ADDRESS || "0x0A762a19e9b64caC0149EDbe2DE6D5c0165001Fe";

  if (!privateKey) {
    console.error("Error: OPERATOR_PRIVATE_KEY not set");
    process.exit(1);
  }

  // Setup
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`[Config] RPC: ${rpcUrl}`);
  console.log(`[Config] Operator: ${wallet.address}`);
  console.log(`[Config] KYC Contract: ${kycAddress}`);
  console.log(`[Config] Project Contract: ${projectAddress}`);

  // Contracts
  const kycContract = new ethers.Contract(kycAddress, KYC_ABI, wallet);
  const projectContract = new ethers.Contract(projectAddress, PROJECT_ABI, wallet);

  // Check operator status
  try {
    const isKYCOperator = await kycContract.operators(wallet.address);
    const isProjectOperator = await projectContract.operators(wallet.address);
    console.log(`\n[Status] KYC Operator: ${isKYCOperator ? "YES" : "NO"}`);
    console.log(`[Status] Project Operator: ${isProjectOperator ? "YES" : "NO"}`);
  } catch (error) {
    console.log("[Status] Could not check operator status");
  }

  // Track processed tasks
  const processedTasks = new Set<string>();

  // Start monitoring
  console.log("\n[Operator] Starting monitors...");
  console.log("[Operator] Listening for NewTaskCreated (KYC)...");
  console.log("[Operator] Listening for ProjectSubmitted (RWA)...\n");

  await monitorKYC(kycContract, wallet, processedTasks, provider);
  await monitorProjects(projectContract, wallet, processedTasks, provider);

  console.log("[Operator] Service running. Press Ctrl+C to stop.\n");

  // Keep alive
  process.on("SIGINT", () => {
    console.log("\n[Operator] Shutting down...");
    process.exit(0);
  });

  await new Promise(() => {});
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
