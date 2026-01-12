/**
 * CarbonX E2E Project Verification Test
 *
 * Tests the full flow:
 * 1. Submit project -> ProjectVerificationServiceManager
 * 2. AVS operator listens for ProjectSubmitted event
 * 3. Operator verifies and submits response
 * 4. Contract stores verification result with canMint=true
 *
 * Run: npx ts-node operator/e2eProjectTest.ts
 * Note: AVS operator must be running in a separate terminal
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// ============ Types ============

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

interface VerificationResult {
  status: number;
  qualityScore: number;
  verifiedCredits: bigint;
  verifiedAt: bigint;
  verifiedBy: string;
  verificationUri: string;
  canMint: boolean;
}

// ============ Enums ============

enum ProjectCategory {
  FOREST = 0,
  OCEAN = 1,
  ENERGY = 2,
  WASTE = 3,
  COMMUNITY = 4,
  TECH = 5,
}

enum TaskStatus {
  PENDING = 0,
  COMPLETED = 1,
  EXPIRED = 2,
  REJECTED = 3,
}

enum VerificationStatus {
  PENDING = 0,
  BASIC = 1,
  STANDARD = 2,
  PREMIUM = 3,
  REJECTED = 4,
}

const CategoryNames = ["FOREST", "OCEAN", "ENERGY", "WASTE", "COMMUNITY", "TECH"];
const TaskStatusNames = ["PENDING", "COMPLETED", "EXPIRED", "REJECTED"];
const VerificationStatusNames = ["PENDING", "BASIC", "STANDARD", "PREMIUM", "REJECTED"];

// ============ ABI ============

const PROJECT_VERIFICATION_ABI = [
  // Write functions
  "function submitProject(string name, string methodology, string registry, string registryId, string location, uint8 category, uint16 vintage, uint256 estimatedCredits, string documentationUri) external returns (uint32 taskId)",
  // Read functions
  "function getSubmission(uint32 taskId) external view returns (tuple(address owner, string name, string methodology, string registry, string registryId, string location, uint8 category, uint16 vintage, uint256 estimatedCredits, string documentationUri, uint32 submittedBlock, uint8 status))",
  "function getVerificationResult(uint32 taskId) external view returns (tuple(uint8 status, uint8 qualityScore, uint256 verifiedCredits, uint256 verifiedAt, address verifiedBy, string verificationUri, bool canMint))",
  "function canMintTokens(uint32 taskId) external view returns (bool)",
  "function latestTaskNum() external view returns (uint32)",
  "function operators(address) external view returns (bool)",
  // Events
  "event ProjectSubmitted(uint32 indexed taskId, address indexed owner, string name, uint8 category, uint16 vintage, string registryId)",
  "event ProjectVerified(uint32 indexed taskId, address indexed operator, uint8 status, uint8 qualityScore, uint256 verifiedCredits)",
];

// ============ Config ============

const RPC_URL = process.env.RPC_URL || "https://rpc.sepolia.mantle.xyz";
const PROJECT_VERIFICATION_ADDRESS = process.env.PROJECT_VERIFICATION_ADDRESS || "0x0A762a19e9b64caC0149EDbe2DE6D5c0165001Fe";
const POLL_INTERVAL = 5000; // 5 seconds
const MAX_WAIT_TIME = 120000; // 2 minutes

// ============ Test Project Data ============

const TEST_PROJECT = {
  name: `E2E Test Project ${Date.now()}`,
  methodology: "VCS",
  registry: "Verra",
  registryId: `VCS-${Math.floor(Math.random() * 10000)}`,
  location: "Costa Rica",
  category: ProjectCategory.FOREST,
  vintage: 2024,
  estimatedCredits: ethers.parseEther("500"), // 500 tonnes
  documentationUri: "ipfs://QmTestDocumentation",
};

// ============ Main Test ============

async function main() {
  console.log("=================================================");
  console.log("CarbonX E2E Project Verification Test");
  console.log("=================================================\n");

  // Load configuration
  const privateKey = process.env.OPERATOR_PRIVATE_KEY;
  if (!privateKey) {
    console.error("Error: OPERATOR_PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  // Setup
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(PROJECT_VERIFICATION_ADDRESS, PROJECT_VERIFICATION_ABI, wallet);

  console.log(`[Config] RPC URL: ${RPC_URL}`);
  console.log(`[Config] Contract: ${PROJECT_VERIFICATION_ADDRESS}`);
  console.log(`[Config] Submitter: ${wallet.address}`);

  // Check current state
  const latestTaskBefore = await contract.latestTaskNum();
  console.log(`[State] Latest task ID before: ${latestTaskBefore}\n`);

  // ============ Step 1: Submit Project ============
  console.log("=== STEP 1: Submit Project ===");
  console.log(`[Submit] Project: ${TEST_PROJECT.name}`);
  console.log(`[Submit] Category: ${CategoryNames[TEST_PROJECT.category]}`);
  console.log(`[Submit] Registry: ${TEST_PROJECT.registry} (${TEST_PROJECT.registryId})`);
  console.log(`[Submit] Vintage: ${TEST_PROJECT.vintage}`);
  console.log(`[Submit] Estimated Credits: ${ethers.formatEther(TEST_PROJECT.estimatedCredits)} tonnes`);

  let taskId: number;
  try {
    const tx = await contract.submitProject(
      TEST_PROJECT.name,
      TEST_PROJECT.methodology,
      TEST_PROJECT.registry,
      TEST_PROJECT.registryId,
      TEST_PROJECT.location,
      TEST_PROJECT.category,
      TEST_PROJECT.vintage,
      TEST_PROJECT.estimatedCredits,
      TEST_PROJECT.documentationUri
    );
    console.log(`[Submit] TX sent: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[Submit] TX confirmed in block ${receipt.blockNumber}`);

    // Get task ID from event
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        return parsed?.name === "ProjectSubmitted";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = contract.interface.parseLog({ topics: event.topics, data: event.data });
      taskId = Number(parsed?.args[0]);
      console.log(`[Submit] Task ID: ${taskId}`);
    } else {
      // Fallback: get from latestTaskNum
      taskId = Number(await contract.latestTaskNum());
      console.log(`[Submit] Task ID (from latest): ${taskId}`);
    }
  } catch (error: any) {
    console.error(`[Submit] FAILED: ${error.message}`);
    process.exit(1);
  }

  // Verify submission was stored
  const submission: ProjectSubmission = await contract.getSubmission(taskId);
  console.log(`\n[Verify] Submission stored correctly:`);
  console.log(`  Owner: ${submission.owner}`);
  console.log(`  Name: ${submission.name}`);
  console.log(`  Status: ${TaskStatusNames[submission.status]}`);
  console.log("");

  // ============ Step 2: Wait for AVS Operator Response ============
  console.log("=== STEP 2: Wait for AVS Operator Response ===");
  console.log("[Wait] Polling for verification result...");
  console.log("[Wait] Make sure the AVS operator is running: npx ts-node operator/index.ts\n");

  const startTime = Date.now();
  let verified = false;

  while (Date.now() - startTime < MAX_WAIT_TIME) {
    const currentSubmission: ProjectSubmission = await contract.getSubmission(taskId);

    if (currentSubmission.status !== TaskStatus.PENDING) {
      verified = true;
      console.log(`[Wait] Status changed: ${TaskStatusNames[currentSubmission.status]}`);
      break;
    }

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    process.stdout.write(`\r[Wait] Elapsed: ${elapsed}s / ${MAX_WAIT_TIME / 1000}s...`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }

  console.log("");

  if (!verified) {
    console.error("\n[FAIL] Timeout waiting for AVS operator response");
    console.error("[FAIL] Make sure the AVS operator is running!");
    process.exit(1);
  }

  // ============ Step 3: Verify Result ============
  console.log("\n=== STEP 3: Verify Result ===");

  const finalSubmission: ProjectSubmission = await contract.getSubmission(taskId);
  const verificationResult: VerificationResult = await contract.getVerificationResult(taskId);
  const canMint: boolean = await contract.canMintTokens(taskId);

  console.log(`[Result] Task Status: ${TaskStatusNames[finalSubmission.status]}`);
  console.log(`[Result] Verification Status: ${VerificationStatusNames[verificationResult.status]}`);
  console.log(`[Result] Quality Score: ${verificationResult.qualityScore}`);
  console.log(`[Result] Verified Credits: ${ethers.formatEther(verificationResult.verifiedCredits)} tonnes`);
  console.log(`[Result] Verified By: ${verificationResult.verifiedBy}`);
  console.log(`[Result] Verification URI: ${verificationResult.verificationUri}`);
  console.log(`[Result] Can Mint: ${canMint}`);

  // ============ Final Assessment ============
  console.log("\n=================================================");

  if (
    finalSubmission.status === TaskStatus.COMPLETED &&
    verificationResult.status >= VerificationStatus.BASIC &&
    canMint === true
  ) {
    console.log("E2E TEST PASSED!");
    console.log("=================================================");
    console.log(`
Summary:
- Project submitted and stored correctly
- AVS operator verified the project
- Verification result stored with canMint=true
- Project is now eligible for token minting

Task ID: ${taskId}
Project: ${TEST_PROJECT.name}
Verified Credits: ${ethers.formatEther(verificationResult.verifiedCredits)} tonnes
`);
    process.exit(0);
  } else {
    console.log("E2E TEST FAILED!");
    console.log("=================================================");
    console.log(`
Issues:
- Task Status: ${TaskStatusNames[finalSubmission.status]} (expected: COMPLETED)
- Verification: ${VerificationStatusNames[verificationResult.status]} (expected: >= BASIC)
- Can Mint: ${canMint} (expected: true)
`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
