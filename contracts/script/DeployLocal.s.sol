// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ViperArena.sol";

contract MockUSDG {
    string public name = "Mock USDG";
    string public symbol = "mUSDG";
    uint8 public decimals = 18;
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
        MockUSDG token = new MockUSDG();
        ViperArena arena = new ViperArena(
            address(token),
            10 ether,
            msg.sender,
            5,    // fuse: 5 blocks
            100   // max match: 100 blocks
        );
        // Fund the two default anvil accounts
        token.mint(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, 1000 ether);
        token.mint(0x70997970C51812dc3A010C7d01b50e0d17dc79C8, 1000 ether);
        vm.stopBroadcast();
        console.log("MockUSDG:", address(token));
        console.log("ViperArena:", address(arena));
    }
}
