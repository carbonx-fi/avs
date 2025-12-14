# CarbonX AVS Contracts Makefile

-include .env

.PHONY: all test clean deploy install update build

all: clean install build

# Install dependencies
install:
	forge install foundry-rs/forge-std --no-commit
	forge install OpenZeppelin/openzeppelin-contracts --no-commit
	forge install OpenZeppelin/openzeppelin-contracts-upgradeable --no-commit
	forge install Layr-Labs/eigenlayer-contracts --no-commit
	forge install Layr-Labs/eigenlayer-middleware --no-commit

# Update dependencies
update:
	forge update

# Build contracts
build:
	forge build

# Run tests
test:
	forge test -vvv

# Clean build artifacts
clean:
	forge clean

# Deploy to Mantle Sepolia (Simple - for hackathon)
deploy-simple:
	forge script script/Deploy.s.sol:DeployCarbonXAVSSimple \
		--rpc-url $(RPC_URL) \
		--broadcast \
		--verify \
		-vvvv

# Deploy to Mantle Sepolia (Full EigenLayer)
deploy:
	forge script script/Deploy.s.sol:DeployCarbonXAVS \
		--rpc-url $(RPC_URL) \
		--broadcast \
		--verify \
		-vvvv

# Generate ABIs
abis:
	forge build --force
	mkdir -p ../abis
	cat out/CarbonXServiceManagerUpgradeable.sol/CarbonXServiceManagerUpgradeable.json | jq '.abi' > ../abis/CarbonXServiceManager.json
	cat out/ICarbonXServiceManager.sol/ICarbonXServiceManager.json | jq '.abi' > ../abis/ICarbonXServiceManager.json
	@echo "ABIs exported to ../abis/"

# Format code
fmt:
	forge fmt

# Gas snapshot
snapshot:
	forge snapshot

# Help
help:
	@echo "CarbonX AVS Contracts"
	@echo ""
	@echo "Usage:"
	@echo "  make install      - Install dependencies"
	@echo "  make build        - Build contracts"
	@echo "  make test         - Run tests"
	@echo "  make deploy-simple - Deploy (hackathon mode)"
	@echo "  make deploy       - Deploy (full EigenLayer)"
	@echo "  make abis         - Export ABIs"
	@echo "  make clean        - Clean build artifacts"
