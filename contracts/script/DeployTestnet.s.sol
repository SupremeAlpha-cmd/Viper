// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import { ViperDoubleOrNothing } from "../src/ViperDoubleOrNothing.sol";
import { ViperChess } from "../src/ViperChess.sol";
import { ViperSnakesLadders } from "../src/ViperSnakesLadders.sol";
import { ViperSnake } from "../src/ViperSnake.sol";
import { ViperArena } from "../src/ViperArena.sol";
import { ViperSquadGame } from "../src/ViperSquadGame.sol";
import "../deploy/MockUSDG.sol";
import "../deploy/MockVIPER.sol";

/// @notice Deploys all six Viper games plus MockUSDG + MockVIPER to the
///         Robinhood testnet (chain 46630), funds the DON USDG bankroll and
///         every game's VIPER bonus reserve.
///
///         Usage (NOT run automatically — invoke explicitly):
///           forge script script/DeployTestnet.s.sol \
///             --rpc-url https://rpc.testnet.chain.robinhood.com \
///             --private-key $PRIVATE_KEY --broadcast
contract DeployTestnet is Script {
    function run() external {
        vm.startBroadcast();

        MockUSDG usdg = new MockUSDG();
        MockVIPER viper = new MockVIPER();
        address treasury = msg.sender;
        address rewardsPool = msg.sender;

        ViperDoubleOrNothing don = new ViperDoubleOrNothing(
            address(usdg),
            address(viper),
            treasury,
            rewardsPool
        );
        ViperChess chess = new ViperChess(
            address(usdg),
            address(viper),
            100_000_000, // $100 entry fee (6-decimal USDG)
            treasury,
            rewardsPool,
            300, // moveTimeout
            200  // maxPlys
        );
        ViperSnakesLadders sl = new ViperSnakesLadders(
            address(usdg),
            address(viper),
            20_000_000, // $20 entry fee
            treasury,
            rewardsPool
        );
        ViperSnake snake = new ViperSnake(
            address(usdg),
            address(viper),
            20_000_000, // $20 entry fee
            treasury,
            rewardsPool,
            600 // matchTicks
        );
        ViperArena arena = new ViperArena(
            address(usdg),
            address(viper),
            30_000_000, // $30 entry fee
            treasury,
            rewardsPool,
            30,   // fuseBlocks
            3000  // maxMatchBlocks
        );
        ViperSquadGame squad = new ViperSquadGame(
            address(usdg),
            address(viper),
            30_000_000, // $30 entry fee
            treasury,
            rewardsPool,
            8,          // maxPlayers
            2,          // minPlayers
            120,        // roundDuration
            address(0), // passNFT (none)
            0           // passFee
        );

        // Play tokens for the deployer.
        usdg.mint(msg.sender, 10_000 * 1e6);       // 10,000 mUSDG
        viper.mint(msg.sender, 10_000_000 * 1e18); // 10,000,000 mVIPER

        // DON bankroll: 1000 USDG.
        usdg.approve(address(don), 1_000_000_000);
        don.fund(1_000_000_000);

        // VIPER bonus reserves: 1,000,000 mVIPER per game.
        viper.approve(address(don), 1_000_000e18);
        don.fundViper(1_000_000e18);
        viper.approve(address(chess), 1_000_000e18);
        chess.fundViper(1_000_000e18);
        viper.approve(address(sl), 1_000_000e18);
        sl.fundViper(1_000_000e18);
        viper.approve(address(snake), 1_000_000e18);
        snake.fundViper(1_000_000e18);
        viper.approve(address(arena), 1_000_000e18);
        arena.fundViper(1_000_000e18);
        viper.approve(address(squad), 1_000_000e18);
        squad.fundViper(1_000_000e18);

        vm.stopBroadcast();

        console.log("MockUSDG:", address(usdg));
        console.log("MockVIPER:", address(viper));
        console.log("ViperDoubleOrNothing:", address(don));
        console.log("ViperChess:", address(chess));
        console.log("ViperSnakesLadders:", address(sl));
        console.log("ViperSnake:", address(snake));
        console.log("ViperArena:", address(arena));
        console.log("ViperSquadGame:", address(squad));
    }
}
