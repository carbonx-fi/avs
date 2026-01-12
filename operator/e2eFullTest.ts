/**
 * CarbonX Full E2E Project Verification Test
 *
 * Single script that:
 * 1. Submits a project
 * 2. Simulates operator response (no separate service needed)
 * 3. Verifies canMint=true
 *
 * Run: npx ts-node operator/e2eFullTest.ts
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// ============ Enums ============

enum ProjectCategory {
  FOREST = 0, OCEAN = 1, ENERGY = 2, WASTE = 3, COMMUNITY = 4, TECH = 5,
}

enum TaskStatus {
  PENDING = 0, COMPLETED = 1, EXPIRED = 2, REJECTED = 3,
}

enum VerificationStatus {
  PENDING = 0, BASIC = 1, STANDARD = 2, PREMIUM = 3, REJECTED = 4,
}

const CategoryNames = ["FOREST", "OCEAN", "ENERGY", "WASTE", "COMMUNITY", "TECH"];
const TaskStatusNames = ["PENDING", "COMPLETED", "EXPIRED", "REJECTED"];
const VerificationStatusNames = ["PENDING", "BASIC", "STANDARD", "PREMIUM", "REJECTED"];

// ============ ABI ============

const ABI = [
  "function submitProject(string name, string methodology, string registry, string registryId, string location, uint8 category, uint16 vintage, uint256 estimatedCredits, string documentationUri) external returns (uint32 taskId)",
  "function respondToTask(uint32 taskId, uint8 status, uint8 qualityScore, uint256 verifiedCredits, string verificationUri, bytes signature) external",
  "function getSubmission(uint32 taskId) external view returns (tuple(address owner, string name, string methodology, string registry, string registryId, string location, uint8 category, uint16 vintage, uint256 estimatedCredits, string documentationUri, uint32 submittedBlock, uint8 status))",
  "function getVerificationResult(uint32 taskId) external view returns (tuple(uint8 status, uint8 qualityScore, uint256 verifiedCredits, uint256 verifiedAt, address verifiedBy, string verificationUri, bool canMint))",
  "function canMintTokens(uint32 taskId) external view returns (bool)",
  "function latestTaskNum() external view returns (uint32)",
  "function operators(address) external view returns (bool)",
  "event ProjectSubmitted(uint32 indexed taskId, address indexed owner, string name, uint8 category, uint16 vintage, string registryId)",
  "event ProjectVerified(uint32 indexed taskId, address indexed operator, uint8 status, uint8 qualityScore, uint256 verifiedCredits)",
];

// ============ Config ============

const RPC_URL = process.env.RPC_URL || "https://rpc.sepolia.mantle.xyz";
const CONTRACT_ADDRESS = process.env.PROJECT_VERIFICATION_ADDRESS || "0x0A762a19e9b64caC0149EDbe2DE6D5c0165001Fe";

// ============ Main ============

async function main() {
  console.log("=".repeat(60));
  console.log("CarbonX E2E Project Verification Test (Full)");
  console.log("=".repeat(60) + "\n");

  const privateKey = process.env.OPERATOR_PRIVATE_KEY;
  if (!privateKey) {
    console.error("Error: OPERATOR_PRIVATE_KEY not set");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

  console.log(`Contract: ${CONTRACT_ADDRESS}`);
  console.log(`Wallet: ${wallet.address}\n`);

  // Check operator status
  const isOperator = await contract.operators(wallet.address);
  console.log(`Operator Registered: ${isOperator ? "YES ✓" : "NO ✗"}`);
  if (!isOperator) {
    console.error("ERROR: Wallet is not a registered operator!");
    process.exit(1);
  }

  // ============ STEP 1: Submit Project ============
  console.log("\n" + "─".repeat(60));
  console.log("STEP 1: Submit Project");
  console.log("─".repeat(60));

  const testProject = {
    name: `E2E Test ${Date.now()}`,
    methodology: "VCS",
    registry: "Verra",
    registryId: `VCS-${Math.floor(Math.random() * 10000)}`,
    location: "Costa Rica",
    category: ProjectCategory.FOREST,
    vintage: 2024,
    estimatedCredits: ethers.parseEther("500"),
    documentationUri: "ipfs://QmTestDoc",
  };

  console.log(`Project: ${testProject.name}`);
  console.log(`Category: ${CategoryNames[testProject.category]}`);
  console.log(`Registry: ${testProject.registry} (${testProject.registryId})`);
  console.log(`Vintage: ${testProject.vintage}`);
  console.log(`Estimated: ${ethers.formatEther(testProject.estimatedCredits)} tonnes`);

  let taskId: number;
  try {
    const tx1 = await contract.submitProject(
      testProject.name,
      testProject.methodology,
      testProject.registry,
      testProject.registryId,
      testProject.location,
      testProject.category,
      testProject.vintage,
      testProject.estimatedCredits,
      testProject.documentationUri
    );
    console.log(`\nTX: ${tx1.hash}`);
    const receipt1 = await tx1.wait();
    console.log(`Block: ${receipt1.blockNumber}`);

    taskId = Number(await contract.latestTaskNum());
    console.log(`Task ID: ${taskId}`);
  } catch (e: any) {
    console.error(`FAILED: ${e.message}`);
    process.exit(1);
  }

  // Verify submission
  const submission = await contract.getSubmission(taskId);
  console.log(`\nSubmission Status: ${TaskStatusNames[Number(submission.status)]}`);

  // ============ STEP 2: Operator Response ============
  console.log("\n" + "─".repeat(60));
  console.log("STEP 2: Operator Verification Response");
  console.log("─".repeat(60));

  const verificationStatus = VerificationStatus.STANDARD;
  const qualityScore = 92;
  const verifiedCredits = testProject.estimatedCredits * BigInt(95) / BigInt(100);
  const verificationUri = `ipfs://QmVerification${taskId}`;

  console.log(`Status: ${VerificationStatusNames[verificationStatus]}`);
  console.log(`Quality Score: ${qualityScore}`);
  console.log(`Verified Credits: ${ethers.formatEther(verifiedCredits)} tonnes`);

  // Sign
  const messageHash = ethers.solidityPackedKeccak256(
    ["uint32", "address", "uint8", "uint8", "uint256", "address"],
    [taskId, submission.owner, verificationStatus, qualityScore, verifiedCredits, CONTRACT_ADDRESS]
  );
  const signature = await wallet.signMessage(ethers.getBytes(messageHash));

  try {
    const tx2 = await contract.respondToTask(
      taskId,
      verificationStatus,
      qualityScore,
      verifiedCredits,
      verificationUri,
      signature
    );
    console.log(`\nTX: ${tx2.hash}`);
    const receipt2 = await tx2.wait();
    console.log(`Block: ${receipt2.blockNumber}`);
  } catch (e: any) {
    console.error(`FAILED: ${e.message}`);
    process.exit(1);
  }

  // ============ STEP 3: Verify Result ============
  console.log("\n" + "─".repeat(60));
  console.log("STEP 3: Verify Final State");
  console.log("─".repeat(60));

  const finalSubmission = await contract.getSubmission(taskId);
  const result = await contract.getVerificationResult(taskId);
  const canMint = await contract.canMintTokens(taskId);

  console.log(`Task Status: ${TaskStatusNames[Number(finalSubmission.status)]}`);
  console.log(`Verification: ${VerificationStatusNames[Number(result.status)]}`);
  console.log(`Quality Score: ${result.qualityScore}`);
  console.log(`Verified Credits: ${ethers.formatEther(result.verifiedCredits)} tonnes`);
  console.log(`Verified By: ${result.verifiedBy}`);
  console.log(`Can Mint: ${canMint}`);

  // ============ Final Result ============
  console.log("\n" + "=".repeat(60));

  const passed =
    Number(finalSubmission.status) === TaskStatus.COMPLETED &&
    Number(result.status) >= VerificationStatus.BASIC &&
    canMint === true;

  if (passed) {
    console.log("E2E TEST PASSED ✓");
    console.log("=".repeat(60));
    console.log(`
Summary:
• Project submitted successfully
• Operator verified the project
• Verification result stored
• canMint = true

Task ID: ${taskId}
Project: ${testProject.name}
Verified: ${ethers.formatEther(result.verifiedCredits)} tonnes
`);
    process.exit(0);
  } else {
    console.log("E2E TEST FAILED ✗");
    console.log("=".repeat(60));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
