// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ViperArena.sol";
import "../deploy/MockVIPER.sol";

contract MockUSDG {
    string public name = "Mock USDG";
    string public symbol = "mUSDG";
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "bal");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "bal");
        require(allowance[from][msg.sender] >= amount, "allow");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract DeployLocal is Script {
    function run() external {
        vm.startBroadcast();
        MockUSDG usdg = new MockUSDG();
        MockVIPER viper = new MockVIPER();
        ViperArena arena = new ViperArena(
            address(usdg),
            address(viper),
            30_000_000, // 30 USDG entry fee (6 decimals)
            msg.sender, // treasury
            msg.sender, // rewardsPool
            30,   // fuse: 30 blocks (~2.4s at ~0.08s/block mainnet)
            3000  // max match: 3000 blocks (~4min at ~0.08s/block mainnet)
        );
        // Fund the two default anvil accounts
        address acc1 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
        address acc2 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        usdg.mint(acc1, 1000 * 1e6); // 1000 mUSDG
        usdg.mint(acc2, 1000 * 1e6); // 1000 mUSDG
        viper.mint(acc1, 1_000_000 * 1e18); // 1,000,000 mVIPER
        viper.mint(acc2, 1_000_000 * 1e18); // 1,000,000 mVIPER
        // Fund the arena's VIPER bonus reserve from the deployer.
        viper.mint(msg.sender, 1_000_000 * 1e18);
        viper.approve(address(arena), 1_000_000 * 1e18);
        arena.fundViper(1_000_000 * 1e18);
        vm.stopBroadcast();
        console.log("MockUSDG:", address(usdg));
        console.log("MockVIPER:", address(viper));
        console.log("ViperArena:", address(arena));
    }
}
