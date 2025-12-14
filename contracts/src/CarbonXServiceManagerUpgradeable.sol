// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ECDSAServiceManagerBase} from
    "@eigenlayer-middleware/unaudited/ECDSAServiceManagerBase.sol";
import {ECDSAStakeRegistry} from "@eigenlayer-middleware/unaudited/ECDSAStakeRegistry.sol";
import {IServiceManager} from "@eigenlayer-middleware/interfaces/IServiceManager.sol";
import {ECDSAUpgradeable} from
    "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import {IERC1271Upgradeable} from
    "@openzeppelin/contracts-upgradeable/interfaces/IERC1271Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ICarbonXServiceManager} from "./ICarbonXServiceManager.sol";

/**
 * @title CarbonXServiceManagerUpgradeable
 * @notice KYC verification AVS for CarbonX carbon credit platform
 * @dev Extends EigenLayer's ECDSAServiceManagerBase for operator management
 *
 * Architecture:
 * 1. External contracts (GuardianNFT, etc.) call createKYCTask
 * 2. Off-chain operators listen for KYCTaskCreated events
 * 3. Operators verify user identity and upload proof to IPFS
 * 4. Operators submit signed responses via respondToKYCTask
 * 5. Contract validates signatures and stores KYC results
 * 6. Results can be queried by other contracts for access control
 */
