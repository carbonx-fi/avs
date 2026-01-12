/**
 * CarbonX Manual Project Verification Response
 *
 * Manually responds to a project verification task.
 * Use this when the operator service isn't running.
 *
 * Usage: npx ts-node operator/respondToProject.ts <taskId>
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// ============ Enums ============

enum VerificationStatus {
  PENDING = 0,
  BASIC = 1,
  STANDARD = 2,
  PREMIUM = 3,
  REJECTED = 4,
}

// ============ ABI ============

const PROJECT_VERIFICATION_ABI = [
  "function respondToTask(uint32 taskId, uint8 status, uint8 qualityScore, uint256 verifiedCredits, string verificationUri, bytes signature) external",
  "function getSubmission(uint32 taskId) external view returns (tuple(address owner, string name, string methodology, string registry, string registryId, string location, uint8 category, uint16 vintage, uint256 estimatedCredits, string documentationUri, uint32 submittedBlock, uint8 status))",
  "function getVerificationResult(uint32 taskId) external view returns (tuple(uint8 status, uint8 qualityScore, uint256 verifiedCredits, uint256 verifiedAt, address verifiedBy, string verificationUri, bool canMint))",
  "function operators(address) external view returns (bool)",
  "function canMintTokens(uint32 taskId) external view returns (bool)",
];

// ============ Config ============

const RPC_URL = process.env.RPC_URL || "https://rpc.sepolia.mantle.xyz";
const PROJECT_VERIFICATION_ADDRESS = process.env.PROJECT_VERIFICATION_ADDRESS || "0x0A762a19e9b64caC0149EDbe2DE6D5c0165001Fe";

async function main() {
  console.log("=================================================");
  console.log("CarbonX Manual Project Verification Response");
  console.log("=================================================\n");

  // Parse args
  const taskId = parseInt(process.argv[2] || "1");

  // Load config
  const privateKey = process.env.OPERATOR_PRIVATE_KEY;
  if (!privateKey) {
    console.error("Error: OPERATOR_PRIVATE_KEY not set");
    process.exit(1);
  }

  // Setup
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(PROJECT_VERIFICATION_ADDRESS, PROJECT_VERIFICATION_ABI, wallet);

  console.log(`[Config] Contract: ${PROJECT_VERIFICATION_ADDRESS}`);
  console.log(`[Config] Operator: ${wallet.address}`);
  console.log(`[Config] Task ID: ${taskId}\n`);

  // Check operator status
  const isOperator = await contract.operators(wallet.address);
  if (!isOperator) {
    console.error("[Error] Wallet is not a registered operator!");
    process.exit(1);
  }
  console.log("[Status] Operator: Registered ✓");

  // Get submission
  const submission = await contract.getSubmission(taskId);
  if (submission.owner === ethers.ZeroAddress) {
    console.error(`[Error] Task ${taskId} not found!`);
    process.exit(1);
  }

  console.log(`\n[Submission] Project: ${submission.name}`);
  console.log(`[Submission] Owner: ${submission.owner}`);
  console.log(`[Submission] Status: ${submission.status}`);

  // Status 0 = PENDING, 1 = COMPLETED, 2 = EXPIRED, 3 = REJECTED
  if (Number(submission.status) !== 0) {
    console.log("[Info] Task already processed!");
    const result = await contract.getVerificationResult(taskId);
    console.log(`[Result] Verification Status: ${result.status}`);
    console.log(`[Result] Can Mint: ${result.canMint}`);
    process.exit(0);
  }
  console.log("[Status] Task is PENDING - proceeding with verification...");

  // Generate verification response
  const verificationStatus = VerificationStatus.STANDARD;
  const qualityScore = 90;
  const verifiedCredits = submission.estimatedCredits * BigInt(95) / BigInt(100); // 95% of estimated
  const verificationUri = `ipfs://QmVerification${taskId}`;

  console.log(`\n[Response] Status: STANDARD (${verificationStatus})`);
  console.log(`[Response] Quality Score: ${qualityScore}`);
  console.log(`[Response] Verified Credits: ${ethers.formatEther(verifiedCredits)} tonnes`);

  // Sign the response
  const messageHash = ethers.solidityPackedKeccak256(
    ["uint32", "address", "uint8", "uint8", "uint256", "address"],
    [taskId, submission.owner, verificationStatus, qualityScore, verifiedCredits, PROJECT_VERIFICATION_ADDRESS]
  );
  const signature = await wallet.signMessage(ethers.getBytes(messageHash));

  console.log(`\n[Submit] Sending response...`);

  try {
    const tx = await contract.respondToTask(
      taskId,
      verificationStatus,
      qualityScore,
      verifiedCredits,
      verificationUri,
      signature
    );
    console.log(`[Submit] TX: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[Submit] Confirmed in block ${receipt.blockNumber}`);

    // Verify result
    const canMint = await contract.canMintTokens(taskId);
    console.log(`\n[Result] Can Mint Tokens: ${canMint}`);

    if (canMint) {
      console.log("\n=================================================");
      console.log("SUCCESS! Project verified and can mint tokens.");
      console.log("=================================================");
    }
  } catch (error: any) {
    console.error(`[Error] ${error.message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
