# CarbonX AVS

EigenLayer Actively Validated Service (AVS) for decentralized KYC verification on the CarbonX carbon credit trading platform.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CARBONX AVS ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [contracts/]                             [operator/]                       │
│  ├── src/                                 ├── index.ts (main service)       │
│  │   ├── CarbonXServiceManager            ├── createTask.ts (test util)     │
│  │   │   Upgradeable.sol                  └── .env.example                  │
│  │   │   (extends ECDSAServiceManager                                       │
│  │   │    Base from EigenLayer)           [abis/]                           │
│  │   └── ICarbonXServiceManager.sol       └── Contract ABIs                 │
│  │                                                                          │
│  ├── script/                                                                │
│  │   └── Deploy.s.sol                                                       │
│  └── test/                                                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

                              KYC VERIFICATION FLOW

┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  User/Contract                 ServiceManager              Operator          │
│       │                             │                          │             │
│       │  requestKYC(level)          │                          │             │
│       │────────────────────────────>│                          │             │
│       │                             │                          │             │
│       │                             │  emit KYCTaskCreated     │             │
│       │                             │─────────────────────────>│             │
│       │                             │                          │             │
│       │                             │                          │  verify     │
│       │                             │                          │  user       │
│       │                             │                          │    │        │
│       │                             │                          │<───┘        │
│       │                             │                          │             │
│       │                             │                          │  upload to  │
│       │                             │                          │  IPFS       │
│       │                             │                          │             │
│       │                             │  respondToKYCTask(sig)   │             │
│       │                             │<─────────────────────────│             │
│       │                             │                          │             │
│       │  KYC Verified!              │                          │             │
│       │<────────────────────────────│                          │             │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Components

### Smart Contracts (`contracts/`)
- **CarbonXServiceManagerUpgradeable** - Main AVS service manager
  - Extends EigenLayer's `ECDSAServiceManagerBase`
  - UUPS upgradeable proxy pattern
  - Manages KYC tasks and operator responses

### Operator Service (`operator/`)
- **index.ts** - Main operator service
  - Listens for `KYCTaskCreated` events
  - Performs KYC verification (mock for hackathon)
  - Uploads proof to IPFS
  - Submits signed responses
- **createTask.ts** - Utility to create test tasks

## KYC Levels

| Level | Name | Description |
|-------|------|-------------|
| 0 | NONE | No verification |
| 1 | BASIC | Email + phone verified |
| 2 | INTERMEDIATE | Government ID verified |
| 3 | ADVANCED | Proof of address + source of funds |
| 4 | ACCREDITED | Accredited investor verification |

## Quick Start

### Prerequisites
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Node.js 20+
- npm or yarn

### 1. Clone and Install
```bash
git clone https://github.com/carbonx-fi/avs.git
cd avs
npm install

# Install contract dependencies
cd contracts
make install
```

### 2. Deploy Contracts
```bash
# Set environment
cp contracts/.env.example contracts/.env
# Edit .env with your private key

# Deploy (hackathon simplified mode)
cd contracts
make deploy-simple
```

### 3. Run Operator
```bash
# Set environment
cp operator/.env.example operator/.env
# Edit with SERVICE_MANAGER_ADDRESS from deployment

# Start operator
npm run operator
```

### 4. Create Test Task
```bash
# In another terminal
npm run create-task
# Or with specific level: npm run create-task -- 2
```

## Integration with CarbonX

The AVS integrates with main CarbonX contracts:

```solidity
// In GuardianNFT or other contracts
ICarbonXServiceManager serviceManager = ICarbonXServiceManager(SERVICE_MANAGER_ADDRESS);

// Check KYC before sensitive operations
require(
    serviceManager.hasValidKYC(user, ICarbonXServiceManager.KYCLevel.BASIC),
    "KYC required"
);
```

## Development

### Build Contracts
```bash
cd contracts
forge build
```

### Run Tests
```bash
cd contracts
forge test -vvv
```

### Export ABIs
```bash
cd contracts
make abis
```

## Related Repositories

- [carbonx-fi/contracts](https://github.com/carbonx-fi/contracts) - Main smart contracts
- [carbonx-fi/frontend](https://github.com/carbonx-fi/frontend) - Trading interface
- [carbonx-fi/indexer](https://github.com/carbonx-fi/indexer) - Ponder event indexer

## EigenLayer Integration

This AVS follows the EigenLayer middleware pattern:
- Operators register through EigenLayer's delegation system
- Stake-weighted security model
- ECDSA signature verification
- Upgradeable service manager

For production deployment, configure:
- `AVS_DIRECTORY` - EigenLayer AVS Directory address
- `STAKE_REGISTRY` - ECDSAStakeRegistry address
- `DELEGATION_MANAGER` - EigenLayer Delegation Manager address

## License

MIT
