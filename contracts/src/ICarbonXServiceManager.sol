// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title ICarbonXServiceManager
 * @notice Interface for CarbonX KYC verification AVS
 * @dev Follows EigenLayer AVS pattern for decentralized identity verification
 */
interface ICarbonXServiceManager {
    // ============ Enums ============

    enum KYCLevel {
        NONE,           // 0 - No verification
        BASIC,          // 1 - Email + phone verified
        INTERMEDIATE,   // 2 - Government ID verified
        ADVANCED,       // 3 - Proof of address + source of funds
        ACCREDITED      // 4 - Accredited investor verification
    }

    enum TaskStatus {
        PENDING,
        COMPLETED,
        EXPIRED
    }

    // ============ Structs ============

    /**
     * @notice KYC verification task
     */
    struct KYCTask {
        address user;           // User being verified
        KYCLevel requiredLevel; // Level of KYC required
        uint32 taskCreatedBlock;
        TaskStatus status;
        bytes32 requestId;      // External request identifier
    }

    /**
     * @notice KYC verification result
     */
    struct KYCResult {
        KYCLevel level;             // Achieved KYC level
        uint256 verifiedAt;         // Timestamp of verification
        uint256 expiresAt;          // Expiration timestamp
        address verifiedBy;         // Operator who verified
        string ipfsHash;            // IPFS hash of verification proof
        bool active;                // Whether still valid
    }

    // ============ Events ============

    /**
     * @notice Emitted when a new KYC task is created
     * @dev Operators listen for this event to process verification
     */
    event KYCTaskCreated(
        uint32 indexed taskId,
        address indexed user,
        KYCLevel requiredLevel,
        bytes32 requestId
    );

    /**
     * @notice Emitted when operator responds to a task
     */
    event KYCTaskResponded(
        uint32 indexed taskId,
        address indexed operator,
        KYCLevel achievedLevel,
        string ipfsHash
    );

    /**
     * @notice Emitted when KYC is verified
     */
    event KYCVerified(
        address indexed user,
        KYCLevel level,
        uint256 expiresAt,
        address indexed verifiedBy
    );

    /**
     * @notice Emitted when KYC is revoked
     */
    event KYCRevoked(
        address indexed user,
        address indexed revokedBy
    );

    // ============ Task Functions ============

    /**
     * @notice Create a new KYC verification task
     * @param user Address to verify
     * @param requiredLevel Minimum KYC level required
     * @param requestId External request identifier
     * @return taskId The created task ID
     */
    function createKYCTask(
        address user,
        KYCLevel requiredLevel,
        bytes32 requestId
    ) external returns (uint32 taskId);

    /**
     * @notice Submit response to a KYC task
     * @param taskId Task ID to respond to
     * @param achievedLevel Achieved KYC level
     * @param ipfsHash IPFS hash of verification proof
     * @param signature Operator signature
     */
    function respondToKYCTask(
        uint32 taskId,
        KYCLevel achievedLevel,
        string calldata ipfsHash,
        bytes calldata signature
    ) external;

    // ============ View Functions ============

    /**
     * @notice Check if user has valid KYC at required level
     */
    function hasValidKYC(address user, KYCLevel requiredLevel) external view returns (bool);

    /**
     * @notice Get user's current KYC level
     */
    function getUserKYCLevel(address user) external view returns (KYCLevel);

    /**
     * @notice Get full KYC result for user
     */
    function getKYCResult(address user) external view returns (KYCResult memory);

    /**
     * @notice Get task details
     */
    function getTask(uint32 taskId) external view returns (KYCTask memory);

    /**
     * @notice Check if address is registered operator
     */
    function isOperator(address operator) external view returns (bool);
}
