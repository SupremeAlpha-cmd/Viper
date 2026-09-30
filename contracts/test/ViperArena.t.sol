// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ViperArena.sol";

contract MockUSDG {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external { balanceOf[to] += amt; }

    function approve(address sp, uint256 amt) external returns (bool) {
        allowance[msg.sender][sp] = amt;
        return true;
    }

    function transfer(address to, uint256 amt) external returns (bool) {
        require(balanceOf[msg.sender] >= amt, "bal");
        balanceOf[msg.sender] -= amt;
        balanceOf[to] += amt;
        return true;
    }

    function transferFrom(address f, address t, uint256 amt) external returns (bool) {
        require(balanceOf[f] >= amt && allowance[f][msg.sender] >= amt, "allow");
        allowance[f][msg.sender] -= amt;
        balanceOf[f] -= amt;
        balanceOf[t] += amt;
        return true;
    }
}

contract ViperArenaTest is Test {
    MockUSDG token;
    ViperArena arena;

    address constant A = address(0xA);
    address constant B = address(0xB);
    address constant TREASURY = address(0x77);
    uint256 constant ENTRY = 100;
    uint256 constant FUSE = 30;
    uint256 constant MAX_BLOCKS = 3000;

    function setUp() public {
        token = new MockUSDG();
        arena = new ViperArena(address(token), ENTRY, TREASURY, FUSE, MAX_BLOCKS);
        token.mint(A, 1000);
        token.mint(B, 1000);
        vm.prank(A); token.approve(address(arena), type(uint256).max);
        vm.prank(B); token.approve(address(arena), type(uint256).max);
    }

    function _joinTwoAndStart() internal {
        vm.prank(A); arena.join();
        vm.prank(B); arena.join();
        vm.warp(block.timestamp + 61);
        arena.startMatch();
    }

    function test_JoinAndStart() public {
        _joinTwoAndStart();
        assertEq(uint8(arena.phase()), uint8(ViperArena.Phase.Live));
        assertEq(arena.aliveCount(), 2);
        // Spawn points differ: A -> (0,0), B -> (10,0)
        assertEq(arena.px(A), 0); assertEq(arena.py(A), 0);
        assertEq(arena.px(B), 10); assertEq(arena.py(B), 0);
        assertEq(arena.pot(), 2 * ENTRY);
    }

    function test_SoloLobbyRefunds() public {
        vm.prank(A); arena.join();
        vm.warp(block.timestamp + 61);
        uint256 before = arena.matchId();
        arena.startMatch();
        assertEq(token.balanceOf(A), 1000); // full refund
        assertEq(arena.matchId(), before + 1); // fresh lobby opened
        assertEq(uint8(arena.phase()), uint8(ViperArena.Phase.Lobby));
    }

    function test_CannotJoinTwiceOrEarlyStart() public {
        vm.prank(A); arena.join();
        vm.prank(A); vm.expectRevert("already joined"); arena.join();
        vm.expectRevert("lobby still open"); arena.startMatch();
    }

    function test_MoveValidation() public {
        _joinTwoAndStart();
        vm.prank(A); vm.expectRevert("one orthogonal step"); arena.move(int8(1), int8(1));
        vm.prank(A); vm.expectRevert("out of bounds"); arena.move(int8(-1), int8(0));
        vm.prank(A); arena.move(int8(1), int8(0));
        assertEq(arena.px(A), 1);
    }

    function test_BombKillsAndWinnerTakesPot() public {
        _joinTwoAndStart();
        // A plants a bomb on (0,0) and stays: dies in own blast.
        vm.prank(A); arena.plantBomb();
        vm.roll(block.number + FUSE + 1);
        arena.poke();

        assertFalse(arena.alive(A));
        assertTrue(arena.alive(B) == false); // new lobby reset aliveness
        // Pot math: 200 in, 5% fee = 10, winner gets 190.
        assertEq(token.balanceOf(TREASURY), 10);
        assertEq(token.balanceOf(B), 1000 - ENTRY + 190);
        assertEq(token.balanceOf(A), 1000 - ENTRY); // dead, no prize
        assertEq(uint8(arena.phase()), uint8(ViperArena.Phase.Lobby)); // next lobby
    }

    function test_SuddenDeathSplitsPot() public {
        _joinTwoAndStart();
        vm.roll(block.number + MAX_BLOCKS + 1);
        arena.poke();
        // 200 pot, 10 fee, 95 each.
        assertEq(token.balanceOf(A), 1000 - ENTRY + 95);
        assertEq(token.balanceOf(B), 1000 - ENTRY + 95);
        assertEq(token.balanceOf(TREASURY), 10);
    }

    function test_ChainDetonationKillsBothAndSplits() public {
        // Longer fuse so B can walk into blast range before A's bomb goes off.
        ViperArena arena2 = new ViperArena(address(token), ENTRY, TREASURY, 20, MAX_BLOCKS);
        vm.prank(A); token.approve(address(arena2), type(uint256).max);
        vm.prank(B); token.approve(address(arena2), type(uint256).max);
        vm.prank(A); arena2.join();
        vm.prank(B); arena2.join();
        vm.warp(block.timestamp + 61);
        arena2.startMatch();

        // A plants at (0,0): due at plantBlock + 20.
        vm.prank(A); arena2.plantBomb();
        uint256 p = block.number;
        // B walks from (10,0) to (2,0) and plants there (inside A's blast).
        // B's bomb is planted 8 blocks later, so at block p+21 only the
        // chain reaction can detonate it.
        for (uint256 i = 0; i < 8; i++) {
            vm.prank(B); arena2.move(int8(-1), int8(0));
        }
        assertEq(arena2.px(B), 2);
        vm.prank(B); arena2.plantBomb();

        vm.roll(p + 21);
        vm.recordLogs();
        arena2.poke();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 exploded;
        bytes32 sig = keccak256("BombExploded(uint256,uint8,uint8)");
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == sig) exploded++;
        }
        assertEq(exploded, 2, "both bombs must detonate via chain reaction");

        // Both players died in the same block -> last batch splits: 95 each.
        assertEq(token.balanceOf(A), 1000 - ENTRY + 95);
        assertEq(token.balanceOf(B), 1000 - ENTRY + 95);
        assertEq(token.balanceOf(TREASURY), 10);
    }

    function test_CannotMoveOntoLiveBomb() public {
        _joinTwoAndStart();
        vm.prank(A); arena.plantBomb(); // bomb at (0,0), A still on it
        // A steps off to (1,0), then tries to step back onto the bomb tile.
        vm.prank(A); arena.move(int8(1), int8(0));
        vm.prank(A); vm.expectRevert("tile has live bomb"); arena.move(int8(-1), int8(0));
    }

    function test_OneLiveBombPerPlayer() public {
        _joinTwoAndStart();
        vm.prank(A); arena.plantBomb();
        vm.prank(A); arena.move(int8(1), int8(0));
        vm.prank(A); vm.expectRevert("already armed"); arena.plantBomb();
    }
}
