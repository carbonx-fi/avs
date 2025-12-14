// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {CarbonXServiceManagerUpgradeable} from "../src/CarbonXServiceManagerUpgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployCarbonXAVS
 * @notice Deployment script for CarbonX AVS ServiceManager
 * @dev Deploys with UUPS proxy pattern
 *
 * Prerequisites:
 * - EigenLayer core contracts deployed (or use existing deployment)
 * - ECDSAStakeRegistry deployed
 *
 * Usage:
 * forge script script/Deploy.s.sol:DeployCarbonXAVS --rpc-url $RPC_URL --broadcast
 */
contract DeployCarbonXAVS is Script {
    // EigenLayer contract addresses (Mantle Sepolia - update as needed)
    address public constant AVS_DIRECTORY = address(0); // TODO: Set after EigenLayer deployment
    address public constant STAKE_REGISTRY = address(0); // TODO: Deploy ECDSAStakeRegistry
    address public constant REWARDS_COORDINATOR = address(0); // TODO: Set if using rewards
    address public constant DELEGATION_MANAGER = address(0); // TODO: Set after EigenLayer deployment

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy implementation
        CarbonXServiceManagerUpgradeable implementation = new CarbonXServiceManagerUpgradeable(
            AVS_DIRECTORY,
            STAKE_REGISTRY,
            REWARDS_COORDINATOR,
            DELEGATION_MANAGER
        );
        console.log("Implementation deployed:", address(implementation));

        // Deploy proxy
        bytes memory initData = abi.encodeWithSelector(
            CarbonXServiceManagerUpgradeable.initialize.selector,
            deployer
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        console.log("Proxy deployed:", address(proxy));

        // Verify deployment
        CarbonXServiceManagerUpgradeable serviceManager =
            CarbonXServiceManagerUpgradeable(address(proxy));
        console.log("Owner:", serviceManager.owner());
        console.log("Next Task ID:", serviceManager.nextTaskId());

        vm.stopBroadcast();

        // Log deployment info
        console.log("\n=== Deployment Summary ===");
        console.log("Implementation:", address(implementation));
        console.log("ServiceManager (Proxy):", address(proxy));
    }
}

/**
 * @title DeployCarbonXAVSSimple
 * @notice Simplified deployment without EigenLayer dependencies
 * @dev For hackathon demo - uses mock addresses
 */
contract DeployCarbonXAVSSimple is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("\nNote: Using mock EigenLayer addresses for hackathon demo");

        vm.startBroadcast(deployerPrivateKey);

        // Use deployer as mock addresses for demo
        CarbonXServiceManagerUpgradeable implementation = new CarbonXServiceManagerUpgradeable(
            deployer, // Mock AVS Directory
            deployer, // Mock Stake Registry
            deployer, // Mock Rewards Coordinator
            deployer  // Mock Delegation Manager
        );
        console.log("Implementation deployed:", address(implementation));

        bytes memory initData = abi.encodeWithSelector(
            CarbonXServiceManagerUpgradeable.initialize.selector,
            deployer
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        console.log("Proxy deployed:", address(proxy));

        vm.stopBroadcast();

        console.log("\n=== Deployment Summary ===");
        console.log("Implementation:", address(implementation));
        console.log("ServiceManager (Proxy):", address(proxy));
    }
}
