// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ViperSnake.sol";

contract SnakeMockToken {
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

contract ViperSnakeTest is Test {
    SnakeMockToken token;
    ViperSnake game;

    address constant A = address(0xA);
    address constant B = address(0xB);
    address constant C = address(0xC);
    address constant D = address(0xD);
    address constant E = address(0xE);
    address constant F = address(0xF);
    address constant G = address(0xA11CE);
    address constant H = address(0xBEEF);
    address constant I = address(0xCAFE);
    address constant TREASURY = address(0x77);
    uint256 constant ENTRY = 100;
    uint256 constant MATCH_TICKS = 200;

    // Directions: UP=0 RIGHT=1 DOWN=2 LEFT=3
    uint8 constant UP = 0;
    uint8 constant RIGHT = 1;
    uint8 constant DOWN = 2;
    uint8 constant LEFT = 3;

    function setUp() public {
        token = new SnakeMockToken();
        game = new ViperSnake(address(token), ENTRY, TREASURY, MATCH_TICKS);
        vm.roll(1000);
        vm.warp(100000);
        address[8] memory ps = [A, B, C, D, E, F, G, H];
        for (uint256 i = 0; i < 8; i++) {
            token.mint(ps[i], 10000);
            vm.prank(ps[i]);
            token.approve(address(game), 10000);
        }
    }

    // ---- helpers ----

    /// @dev Join players[0..n), warp past the 60s lobby, start the match.
    function _joinStart(uint256 n) internal {
        address[8] memory ps = [A, B, C, D, E, F, G, H];
        for (uint256 i = 0; i < n; i++) {
            vm.prank(ps[i]);
            game.join();
        }
        vm.warp(block.timestamp + 61);
        game.startMatch();
    }

    /// @dev Advance exactly one tick: next block, then poke.
    function _tick() internal {
        vm.roll(block.number + 1);
        game.poke();
    }

    function _ticks(uint256 k) internal {
        for (uint256 i = 0; i < k; i++) _tick();
    }

    function _steer(address p, uint8 dir) internal {
        vm.prank(p);
        game.setDirection(dir);
    }

    function _head(address p) internal view returns (uint8 x, uint8 y) {
        uint16[] memory segs = game.getSegments(p);
        require(segs.length > 0, "no segments");
        x = uint8(segs[0] >> 8); // _pack puts x in the high byte
        y = uint8(segs[0] & 0xff);
    }

    function _coinAt(uint8 x, uint8 y) internal view returns (bool) {
        uint16[] memory cs = game.getCoins();
        uint16 cell = (uint16(x) << 8) | uint16(y);
        for (uint256 i = 0; i < cs.length; i++) {
            if (cs[i] == cell) return true;
        }
        return false;
    }

    // ---- lobby ----

    function testJoinLobbyAndFull() public {
        address[8] memory ps = [A, B, C, D, E, F, G, H];
        for (uint256 i = 0; i < 8; i++) {
            vm.prank(ps[i]);
            game.join();
        }
        assertEq(game.pot(), 8 * ENTRY);
        assertEq(uint256(game.getPlayers().length), 8);

        // 9th joiner: lobby full.
        token.mint(I, 10000);
        vm.prank(I);
        token.approve(address(game), 10000);
        vm.prank(I);
        vm.expectRevert("lobby full");
        game.join();

        // Double join reverts.
        vm.prank(A);
        vm.expectRevert("already joined");
        game.join();
    }

    function testJoinWithoutApprovalReverts() public {
        token.mint(I, 10000);
        vm.prank(I);
        vm.expectRevert("allow");
        game.join();
    }

    function testStartMatchEarlyReverts() public {
        vm.prank(A);
        game.join();
        vm.expectRevert("lobby still open");
        game.startMatch();
    }

    function testStartMatchSpawnsSnakesAndCoins() public {
        _joinStart(3);
        assertEq(uint256(game.phase()), 1); // Live
        assertEq(game.aliveCount(), 3);
        assertEq(game.getCoins().length, 8); // COIN_TARGET
        // Spawn points: A (2,2)->R, B (21,2)->DOWN, C (2,21)->R, length 3.
        assertEq(game.getSegments(A).length, 3);
        (uint8 ax, uint8 ay) = _head(A);
        assertEq(ax, 2);
        assertEq(ay, 2);
        (uint8 bx, uint8 by) = _head(B);
        assertEq(bx, 21);
        assertEq(by, 2);
    }

    function testLobbyCancelRefundsWhenShort() public {
        vm.prank(A);
        game.join();
        uint256 balBefore = token.balanceOf(A);
        vm.warp(block.timestamp + 61);
        game.startMatch(); // <2 players -> refund + fresh lobby
        assertEq(uint256(game.phase()), 0); // Lobby
        assertEq(token.balanceOf(A), balBefore); // entry fee credited...
        vm.prank(A);
        game.claim(); // ...and claimable
        assertEq(token.balanceOf(A), balBefore + ENTRY);
        assertEq(game.matchId(), 2); // constructor opened #1, cancel opened #2
    }

    // ---- direction commits ----

    function testDirectionCommitAppliesNextTick() public {
        _joinStart(2);
        _tick(); // tick 1: A (2,2)->R moves to (3,2)
        (uint8 x1, uint8 y1) = _head(A);
        assertEq(x1, 3);
        assertEq(y1, 2);

        _steer(A, DOWN); // commit at tick 1 -> applies at tick 2
        assertTrue(game.hasPendingDir(A));
        _tick(); // tick 2: A moves down to (3,3)
        (uint8 x2, uint8 y2) = _head(A);
        assertEq(x2, 3);
        assertEq(y2, 3);
        assertFalse(game.hasPendingDir(A));
    }

    function testTwoCommitsSameTickRevert() public {
        _joinStart(2);
        _tick(); // tick 1
        _steer(A, DOWN);
        vm.prank(A);
        vm.expectRevert("one commit per tick");
        game.setDirection(LEFT);
    }

    function testDirection180Rejected() public {
        _joinStart(2);
        _tick(); // A heading RIGHT
        vm.prank(A);
        vm.expectRevert("no 180 turn");
        game.setDirection(LEFT); // LEFT is 180 from RIGHT
        // After turning DOWN, UP becomes the illegal 180.
        _steer(A, DOWN);
        _tick(); // tick 2: direction now DOWN
        vm.prank(A);
        vm.expectRevert("no 180 turn");
        game.setDirection(UP);
    }

    // ---- wall death + last-alive settlement ----

    function testWallDeathAndLastAliveWins() public {
        _joinStart(2);
        // B spawns (21,2) heading DOWN: walks into the bottom wall at t22.
        // A steers down the x=7 column to survive.
        _ticks(5); // t1..t5: A (3,2)->(7,2); B (21,3)->(21,7)
        _steer(A, DOWN); // applies t6
        _ticks(17); // t6..t22: A descends to (7,19); B dies on (21,24)
        // A is the last snake alive -> match settles, fresh lobby opens.
        assertEq(uint256(game.phase()), 0);
        uint256 fee = (2 * ENTRY * 500) / 10000;
        assertEq(game.pendingWithdrawals(A), 2 * ENTRY - fee);
        assertEq(game.pendingWithdrawals(TREASURY), fee);
        // Winner pulls the prize.
        uint256 balBefore = token.balanceOf(A);
        vm.prank(A);
        game.claim();
        assertEq(token.balanceOf(A), balBefore + 2 * ENTRY - fee);
    }

    function testDeathScattersCoins() public {
        _joinStart(3);
        // B walks straight down into the wall (dies t22 on (21,24)).
        // A parks down the x=7 column, C climbs the x=12 column.
        _ticks(5); // t1..t5: A (3,2)->(7,2); C (3,21)->(7,21); B (21,3)->(21,7)
        _steer(A, DOWN); // applies t6
        _ticks(5); // t6..t10: A (7,3)->(7,7); C (8,21)->(12,21)
        _steer(C, UP); // applies t11
        _ticks(12); // t11..t22: B dies t22; A (7,8)->(7,19); C (12,20)->(12,9)
        // B is dead, A and C alive -> match continues, no settlement.
        (,,,,, bool[] memory alives,,) = game.getMatchState();
        assertTrue(alives[0]); // A
        assertFalse(alives[1]); // B
        assertTrue(alives[2]); // C
        // B's body scattered as coins on top of the maintained target.
        assertGe(game.getCoins().length, 8);
    }

    // ---- coin eating (slither-style scatter) ----

    function testCoinEatingGrowsScoreAndLength() public {
        _joinStart(3);
        // B death-march: LEFT along y=3, then UP the x=3 column into the
        // top wall at tick 23. Body [(3,0),(3,1),(3,2)] scatters as coins.
        _tick(); // t1
        _steer(B, LEFT); // applies t2
        _ticks(18); // t2..t19: B (20,3)->(3,3); A (4,2)->(21,2); C (4,21)->(21,21)
        _steer(B, UP); // applies t20
        _steer(C, UP); // applies t20
        _ticks(2); // t20..t21: B (3,2),(3,1); C (21,20),(21,19); A (22,2),(23,2)
        _steer(A, DOWN); // applies t22
        uint256 scoreBefore = game.score(A);
        _tick(); // t22: B (3,0); A (23,3)
        _tick(); // t23: B dies on (3,-1); A (23,4); C (21,17)
        // Count how many scatter coins actually landed (cells may rarely
        // already hold a coin, in which case scatter skips them).
        uint256 scattered = 0;
        if (_coinAt(3, 0)) scattered += 1;
        if (_coinAt(3, 1)) scattered += 1;
        if (_coinAt(3, 2)) scattered += 1;
        assertGe(scattered, 1); // sanity: the test must eat something real
        // A: down the x=23 column, left along y=23, up the x=3 column.
        // C: parks the rectangle (21,21)->(21,6)->(6,6)->(6,19)->(20,19)->up.
        _ticks(11); // t24..t34: A (23,5)->(23,15); C (21,16)->(21,6)
        _steer(C, LEFT); // applies t35
        _ticks(8); // t35..t42: A (23,16)->(23,23); C (20,6)->(13,6)
        _steer(A, LEFT); // applies t43
        _ticks(7); // t43..t49: A (22,23)->(16,23); C (12,6)->(6,6)
        _steer(C, DOWN); // applies t50
        _ticks(13); // t50..t62: A (15,23)->(3,23); C (6,7)->(6,19)
        _steer(A, UP); // applies t63
        _steer(C, RIGHT); // applies t63
        _ticks(14); // t63..t76: A (3,22)->(3,9); C (7,19)->(20,19)
        _steer(C, UP); // applies t77
        _ticks(6); // t77..t82: A (3,8)->(3,3); C (20,18)->(20,13)
        _tick(); // t83: A (3,2) eats
        _tick(); // t84: A (3,1) eats
        _tick(); // t85: A (3,0) eats
        (uint8 hx, uint8 hy) = _head(A);
        assertEq(hx, 3);
        assertEq(hy, 0);
        // Every scatter coin A walked over was eaten (plus any incidental
        // coins en route): score and length both grew.
        assertGe(game.score(A), scoreBefore + scattered);
        assertGe(game.getSegments(A).length, 3 + scattered);
        // Coin target is maintained after eats.
        assertEq(game.getCoins().length, 8);
    }

    // ---- timeout: score-weighted split ----

    function testTimeoutScoreSplit() public {
        // Short match: 10 ticks, both snakes park safely, 0-0 -> equal split.
        token.mint(A, ENTRY);
        token.mint(B, ENTRY);
        ViperSnake shortGame = new ViperSnake(address(token), ENTRY, TREASURY, 10);
        vm.prank(A);
        token.approve(address(shortGame), ENTRY);
        vm.prank(B);
        token.approve(address(shortGame), ENTRY);
        vm.prank(A);
        shortGame.join();
        vm.prank(B);
        shortGame.join();
        vm.warp(block.timestamp + 61);
        shortGame.startMatch();
        // Park: A right then down; B down then left. 10 ticks total.
        for (uint256 i = 0; i < 8; i++) {
            vm.roll(block.number + 1);
            shortGame.poke();
        }
        vm.prank(A);
        shortGame.setDirection(DOWN);
        vm.prank(B);
        shortGame.setDirection(LEFT);
        vm.roll(block.number + 1);
        shortGame.poke(); // tick 9
        vm.roll(block.number + 1);
        shortGame.poke(); // tick 10 -> timeout settle
        assertEq(uint256(shortGame.phase()), 0); // fresh lobby
        uint256 fee = (2 * ENTRY * 500) / 10000;
        uint256 share = (2 * ENTRY - fee) / 2;
        assertEq(shortGame.pendingWithdrawals(A), share);
        assertEq(shortGame.pendingWithdrawals(B), share);
        assertEq(shortGame.pendingWithdrawals(TREASURY), fee);
    }

    // ---- session keys ----

    function testSessionKeySteers() public {
        address K = vm.addr(1);
        vm.prank(A);
        game.joinWithSession(K, uint64(block.timestamp + 1 hours));
        vm.prank(B);
        game.join();
        vm.warp(block.timestamp + 61);
        game.startMatch();
        _tick(); // tick 1
        vm.prank(K);
        game.setDirection(DOWN); // session key acts as A
        assertTrue(game.hasPendingDir(A));
        // Random key is rejected.
        vm.prank(address(0xBAD));
        vm.expectRevert("no session");
        game.setDirection(DOWN);
        // Revoke kills it.
        vm.prank(A);
        game.revokeSession(K);
        vm.prank(K);
        vm.expectRevert("no session");
        game.setDirection(DOWN);
    }

    function testSessionKeyExpiry() public {
        address K = vm.addr(2);
        vm.prank(A);
        game.joinWithSession(K, uint64(block.timestamp + 1 hours));
        vm.prank(B);
        game.join();
        vm.warp(block.timestamp + 61);
        game.startMatch();
        vm.warp(block.timestamp + 2 hours); // past expiry
        vm.roll(block.number + 1);
        vm.prank(K);
        vm.expectRevert("no session");
        game.setDirection(DOWN);
    }

    function testJoinWithSessionBadExpiryReverts() public {
        vm.prank(A);
        vm.expectRevert("expiry in past");
        game.joinWithSession(vm.addr(3), uint64(block.timestamp - 1));
        vm.prank(A);
        vm.expectRevert("expiry too far");
        game.joinWithSession(vm.addr(3), uint64(block.timestamp + 2 days));
    }
}
