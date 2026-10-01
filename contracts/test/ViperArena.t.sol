// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ViperArena.sol";

contract MockVIPER {
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

/// @notice ERC20 whose transfer() reverts for blocklisted recipients.
///         Models a griefing / sanctioned / broken recipient token path.
contract MockBlocklistToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public blocklisted;

    function mint(address to, uint256 amt) external { balanceOf[to] += amt; }

    function setBlocklisted(address who, bool v) external { blocklisted[who] = v; }

    function approve(address sp, uint256 amt) external returns (bool) {
        allowance[msg.sender][sp] = amt;
        return true;
    }

    function transfer(address to, uint256 amt) external returns (bool) {
        require(!blocklisted[to], "blocked recipient");
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
    MockVIPER token;
    ViperArena arena;

    address constant A = address(0xA);
    address constant B = address(0xB);
    address constant TREASURY = address(0x77);
    uint256 constant ENTRY = 100;
    uint256 constant FUSE = 30;
    uint256 constant MAX_BLOCKS = 3000;

    function setUp() public {
        token = new MockVIPER();
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
        // Refunds are pull-payment now: join, startMatch, then claim.
        vm.prank(A); arena.claim();
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

    function test_DeadCallerMoveSettlesInsteadOfReverting() public {
        _joinTwoAndStart();
        // A plants at spawn (0,0) and stays; B is safe at (10,0).
        vm.prank(A); arena.plantBomb();
        vm.roll(block.number + FUSE + 1);
        // A's bomb detonates inside move(), killing A. The call must NOT
        // revert (SEC-01): the death stands and B, sole survivor, wins.
        vm.prank(A); arena.move(1, 0);
        assertEq(uint8(arena.phase()), uint8(ViperArena.Phase.Lobby));
        // Winnings/fees are pull-payment now: winners claim after settlement.
        vm.prank(TREASURY); arena.claim();
        vm.prank(B); arena.claim();
        assertEq(token.balanceOf(TREASURY), 10);
        assertEq(token.balanceOf(B), 1000 - ENTRY + 190);
        assertEq(token.balanceOf(A), 1000 - ENTRY);
    }

    function test_BombKillsAndWinnerTakesPot() public {
        _joinTwoAndStart();
        // A plants a bomb on (0,0) and stays: dies in own blast.
        vm.prank(A); arena.plantBomb();
        vm.roll(block.number + FUSE + 1);
        arena.poke();

        assertFalse(arena.alive(A));
        assertTrue(arena.alive(B) == false); // new lobby reset aliveness
        // Pot math: 200 in, 5% fee = 10, winner gets 190 (claimed pull-style).
        vm.prank(TREASURY); arena.claim();
        vm.prank(B); arena.claim();
        assertEq(token.balanceOf(TREASURY), 10);
        assertEq(token.balanceOf(B), 1000 - ENTRY + 190);
        assertEq(token.balanceOf(A), 1000 - ENTRY); // dead, no prize
        assertEq(uint8(arena.phase()), uint8(ViperArena.Phase.Lobby)); // next lobby
    }

    function test_SuddenDeathSplitsPot() public {
        _joinTwoAndStart();
        vm.roll(block.number + MAX_BLOCKS + 1);
        arena.poke();
        // 200 pot, 10 fee, 95 each — claimed pull-style.
        vm.prank(A); arena.claim();
        vm.prank(B); arena.claim();
        vm.prank(TREASURY); arena.claim();
        assertEq(token.balanceOf(A), 1000 - ENTRY + 95);
        assertEq(token.balanceOf(B), 1000 - ENTRY + 95);
        assertEq(token.balanceOf(TREASURY), 10);
    }

    function test_SplitDustSweptToTreasury() public {
        // ENTRY=10 makes the fee inexact on a 3-way split: pot 30, fee 1,
        // 29 splits 3 ways -> 9 each, dust 2 -> swept to the treasury.
        address C = address(0xC);
        ViperArena arena2 = new ViperArena(address(token), 10, TREASURY, FUSE, MAX_BLOCKS);
        token.mint(C, 1000);
        vm.prank(A); token.approve(address(arena2), type(uint256).max);
        vm.prank(B); token.approve(address(arena2), type(uint256).max);
        vm.prank(C); token.approve(address(arena2), type(uint256).max);
        vm.prank(A); arena2.join();
        vm.prank(B); arena2.join();
        vm.prank(C); arena2.join();
        vm.warp(block.timestamp + 61);
        arena2.startMatch();
        // Sudden death: all 3 survive -> 3-way split with dust.
        vm.roll(block.number + MAX_BLOCKS + 1);
        arena2.poke();

        assertEq(arena2.pendingWithdrawals(A), 9, "A share");
        assertEq(arena2.pendingWithdrawals(B), 9, "B share");
        assertEq(arena2.pendingWithdrawals(C), 9, "C share");
        assertEq(arena2.pendingWithdrawals(TREASURY), 3, "fee 1 + dust 2");

        vm.prank(A); arena2.claim();
        vm.prank(B); arena2.claim();
        vm.prank(C); arena2.claim();
        vm.prank(TREASURY); arena2.claim();
        assertEq(token.balanceOf(A), 1000 - 10 + 9);
        assertEq(token.balanceOf(B), 1000 - 10 + 9);
        assertEq(token.balanceOf(C), 1000 - 10 + 9);
        assertEq(token.balanceOf(TREASURY), 3);
        // Nothing left locked in the arena.
        assertEq(token.balanceOf(address(arena2)), 0);
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

        // Both players died in the same block -> last batch splits: 95 each
        // (claimed pull-style).
        vm.prank(A); arena2.claim();
        vm.prank(B); arena2.claim();
        vm.prank(TREASURY); arena2.claim();
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

    // SEC-02: a lobby left idle past expiry must not trap the next joiner
    // in an instant startMatch -> cancel. The first join restarts the 60s
    // countdown, so startMatch can't fire until a real lobby has run.
    function test_FirstJoinRestartsStaleLobby() public {
        vm.warp(block.timestamp + 3600); // lobby sits idle, long expired
        vm.prank(A); arena.join(); // first join re-opens the 60s window
        vm.expectRevert("lobby still open");
        arena.startMatch(); // must NOT be instantly startable/cancellable
        vm.prank(B); arena.join();
        vm.warp(block.timestamp + 61);
        arena.startMatch();
        assertEq(uint8(arena.phase()), uint8(ViperArena.Phase.Live));
    }

    // SEC-02: once the 60s window lapses with players waiting, the lobby
    // is locked for joining — late joiners are rejected instead of walking
    // into a match that's already past its start line.
    function test_CannotJoinExpiredLobby() public {
        vm.prank(A); arena.join(); // countdown starts
        vm.warp(block.timestamp + 61); // window lapses
        vm.expectRevert("lobby closed");
        vm.prank(B); arena.join();
    }

    // SEC-05: detonated bombs are tombstoned (live=false) but must not pile
    // up in the array: _processExplosions compacts them away (swap-and-pop)
    // so scans stay O(live). Staggered due times via explicit rolls (forge
    // does not auto-mine between calls).
    function test_BombsArrayCompactsAfterDetonation() public {
        _joinTwoAndStart();
        // A plants at (0,0), retreats to (0,4) — outside own blast.
        vm.prank(A); arena.plantBomb();
        uint256 plantedA = block.number;
        for (uint256 i = 0; i < 4; i++) { vm.prank(A); arena.move(int8(0), int8(1)); }
        // B plants 10 blocks later at (10,0), retreats to (10,4).
        vm.roll(block.number + 10);
        vm.prank(B); arena.plantBomb();
        for (uint256 i = 0; i < 4; i++) { vm.prank(B); arena.move(int8(0), int8(1)); }

        assertEq(arena.getBombs().length, 2);

        // Only A's bomb is due: poke detonates it, compacts it away, and
        // B's live bomb remains as the sole entry.
        vm.roll(plantedA + FUSE + 1);
        arena.poke();
        assertTrue(arena.alive(A));
        assertTrue(arena.alive(B));
        assertEq(uint8(arena.phase()), uint8(ViperArena.Phase.Live)); // match still live
        ViperArena.Bomb[] memory remaining = arena.getBombs();
        assertEq(remaining.length, 1, "detonated bomb must be compacted away");
        assertTrue(remaining[0].live);
        assertEq(remaining[0].planter, B);

        // B's bomb goes off too: array drains to zero.
        vm.roll(block.number + 10);
        arena.poke();
        assertEq(arena.getBombs().length, 0, "all detonated bombs compacted");
        assertTrue(arena.alive(A));
        assertTrue(arena.alive(B));
    }

    // SEC-04: deaths must batch by the time they chronologically happened
    // (detonateAt), not by the block of the lazy poke that processed them.
    // Bomb 1 (due T1) kills B; bomb 2 (due T2 > T1) kills A and C. One poke
    // past T2 processes both lazily. Chronologically B died alone at T1, so
    // the last batch eliminated is {A, C}: they split, B gets nothing. Under
    // the old block-number batching all three merged and split 3 ways.
    function test_LazyDeathsBatchByDetonateAt() public {
        address C = address(0xC);
        token.mint(C, 1000);
        vm.prank(C); token.approve(address(arena), type(uint256).max);

        vm.prank(A); arena.join();
        vm.prank(B); arena.join();
        vm.prank(C); arena.join();
        vm.warp(block.timestamp + 61);
        arena.startMatch();
        // Spawns: A (0,0), B (10,0), C (0,10). Pot = 300, fee = 15.

        // B walks into A's future blast: (10,0) -> (3,0).
        for (uint256 i = 0; i < 7; i++) {
            vm.prank(B); arena.move(int8(-1), int8(0));
        }
        // A plants bomb 1 at (0,0) and retreats to (0,4) — outside the
        // radius-3 vertical blast (covers y <= 3).
        vm.prank(A); arena.plantBomb();
        uint256 t1 = block.number + FUSE;
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(A); arena.move(int8(0), int8(1));
        }
        // C walks to (0,5) and plants bomb 2 there: its blast catches A at
        // (0,4) and C itself. Planted 10 blocks later (forge does not
        // auto-mine between calls), so T2 > T1.
        vm.roll(block.number + 10);
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(C); arena.move(int8(0), int8(-1));
        }
        vm.prank(C); arena.plantBomb();
        uint256 t2 = block.number + FUSE;
        assertGt(t2, t1, "bomb 2 must be due after bomb 1");

        // Warp past BOTH due times, poke once: a single lazy batch.
        vm.roll(t2 + 1);
        arena.poke();

        assertEq(uint8(arena.phase()), uint8(ViperArena.Phase.Lobby));
        // (300 - 15) / 2 = 142 each to A and C; B died in the earlier batch.
        assertEq(arena.pendingWithdrawals(A), 142);
        assertEq(arena.pendingWithdrawals(C), 142);
        assertEq(arena.pendingWithdrawals(B), 0);
        // Treasury: fee 15 + split dust 1 ((300-15) % 2).
        assertEq(arena.pendingWithdrawals(TREASURY), 16);
    }

    // SEC-03: a recipient whose token transfers always revert must not be
    // able to freeze match progression. With pull payments, settlement only
    // writes credits — the match settles and opens a fresh lobby, good
    // recipients claim fine, and only the blocked recipient's own claim
    // fails. Under the old push design this poke() reverted and the match
    // bricked forever.
    function test_BlockedRecipientCannotFreezeSettlement() public {
        MockBlocklistToken bad = new MockBlocklistToken();
        bad.mint(A, 1000);
        bad.mint(B, 1000);
        ViperArena arenaB = new ViperArena(address(bad), ENTRY, TREASURY, FUSE, MAX_BLOCKS);
        vm.prank(A); bad.approve(address(arenaB), type(uint256).max);
        vm.prank(B); bad.approve(address(arenaB), type(uint256).max);
        bad.setBlocklisted(A, true); // A can never receive a direct transfer

        vm.prank(A); arenaB.join();
        vm.prank(B); arenaB.join();
        vm.warp(block.timestamp + 61);
        arenaB.startMatch();

        // Both die in A's blast: A plants at (0,0) and stays; B walks from
        // (10,0) to (3,0), inside the radius-3 blast.
        vm.prank(A); arenaB.plantBomb();
        for (uint256 i = 0; i < 7; i++) {
            vm.prank(B); arenaB.move(int8(-1), int8(0));
        }
        vm.roll(block.number + FUSE + 1);
        arenaB.poke(); // must NOT revert even though A is blocklisted

        // Match progressed: fresh lobby is open.
        assertEq(uint8(arenaB.phase()), uint8(ViperArena.Phase.Lobby));
        // Pot 200, fee 10, 95 each — credited, not pushed.
        assertEq(arenaB.pendingWithdrawals(A), 95);
        assertEq(arenaB.pendingWithdrawals(B), 95);
        assertEq(arenaB.pendingWithdrawals(TREASURY), 10);
        // Only the blocked recipient's claim fails; everyone else is fine.
        vm.prank(A); vm.expectRevert("blocked recipient"); arenaB.claim();
        vm.prank(B); arenaB.claim();
        assertEq(bad.balanceOf(B), 1000 - ENTRY + 95);
        vm.prank(TREASURY); arenaB.claim();
        assertEq(bad.balanceOf(TREASURY), 10);
    }

    // ---- Session keys: zero mid-game pop-ups, gameplay-only scope ----

    function test_JoinWithSessionRegistersKey() public {
        address K = address(0x5E55);
        uint64 expiry = uint64(block.timestamp + 2 hours);
        vm.prank(A); arena.joinWithSession(K, expiry);

        assertTrue(arena.joined(A), "player joined");
        assertEq(arena.pot(), ENTRY);
        (address player, uint64 exp, bool revoked, uint256 authMatch) = arena.sessions(K);
        assertEq(player, A);
        assertEq(exp, expiry);
        assertFalse(revoked);
        assertEq(authMatch, arena.matchId());
    }

    function test_JoinWithSessionValidation() public {
        address K = address(0x5E55);
        vm.prank(A); vm.expectRevert("zero session key");
        arena.joinWithSession(address(0), uint64(block.timestamp + 100));
        vm.prank(A); vm.expectRevert("expiry in past");
        arena.joinWithSession(K, uint64(block.timestamp));
        vm.prank(A); vm.expectRevert("expiry too far");
        arena.joinWithSession(K, uint64(block.timestamp + 2 days));
    }

    function test_SessionKeyMovesAndPlantsAsPlayer() public {
        address K = address(0x5E55);
        vm.prank(A); arena.joinWithSession(K, uint64(block.timestamp + 2 hours));
        vm.prank(B); arena.join();
        vm.warp(block.timestamp + 61);
        arena.startMatch();

        // K moves as A: A spawns at (0,0).
        vm.prank(K); arena.move(int8(1), int8(0));
        assertEq(arena.px(A), 1, "session move lands on player coords");
        assertEq(arena.py(A), 0);
        // K plants as A: bomb planter is the player, not the key.
        vm.prank(K); arena.plantBomb();
        ViperArena.Bomb[] memory bombs = arena.getBombs();
        assertEq(bombs.length, 1);
        assertEq(bombs[0].planter, A, "planter must be the player");
    }

    function test_SessionKeyCannotTouchFunds() public {
        address K = address(0x5E55);
        vm.prank(A); arena.joinWithSession(K, uint64(block.timestamp + 2 hours));
        vm.prank(B); arena.join();
        vm.warp(block.timestamp + 61);
        arena.startMatch();

        // The key has no winnings: claim() is wallet-scoped, keys get nothing.
        vm.prank(K); vm.expectRevert("nothing to claim"); arena.claim();
        // A stranger's key (or no key at all) can't move anyone.
        vm.prank(address(0xD)); vm.expectRevert("no session"); arena.move(int8(1), int8(0));
    }

    function test_UnauthorizedRevokeReverts() public {
        address K = address(0x5E55);
        vm.prank(A); arena.joinWithSession(K, uint64(block.timestamp + 2 hours));
        // B is neither the player nor the key.
        vm.prank(B); vm.expectRevert("not authorized"); arena.revokeSession(K);
        vm.prank(B); vm.expectRevert("unknown session"); arena.revokeSession(address(0xD));
    }

    function test_SelfRevokeKillsKeyNotPlayer() public {
        address K = address(0x5E55);
        vm.prank(A); arena.joinWithSession(K, uint64(block.timestamp + 2 hours));
        vm.prank(B); arena.join();
        vm.warp(block.timestamp + 61);
        arena.startMatch();

        // The key revokes itself (escape hatch); the player keeps playing.
        vm.prank(K); arena.revokeSession(K);
        (, , bool revoked, ) = arena.sessions(K);
        assertTrue(revoked);
        vm.prank(K); vm.expectRevert("no session"); arena.move(int8(1), int8(0));
        vm.prank(A); arena.move(int8(1), int8(0));
        assertEq(arena.px(A), 1, "player unaffected by key revocation");
    }

    function test_ExpiredSessionReverts() public {
        address K = address(0x5E55);
        vm.prank(A); arena.joinWithSession(K, uint64(block.timestamp + 100));
        vm.prank(B); arena.join();
        vm.warp(block.timestamp + 61);
        arena.startMatch();
        // Past expiry: the key is dead, even mid-match.
        vm.warp(block.timestamp + 50);
        vm.prank(K); vm.expectRevert("no session"); arena.move(int8(1), int8(0));
        // The player can still act directly (falls back to wallet path).
        vm.prank(A); arena.move(int8(1), int8(0));
        assertEq(arena.px(A), 1);
    }

    function test_SessionScopedToMatch() public {
        address K = address(0x5E55);
        vm.prank(A); arena.joinWithSession(K, uint64(block.timestamp + 2 hours));
        vm.prank(B); arena.join();
        vm.warp(block.timestamp + 61);
        arena.startMatch();
        // Match 1 ends by sudden death; fresh lobby opens.
        vm.roll(block.number + MAX_BLOCKS + 1);
        arena.poke();
        assertEq(uint8(arena.phase()), uint8(ViperArena.Phase.Lobby));

        // Match 2: both join directly and start.
        vm.prank(A); arena.join();
        vm.prank(B); arena.join();
        vm.warp(block.timestamp + 61);
        arena.startMatch();
        // K was authorized for match 1 only.
        vm.prank(K); vm.expectRevert("no session"); arena.move(int8(1), int8(0));
        vm.prank(A); arena.move(int8(1), int8(0));
        assertEq(arena.px(A), 1);
    }
}
