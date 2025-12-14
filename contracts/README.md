# CarbonX AVS Contracts

Smart contracts for the CarbonX KYC verification Actively Validated Service (AVS), built on EigenLayer middleware.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AVS CONTRACT ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CarbonXServiceManagerUpgradeable                               │
│  ├── extends ECDSAServiceManagerBase (EigenLayer)               │
│  ├── implements ICarbonXServiceManager                          │
│  └── uses UUPSUpgradeable (proxy pattern)                       │
│                                                                 │
│  Key Functions:                                                 │
│  ├── createKYCTask()     - External contracts create tasks      │
│  ├── requestKYC()        - Users self-request verification      │
│  ├── respondToKYCTask()  - Operators submit signed responses    │
│  ├── hasValidKYC()       - Check user KYC status                │
│  └── getUserKYCLevel()   - Get user's verification level        │
│                                                                 │
│  EigenLayer Integration:                                        │
│  ├── AVSDirectory        - AVS registration                     │
│  ├── ECDSAStakeRegistry  - Operator stake tracking              │
│  ├── DelegationManager   - Delegation management                │
│  └── RewardsCoordinator  - Reward distribution                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Contracts

| Contract | Description |
|----------|-------------|
| `CarbonXServiceManagerUpgradeable` | Main AVS service manager for KYC verification |
| `ICarbonXServiceManager` | Interface defining KYC task and result structures |

## KYC Levels

| Level | Name | Description |
|-------|------|-------------|
| 0 | NONE | No verification |
| 1 | BASIC | Email + phone verified |
| 2 | INTERMEDIATE | Government ID verified |
| 3 | ADVANCED | Proof of address + source of funds |
| 4 | ACCREDITED | Accredited investor verification |

## Setup

### Prerequisites
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Node.js 20+

### Install Dependencies
```bash
make install
# or
forge install
```

### Build
```bash
make build
# or
forge build
```

### Test
```bash
make test
# or
forge test -vvv
```

## Deployment

### Hackathon Mode (Simplified)
```bash
# Set environment variables
cp .env.example .env
# Edit .env with your values

# Deploy
make deploy-simple
```

### Production (Full EigenLayer)
Requires EigenLayer core contracts to be deployed first.

```bash
# Update addresses in Deploy.s.sol
make deploy
```

## Integration

### From Other Contracts
```solidity
import {ICarbonXServiceManager} from "./ICarbonXServiceManager.sol";

contract GuardianNFT {
    ICarbonXServiceManager public kycService;

    function mint() external {
        // Check KYC before minting
        require(
            kycService.hasValidKYC(msg.sender, ICarbonXServiceManager.KYCLevel.BASIC),
            "KYC required"
        );
        // ... mint logic
    }
}
```

### Event Listening (Operators)
```typescript
serviceManager.on("KYCTaskCreated", async (taskId, user, level, requestId) => {
    // 1. Verify user identity
    // 2. Upload proof to IPFS
    // 3. Sign and submit response
});
```

## License

MIT
