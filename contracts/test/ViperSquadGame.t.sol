// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ViperSquadGame.sol";

contract SquadMockToken {
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

contract SquadMockPass {
    mapping(address => uint256) public balanceOf;
    function mint(address to) external { balanceOf[to] += 1; }
}

/// @notice 6-decimal mock USDG used as the games' stake token.
contract MockUSDG {
    uint8 public decimals = 6;
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

contract ViperSquadGameTest is Test {
    MockUSDG usdg;
    SquadMockToken viper;
    SquadMockPass pass;
    ViperSquadGame game;

    address constant A = address(0xA);
    address constant B = address(0xB);
    address constant C = address(0xC);
    address constant D = address(0xD);
    address constant E = address(0xE);
    address constant F = address(0xF);
    address constant G = address(0xA11CE);
    address constant H = address(0xBEEF);
    address constant TREASURY = address(0x77);
    address constant REWARDS_POOL = address(0x99);
    uint256 constant ENTRY = 100;
    uint256 constant ROUND = 45;

    address[8] internal PS;

    function setUp() public {
        PS = [A, B, C, D, E, F, G, H];
        usdg = new MockUSDG();
        viper = new SquadMockToken();
        pass = new SquadMockPass();
        game = new ViperSquadGame(
            address(usdg), address(viper), ENTRY, TREASURY, REWARDS_POOL, 32, 2, ROUND, address(0), 0
        );
        vm.roll(1000);
        vm.warp(100000);
        for (uint256 i = 0; i < 8; i++) {
            usdg.mint(PS[i], 100000);
            vm.prank(PS[i]);
            usdg.approve(address(game), 100000);
        }
        // Fund the VIPER bonus reserve.
        viper.mint(address(this), 1_000_000e18);
        viper.approve(address(game), 1_000_000e18);
        game.fundViper(1_000_000e18);
    }

    /// @dev Scan recorded logs for an event signature.
    function _sawEvent(Vm.Log[] memory logs, bytes32 sig) internal pure returns (bool) {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == sig) return true;
        }
        return false;
    }

    // ---- helpers ----

    function _gameWithPass(uint256 _passFee) internal returns (ViperSquadGame) {
        ViperSquadGame g = new ViperSquadGame(
            address(usdg), address(viper), ENTRY, TREASURY, REWARDS_POOL, 32, 2, ROUND, address(pass), _passFee
        );
        for (uint256 i = 0; i < 8; i++) {
            vm.prank(PS[i]);
            usdg.approve(address(g), 100000);
        }
        return g;
    }

    /// @dev Join players[0..n), warp past the 60s lobby, start the match.
    function _joinStart(uint256 n) internal {
        for (uint256 i = 0; i < n; i++) {
            vm.prank(PS[i]);
            game.join();
        }
        vm.warp(block.timestamp + 61);
        game.startMatch();
    }

    function _survive(address p) internal {
        vm.prank(p);
        game.survive();
    }

    // ---- constructor ----

    function testConstructorRejectsPassFeeAboveEntry() public {
        vm.expectRevert("pass fee > entry");
        new ViperSquadGame(address(usdg), address(viper), ENTRY, TREASURY, REWARDS_POOL, 32, 2, ROUND, address(pass), ENTRY + 1);
    }

    function testConstructorRejectsBadPlayerBounds() public {
        vm.expectRevert("bad player bounds");
        new ViperSquadGame(address(usdg), address(viper), ENTRY, TREASURY, REWARDS_POOL, 32, 33, ROUND, address(0), 0);
    }

    // ---- lobby ----

    function testJoinTakesEntryFee() public {
        vm.prank(A);
        game.join();
        assertEq(game.pot(), ENTRY);
        assertEq(game.paidFee(A), ENTRY);
        assertEq(usdg.balanceOf(address(game)), ENTRY);
    }

    function testPassHolderDiscount() public {
        ViperSquadGame g = _gameWithPass(40);
        pass.mint(A);
        vm.prank(A);
        g.join();
        assertEq(g.paidFee(A), 40);
        assertEq(g.pot(), 40);
    }

    function testPassHolderFreeEntry() public {
        ViperSquadGame g = _gameWithPass(0);
        pass.mint(A);
        vm.prank(A);
        g.join();
        assertEq(g.paidFee(A), 0);
        assertEq(g.pot(), 0);
        assertTrue(g.joined(A));
        assertTrue(g.alive(A));
    }

    function testNonHolderPaysFullWhenPassSet() public {
        ViperSquadGame g = _gameWithPass(40);
        vm.prank(B); // no pass minted
        g.join();
        assertEq(g.paidFee(B), ENTRY);
    }

    function testDoubleJoinReverts() public {
        vm.prank(A);
        game.join();
        vm.prank(A);
        vm.expectRevert("already joined");
        game.join();
    }

    function testLobbyFullReverts() public {
        ViperSquadGame g = new ViperSquadGame(address(usdg), address(viper), ENTRY, TREASURY, REWARDS_POOL, 2, 2, ROUND, address(0), 0);
        for (uint256 i = 0; i < 2; i++) {
            vm.prank(PS[i]);
            usdg.approve(address(g), 100000);
            vm.prank(PS[i]);
            g.join();
        }
        vm.prank(C);
        usdg.approve(address(g), 100000);
        vm.prank(C);
        vm.expectRevert("lobby full");
        g.join();
    }

    function testFirstJoinRestartsLobbyTimer() public {
        // Play and settle a full match so a fresh lobby opens.
        _joinStart(2);
        _survive(A);
        vm.warp(block.timestamp + 1);
        _survive(B);
        vm.warp(block.timestamp + ROUND + 1);
        game.resolveRound();
        uint256 stale = game.lobbyEndsAt();
        vm.warp(block.timestamp + 50); // near the stale post-settle expiry
        vm.prank(A);
        game.join(); // first joiner restarts the 60s countdown from now
        assertApproxEqAbs(game.lobbyEndsAt(), block.timestamp + 60, 1);
        assertTrue(game.lobbyEndsAt() > stale);
    }

    function testStartMatchTooEarlyReverts() public {
        vm.prank(A);
        game.join();
        vm.expectRevert("lobby still open");
        game.startMatch();
    }

    function testStartMatchRefundsWhenTooFew() public {
        ViperSquadGame g = new ViperSquadGame(address(usdg), address(viper), ENTRY, TREASURY, REWARDS_POOL, 32, 4, ROUND, address(0), 0);
        for (uint256 i = 0; i < 2; i++) {
            vm.prank(PS[i]);
            usdg.approve(address(g), 100000);
            vm.prank(PS[i]);
            g.join();
        }
        vm.warp(block.timestamp + 61);
        g.startMatch();
        assertEq(uint256(g.phase()), 0); // back to Lobby
        assertEq(g.pendingWithdrawals(A), ENTRY);
        assertEq(g.pendingWithdrawals(B), ENTRY);
        assertEq(g.pot(), 0);
    }

    function testJoinAfterLobbyClosedReverts() public {
        vm.prank(A);
        game.join();
        vm.warp(block.timestamp + 61);
        vm.prank(B);
        vm.expectRevert("lobby closed");
        game.join();
    }

    // ---- rounds ----

    function testSurviveRecordsCheckIn() public {
        _joinStart(4);
        _survive(A);
        assertTrue(game.checkedIn(A));
        assertEq(game.checkInTime(A), block.timestamp);
        assertEq(game.checkInCount(), 1);
        assertEq(game.round(), 1);
    }

    function testDoubleSurviveReverts() public {
        _joinStart(4);
        _survive(A);
        vm.prank(A);
        vm.expectRevert("already checked in");
        game.survive();
    }

    function testMissedWindowEliminated() public {
        _joinStart(4);
        _survive(A);
        vm.warp(block.timestamp + 1);
        _survive(B);
        vm.warp(block.timestamp + 1);
        _survive(C); // slowest checker
        // D ghosts the round.
        vm.warp(block.timestamp + ROUND + 1);
        game.resolveRound();
        assertFalse(game.alive(D)); // missed window -> reason 0
        assertFalse(game.alive(C)); // slowest quartile -> reason 1
        assertTrue(game.alive(A));
        assertTrue(game.alive(B));
        assertEq(game.aliveCount(), 2);
        assertEq(game.round(), 2); // next round began
        assertEq(game.checkInCount(), 0); // check-ins reset
        assertFalse(game.checkedIn(A));
    }

    function testSlowestQuartileEliminated() public {
        _joinStart(8);
        for (uint256 i = 0; i < 8; i++) {
            _survive(PS[i]);
            vm.warp(block.timestamp + 1); // strictly increasing check-in times
        }
        vm.warp(block.timestamp + ROUND + 1);
        game.resolveRound();
        // ceil(8/4) = 2 slowest eliminated: the last two check-ins (G, H).
        assertFalse(game.alive(G));
        assertFalse(game.alive(H));
        assertEq(game.aliveCount(), 6);
        assertTrue(game.alive(A));
    }

    function testTieBrokenByJoinOrder() public {
        _joinStart(2);
        _survive(A);
        _survive(B); // same block.timestamp as A: tie
        assertEq(game.checkInTime(A), game.checkInTime(B));
        vm.warp(block.timestamp + ROUND + 1);
        game.resolveRound();
        // C=2 -> k=1; tie broken by join order: A (earlier join) survives.
        // (alive flags are reset by the new lobby; winnings prove the outcome.)
        uint256 fee = (2 * ENTRY * 500) / 10000;
        assertEq(game.pendingWithdrawals(A), 2 * ENTRY - fee);
        assertEq(game.pendingWithdrawals(B), 0);
        assertEq(uint256(game.phase()), 0);
    }

    function testLoneCheckerSurvives() public {
        _joinStart(3);
        _survive(A); // B and C ghost
        vm.warp(block.timestamp + ROUND + 1);
        game.resolveRound();
        assertFalse(game.alive(B));
        assertFalse(game.alive(C));
        // A is the last one standing -> wins immediately.
        // (alive flags and aliveCount are reset by the new lobby;
        //  winnings prove the outcome.)
        uint256 fee = (3 * ENTRY * 500) / 10000;
        assertEq(game.pendingWithdrawals(A), 3 * ENTRY - fee);
        assertEq(game.pendingWithdrawals(TREASURY), fee);
    }

    function testAllAfkSplitsPotEqually() public {
        _joinStart(4);
        vm.warp(block.timestamp + ROUND + 1);
        game.resolveRound(); // nobody checked in: final batch splits
        uint256 fee = (4 * ENTRY * 500) / 10000; // 20
        uint256 share = (4 * ENTRY - fee) / 4; // 95
        for (uint256 i = 0; i < 4; i++) {
            assertEq(game.pendingWithdrawals(PS[i]), share);
        }
        assertEq(game.pendingWithdrawals(TREASURY), fee);
        assertEq(uint256(game.phase()), 0); // new lobby
    }

    function testWinnerTakesPotMinusFee() public {
        _joinStart(2);
        _survive(A);
        vm.warp(block.timestamp + 1);
        _survive(B); // B is slower -> eliminated
        vm.warp(block.timestamp + ROUND + 1);
        game.resolveRound();
        // B was the slowest check-in -> eliminated; A takes the pot.
        // (alive flags are reset by the new lobby; winnings prove the outcome.)
        uint256 fee = (2 * ENTRY * 500) / 10000; // 10
        assertEq(game.pendingWithdrawals(A), 2 * ENTRY - fee); // 190
        assertEq(game.pendingWithdrawals(TREASURY), fee);
        assertEq(uint256(game.phase()), 0);
    }

    function testResolveBeforeDeadlineReverts() public {
        _joinStart(4);
        vm.expectRevert("round not due");
        game.resolveRound();
    }

    function testSurviveAutoResolvesDueRound() public {
        _joinStart(4);
        _survive(A);
        vm.warp(block.timestamp + 1);
        _survive(B);
        vm.warp(block.timestamp + 1);
        _survive(C); // slowest checker of round 1
        // D ghosts round 1.
        vm.warp(block.timestamp + ROUND + 1);
        // A's survive() auto-resolves round 1 (D missed, C slowest -> out),
        // then checks A into round 2.
        _survive(A);
        assertEq(game.round(), 2);
        assertTrue(game.checkedIn(A));
        assertTrue(game.alive(A));
        assertTrue(game.alive(B));
        assertFalse(game.alive(C));
        assertFalse(game.alive(D));
    }

    function testSurviveAfterEliminationIsSilentNoop() public {
        _joinStart(2);
        _survive(A); // B ghosts round 1
        vm.warp(block.timestamp + ROUND + 1);
        // B's survive(): round 1 auto-resolves (B missed -> eliminated, A wins),
        // then returns silently instead of reverting.
        vm.prank(B);
        game.survive();
        assertEq(uint256(game.phase()), 0); // match settled, new lobby
        assertFalse(game.alive(B));
    }

    function testClaimPullPayment() public {
        _joinStart(2);
        _survive(A);
        vm.warp(block.timestamp + 1);
        _survive(B);
        vm.warp(block.timestamp + ROUND + 1);
        game.resolveRound();
        uint256 before = usdg.balanceOf(A);
        vm.prank(A);
        game.claim();
        assertEq(usdg.balanceOf(A) - before, 2 * ENTRY - (2 * ENTRY * 500) / 10000);
        assertEq(game.pendingWithdrawals(A), 0);
    }

    function testClaimNothingReverts() public {
        vm.prank(A);
        vm.expectRevert("nothing to claim");
        game.claim();
    }

    // ---- session keys ----

    function testSessionKeySurvive() public {
        address sessKey = address(0x5E55);
        vm.prank(A);
        game.joinWithSession(sessKey, uint64(block.timestamp + 3600));
        vm.prank(B);
        game.join();
        vm.warp(block.timestamp + 61);
        game.startMatch();
        vm.prank(sessKey);
        game.survive();
        assertTrue(game.checkedIn(A));
    }

    function testRevokedSessionCannotSurvive() public {
        address sessKey = address(0x5E55);
        vm.prank(A);
        game.joinWithSession(sessKey, uint64(block.timestamp + 3600));
        vm.prank(B);
        game.join();
        vm.warp(block.timestamp + 61);
        game.startMatch();
        vm.prank(A);
        game.revokeSession(sessKey);
        vm.prank(sessKey);
        vm.expectRevert("no session");
        game.survive();
    }

    function testSessionScopedToMatch() public {
        address sessKey = address(0x5E55);
        // Match 1: A joins with session, B joins; A wins quickly.
        vm.prank(A);
        game.joinWithSession(sessKey, uint64(block.timestamp + 3600));
        vm.prank(B);
        game.join();
        uint256 m1 = game.matchId();
        vm.warp(block.timestamp + 61);
        game.startMatch();
        _survive(A);
        vm.warp(block.timestamp + 1);
        _survive(B);
        vm.warp(block.timestamp + ROUND + 1);
        game.resolveRound(); // match 1 settled
        // Match 2: A rejoins WITHOUT authorizing the key again.
        vm.prank(A);
        game.join();
        vm.prank(B);
        game.join();
        vm.warp(block.timestamp + 61);
        game.startMatch();
        assertEq(game.matchId(), m1 + 1);
        vm.prank(sessKey);
        vm.expectRevert("no session"); // key was scoped to match 1
        game.survive();
    }

    // ---- views ----

    function testGetMatchState() public {
        _joinStart(3);
        _survive(A);
        (
            address[] memory addrs,
            bool[] memory alives,
            bool[] memory checkedIns,
            ,
            ,
            uint256 roundOut,
            uint256 roundEndsAtOut,
            uint256 aliveCountOut,
            uint256 potOut,
            uint256 checkInCountOut
        ) = game.getMatchState();
        assertEq(addrs.length, 3);
        assertEq(addrs[0], A);
        assertTrue(alives[0]);
        assertTrue(checkedIns[0]);
        assertFalse(checkedIns[1]);
        assertEq(roundOut, 1);
        assertTrue(roundEndsAtOut > block.timestamp);
        assertEq(aliveCountOut, 3);
        assertEq(potOut, 3 * ENTRY);
        assertEq(checkInCountOut, 1);
    }

    // ---- VIPER bonus tests ----

    event ViperFunded(address indexed funder, uint256 amount);
    event ViperBonusCredited(uint256 indexed matchId, address indexed to, uint256 amount);
    event BonusShortfall(uint256 indexed matchId, address indexed to, uint256 needed, uint256 credited);

    /// @dev Single winner: A out-survives B, takes the full bonus.
    function test_WinCreditsViperBonus() public {
        _joinStart(2);
        _survive(A);
        vm.warp(block.timestamp + 1);
        _survive(B); // B is slower -> eliminated
        vm.warp(block.timestamp + ROUND + 1);
        game.resolveRound();
        assertEq(game.pendingViperBonus(A), game.BONUS_PER_WIN());
        assertEq(game.pendingViperBonus(B), 0, "eliminated player gets no bonus");
        assertEq(game.viperBonusOwed(), game.BONUS_PER_WIN());
    }

    /// @dev All-AFK final batch: the bonus splits equally like the prize.
    function test_AllAfkSplitCreditsViperBonusEqually() public {
        _joinStart(4);
        vm.warp(block.timestamp + ROUND + 1);
        game.resolveRound(); // nobody checked in: final batch splits
        uint256 share = game.BONUS_PER_WIN() / 4;
        for (uint256 i = 0; i < 4; i++) {
            assertEq(game.pendingViperBonus(PS[i]), share);
        }
        assertEq(game.viperBonusOwed(), share * 4);
    }

    function test_ClaimViper() public {
        _joinStart(2);
        _survive(A);
        vm.warp(block.timestamp + 1);
        _survive(B);
        vm.warp(block.timestamp + ROUND + 1);
        game.resolveRound(); // A wins
        uint256 bonus = game.BONUS_PER_WIN();
        uint256 before = viper.balanceOf(A);
        vm.prank(A);
        game.claimViper();
        assertEq(viper.balanceOf(A), before + bonus);
        assertEq(game.pendingViperBonus(A), 0);
        assertEq(game.viperBonusOwed(), 0);
        vm.prank(A);
        vm.expectRevert("nothing to claim");
        game.claimViper();
    }

    function test_FundViperEmitsAndZeroReverts() public {
        uint256 amt = 1000e18;
        viper.mint(address(this), amt);
        viper.approve(address(game), amt);
        vm.expectEmit(true, false, false, true);
        emit ViperFunded(address(this), amt);
        game.fundViper(amt);
        assertEq(viper.balanceOf(address(game)), 1_000_000e18 + amt);
        vm.expectRevert("zero amount");
        game.fundViper(0);
    }

    /// @dev An empty VIPER reserve never bricks settlement: the USDG split
    ///      still pays out, bonuses degrade to BonusShortfall events.
    function test_UnderfundedSplitStillPaysUsdg() public {
        ViperSquadGame poor = new ViperSquadGame(
            address(usdg), address(viper), ENTRY, TREASURY, REWARDS_POOL, 32, 2, ROUND, address(0), 0
        );
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(PS[i]);
            usdg.approve(address(poor), 100000);
        }
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(PS[i]);
            poor.join();
        }
        vm.warp(block.timestamp + 61);
        poor.startMatch();
        vm.recordLogs();
        vm.warp(block.timestamp + ROUND + 1);
        poor.resolveRound(); // all AFK: final batch splits equally
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 fee = (4 * ENTRY * 500) / 10000; // 20
        uint256 share = (4 * ENTRY - fee) / 4; // 95
        for (uint256 i = 0; i < 4; i++) {
            assertEq(poor.pendingWithdrawals(PS[i]), share, "USDG split still paid");
            assertEq(poor.pendingViperBonus(PS[i]), 0);
        }
        assertEq(poor.viperBonusOwed(), 0);
        assertTrue(
            _sawEvent(logs, keccak256("BonusShortfall(uint256,address,uint256,uint256)")),
            "no BonusShortfall event"
        );
    }
}