contract CarbonXServiceManagerUpgradeable is
    ECDSAServiceManagerBase,
    UUPSUpgradeable,
    ICarbonXServiceManager
{
    using ECDSAUpgradeable for bytes32;

    // ============ Storage ============

    /// @notice Task counter
    uint32 public nextTaskId;

    /// @notice Tasks by ID
    mapping(uint32 => KYCTask) public tasks;

    /// @notice Task hash for verification
    mapping(uint32 => bytes32) public taskHashes;

    /// @notice Task responses
    mapping(uint32 => bytes) public taskResponses;

    /// @notice KYC results by user
    mapping(address => KYCResult) public kycResults;

    /// @notice Task expiry period (blocks)
    uint32 public taskExpiryBlocks;

    /// @notice KYC validity period (seconds)
    uint256 public kycValidityPeriod;

    /// @notice Authorized callers (e.g., GuardianNFT contract)
    mapping(address => bool) public authorizedCallers;

    /// @notice Storage gap for upgrades
    uint256[44] private __gap;

    // ============ Errors ============

    error TaskNotFound();
    error TaskNotPending();
    error TaskExpired();
    error InvalidSignature();
    error NotOperator();
    error NotAuthorizedCaller();
    error AlreadyVerified();
    error InvalidLevel();

    // ============ Modifiers ============

    modifier onlyOperator() {
        if (!ECDSAStakeRegistry(stakeRegistry).operatorRegistered(msg.sender)) {
            revert NotOperator();
        }
        _;
    }

    modifier onlyAuthorizedCaller() {
        if (!authorizedCallers[msg.sender] && msg.sender != owner()) {
            revert NotAuthorizedCaller();
        }
        _;
    }

    // ============ Constructor ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        address _avsDirectory,
        address _stakeRegistry,
        address _rewardsCoordinator,
        address _delegationManager
    )
        ECDSAServiceManagerBase(_avsDirectory, _stakeRegistry, _rewardsCoordinator, _delegationManager)
    {
        _disableInitializers();
    }

    // ============ Initializer ============

    function initialize(address _owner) public initializer {
        __ServiceManagerBase_init(_owner, _owner);

        nextTaskId = 1;
        taskExpiryBlocks = 7200;            // ~24 hours on Mantle
        kycValidityPeriod = 365 days;       // 1 year validity
    }

    // ============ Task Creation ============

    /**
     * @notice Create a new KYC verification task
     * @dev Can be called by authorized contracts (GuardianNFT, etc.)
     */
    function createKYCTask(
        address user,
        KYCLevel requiredLevel,
        bytes32 requestId
    ) external onlyAuthorizedCaller returns (uint32 taskId) {
        if (requiredLevel == KYCLevel.NONE) revert InvalidLevel();

        // Check if user already has valid KYC at this level
        KYCResult storage existing = kycResults[user];
        if (
            existing.active && existing.expiresAt > block.timestamp
                && existing.level >= requiredLevel
        ) {
            revert AlreadyVerified();
        }

        taskId = nextTaskId++;

        KYCTask storage newTask = tasks[taskId];
        newTask.user = user;
        newTask.requiredLevel = requiredLevel;
        newTask.taskCreatedBlock = uint32(block.number);
        newTask.status = TaskStatus.PENDING;
        newTask.requestId = requestId;

        // Store task hash for verification
        taskHashes[taskId] = keccak256(abi.encode(newTask));

        emit KYCTaskCreated(taskId, user, requiredLevel, requestId);
    }

    /**
     * @notice Request KYC verification for self (public)
     */
    function requestKYC(KYCLevel requiredLevel) external returns (uint32 taskId) {
        if (requiredLevel == KYCLevel.NONE) revert InvalidLevel();

        KYCResult storage existing = kycResults[msg.sender];
        if (
            existing.active && existing.expiresAt > block.timestamp
                && existing.level >= requiredLevel
        ) {
            revert AlreadyVerified();
        }

        taskId = nextTaskId++;

        KYCTask storage newTask = tasks[taskId];
        newTask.user = msg.sender;
        newTask.requiredLevel = requiredLevel;
        newTask.taskCreatedBlock = uint32(block.number);
        newTask.status = TaskStatus.PENDING;
        newTask.requestId = keccak256(abi.encodePacked(msg.sender, block.timestamp, taskId));

        taskHashes[taskId] = keccak256(abi.encode(newTask));

        emit KYCTaskCreated(taskId, msg.sender, requiredLevel, newTask.requestId);
    }

    // ============ Task Response (Operators) ============

    /**
     * @notice Submit response to a KYC task
     * @dev Only registered operators can respond
     */
    function respondToKYCTask(
        uint32 taskId,
        KYCLevel achievedLevel,
        string calldata ipfsHash,
        bytes calldata signature
    ) external onlyOperator {
        KYCTask storage task = tasks[taskId];
        if (task.user == address(0)) revert TaskNotFound();
        if (task.status != TaskStatus.PENDING) revert TaskNotPending();

        // Check task hasn't expired
        if (block.number > task.taskCreatedBlock + taskExpiryBlocks) {
            task.status = TaskStatus.EXPIRED;
            revert TaskExpired();
        }

        // Verify signature
        bytes32 messageHash = keccak256(
            abi.encodePacked(taskId, task.user, achievedLevel, ipfsHash, address(this))
        );
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);

        if (signer != msg.sender) revert InvalidSignature();

        // Store response
        taskResponses[taskId] = signature;
        task.status = TaskStatus.COMPLETED;

        // Update KYC result
        kycResults[task.user] = KYCResult({
            level: achievedLevel,
            verifiedAt: block.timestamp,
            expiresAt: block.timestamp + kycValidityPeriod,
            verifiedBy: msg.sender,
            ipfsHash: ipfsHash,
            active: true
        });

        emit KYCTaskResponded(taskId, msg.sender, achievedLevel, ipfsHash);
        emit KYCVerified(task.user, achievedLevel, block.timestamp + kycValidityPeriod, msg.sender);
    }

    // ============ Admin Functions ============

    /**
     * @notice Add authorized caller
     */
    function addAuthorizedCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = true;
    }

    /**
     * @notice Remove authorized caller
     */
    function removeAuthorizedCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = false;
    }

    /**
     * @notice Revoke a user's KYC status
     */
    function revokeKYC(address user) external onlyOwner {
        kycResults[user].active = false;
        emit KYCRevoked(user, msg.sender);
    }

    /**
     * @notice Set configuration
     */
    function setConfig(uint32 _taskExpiryBlocks, uint256 _kycValidityPeriod) external onlyOwner {
        taskExpiryBlocks = _taskExpiryBlocks;
        kycValidityPeriod = _kycValidityPeriod;
    }

    // ============ View Functions ============

    function hasValidKYC(address user, KYCLevel requiredLevel) external view returns (bool) {
        KYCResult storage result = kycResults[user];
        return result.active && result.expiresAt > block.timestamp && result.level >= requiredLevel;
    }

    function getUserKYCLevel(address user) external view returns (KYCLevel) {
        KYCResult storage result = kycResults[user];
        if (!result.active || result.expiresAt <= block.timestamp) {
            return KYCLevel.NONE;
        }
        return result.level;
    }

    function getKYCResult(address user) external view returns (KYCResult memory) {
        return kycResults[user];
    }

    function getTask(uint32 taskId) external view returns (KYCTask memory) {
        return tasks[taskId];
    }

    function isOperator(address operator) external view returns (bool) {
        return ECDSAStakeRegistry(stakeRegistry).operatorRegistered(operator);
    }

    // ============ UUPS ============

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
