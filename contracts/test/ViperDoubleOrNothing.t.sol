// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ViperDoubleOrNothing.sol";

contract MockVIPER is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
    }

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

/// @notice 6-decimal mock USDG used as the games' stake/bankroll token.
contract MockUSDG is IERC20 {
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
    }

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

contract ViperDoubleOrNothingTest is Test {
    MockUSDG usdg;
    MockVIPER viper;
    ViperDoubleOrNothing game;

    address constant ALICE = address(0xAA);
    address constant BOB = address(0xBB);
    address constant TREASURY = address(0x77);
    address constant REWARDS_POOL = address(0x99);
    address constant SESSION_KEY = address(0x55);

    uint256 constant INITIAL_BANKROLL = 1000 * 1e18; // 1000 USDG (raw units)
    uint256 constant STAKE = 50 * 1e18;              // 50 USDG (5% of bankroll <= 10%)

    event FlipCommitted(address indexed player, bytes32 commitment, uint256 stake);
    event FlipRevealed(address indexed player, bool won, uint256 payout);
    event BankrollFunded(address indexed funder, uint256 amount);
    event Refunded(address indexed player, uint256 amount);
    event ViperFunded(address indexed funder, uint256 amount);
    event ViperBonusCredited(address indexed to, uint256 amount);
    event BonusShortfall(address indexed to, uint256 needed, uint256 credited);

    function setUp() public {
        usdg = new MockUSDG();
        viper = new MockVIPER();
        game = new ViperDoubleOrNothing(address(usdg), address(viper), TREASURY, REWARDS_POOL);

        // Fund bankroll (USDG) from deployer
        usdg.mint(address(this), INITIAL_BANKROLL);
        usdg.approve(address(game), INITIAL_BANKROLL);
        game.fund(INITIAL_BANKROLL);

        // Fund the VIPER bonus reserve
        viper.mint(address(this), 1_000_000e18);
        viper.approve(address(game), 1_000_000e18);
        game.fundViper(1_000_000e18);

        // Mint and approve USDG for ALICE and BOB
        usdg.mint(ALICE, 500 * 1e18);
        usdg.mint(BOB, 500 * 1e18);

        vm.prank(ALICE);
        usdg.approve(address(game), type(uint256).max);

        vm.prank(BOB);
        usdg.approve(address(game), type(uint256).max);
    }

    /// @dev Commit + reveal a winning flip for `player` on game `g`.
    function _winFlip(ViperDoubleOrNothing g, address player, uint256 stake) internal {
        bytes32 secret = bytes32(uint256(777));
        uint256 cBlock = block.number;

        // Predict coin outcome at next block
        vm.roll(cBlock + 1);
        vm.warp(block.timestamp + 2);
        uint8 coin = g.getCoin(player, secret, cBlock);

        // Rewind and commit winning choice
        vm.roll(cBlock);
        vm.warp(block.timestamp - 2);
        vm.prank(player);
        g.flipCommit(stake, keccak256(abi.encodePacked(coin, secret)));

        // Advance to reveal block
        vm.roll(cBlock + 1);
        vm.warp(block.timestamp + 2);
        vm.prank(player);
        g.flipReveal(coin, secret);
    }

    /// @dev Scan recorded logs for an event signature.
    function _sawEvent(Vm.Log[] memory logs, bytes32 sig) internal pure returns (bool) {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == sig) return true;
        }
        return false;
    }

    // ---- Bankroll Tests ----

    function test_InitialBankroll() public view {
        assertEq(game.bankroll(), INITIAL_BANKROLL);
        assertEq(game.maxStake(), INITIAL_BANKROLL / 10);
    }

    function test_FundBankroll() public {
        uint256 fundAmt = 200 * 1e18;
        usdg.mint(address(this), fundAmt);
        usdg.approve(address(game), fundAmt);

        vm.expectEmit(true, false, false, true);
        emit BankrollFunded(address(this), fundAmt);

        game.fund(fundAmt);
        assertEq(game.bankroll(), INITIAL_BANKROLL + fundAmt);
        assertEq(usdg.balanceOf(address(game)), INITIAL_BANKROLL + fundAmt);
    }

    function test_FundZeroReverts() public {
        vm.expectRevert("zero amount");
        game.fund(0);
    }

    // ---- Max Stake Cap Tests ----

    function test_MaxStakeCapReverts() public {
        uint256 maxAllowed = game.maxStake(); // 100 VIPER
        uint256 overMax = maxAllowed + 1;

        bytes32 commitment = keccak256(abi.encodePacked(uint8(0), bytes32(uint256(1))));

        vm.prank(ALICE);
        vm.expectRevert("stake exceeds max");
        game.flipCommit(overMax, commitment);
    }

    function test_ZeroStakeReverts() public {
        bytes32 commitment = keccak256(abi.encodePacked(uint8(0), bytes32(uint256(1))));

        vm.prank(ALICE);
        vm.expectRevert("zero stake");
        game.flipCommit(0, commitment);
    }

    // ---- Commit & Double-Commit Tests ----

    function test_CommitSuccess() public {
        bytes32 secret = bytes32(uint256(999));
        bytes32 commitment = keccak256(abi.encodePacked(uint8(0), secret));

        vm.expectEmit(true, false, false, true);
        emit FlipCommitted(ALICE, commitment, STAKE);

        vm.prank(ALICE);
        game.flipCommit(STAKE, commitment);

        (bytes32 comm, uint256 stk, uint256 blk, bool act) = game.getFlip(ALICE);
        assertEq(comm, commitment);
        assertEq(stk, STAKE);
        assertEq(blk, block.number);
        assertTrue(act);

        // Tokens pulled from ALICE
        assertEq(usdg.balanceOf(ALICE), 500 * 1e18 - STAKE);
    }

    function test_DoubleCommitReverts() public {
        bytes32 commitment1 = keccak256(abi.encodePacked(uint8(0), bytes32(uint256(1))));
        bytes32 commitment2 = keccak256(abi.encodePacked(uint8(1), bytes32(uint256(2))));

        vm.startPrank(ALICE);
        game.flipCommit(STAKE, commitment1);

        vm.expectRevert("flip active");
        game.flipCommit(STAKE, commitment2);
        vm.stopPrank();
    }

    // ---- Win Path Tests ----

    function test_WinPath() public {
        bytes32 secret = bytes32(uint256(777));
        uint256 cBlock = block.number;

        // Predict coin outcome at next block
        vm.roll(cBlock + 1);
        vm.warp(block.timestamp + 2);
        uint8 coin = game.getCoin(ALICE, secret, cBlock);

        // Rewind and commit winning choice
        vm.roll(cBlock);
        vm.warp(block.timestamp - 2);
        bytes32 commitment = keccak256(abi.encodePacked(coin, secret));

        vm.prank(ALICE);
        game.flipCommit(STAKE, commitment);

        // Advance to reveal block
        vm.roll(cBlock + 1);
        vm.warp(block.timestamp + 2);

        // 1.9x payout = 2x - 5% fee = 2 * STAKE - 0.1 * STAKE = 1.9 * STAKE
        uint256 gross = STAKE * 2;
        uint256 expectedFee = (gross * 500) / 10000;
        uint256 expectedPayout = gross - expectedFee;

        assertEq(expectedPayout, (STAKE * 19) / 10);
        assertEq(expectedFee, STAKE / 10);

        uint256 bankrollBefore = game.bankroll();

        vm.expectEmit(true, false, false, true);
        emit FlipRevealed(ALICE, true, expectedPayout);

        vm.prank(ALICE);
        game.flipReveal(coin, secret);

        // Flip is cleared
        (, , , bool active) = game.getFlip(ALICE);
        assertFalse(active);

        // Bankroll decreased by STAKE
        assertEq(game.bankroll(), bankrollBefore - STAKE);

        // Pull-payment credited
        assertEq(game.pendingWithdrawals(ALICE), expectedPayout);
        assertEq(game.pendingWithdrawals(TREASURY), expectedFee);

        // ALICE claims winnings
        uint256 aliceBalBefore = usdg.balanceOf(ALICE);
        vm.prank(ALICE);
        game.claim();
        assertEq(usdg.balanceOf(ALICE), aliceBalBefore + expectedPayout);
        assertEq(game.pendingWithdrawals(ALICE), 0);
    }

    // ---- Lose Path Tests ----

    function test_LosePath() public {
        bytes32 secret = bytes32(uint256(888));
        uint256 cBlock = block.number;

        // Predict coin outcome at next block
        vm.roll(cBlock + 1);
        vm.warp(block.timestamp + 2);
        uint8 coin = game.getCoin(ALICE, secret, cBlock);
        uint8 losingChoice = 1 - coin; // Pick the opposite side

        // Rewind and commit losing choice
        vm.roll(cBlock);
        vm.warp(block.timestamp - 2);
        bytes32 commitment = keccak256(abi.encodePacked(losingChoice, secret));

        vm.prank(ALICE);
        game.flipCommit(STAKE, commitment);

        // Advance to reveal block
        vm.roll(cBlock + 1);
        vm.warp(block.timestamp + 2);

        uint256 bankrollBefore = game.bankroll();

        vm.expectEmit(true, false, false, true);
        emit FlipRevealed(ALICE, false, 0);

        vm.prank(ALICE);
        game.flipReveal(losingChoice, secret);

        // Flip is cleared
        (, , , bool active) = game.getFlip(ALICE);
        assertFalse(active);

        // Bankroll increased by STAKE (stake goes to bankroll)
        assertEq(game.bankroll(), bankrollBefore + STAKE);

        // No pending withdrawals
        assertEq(game.pendingWithdrawals(ALICE), 0);
    }

    // ---- Bankroll Accounting Invariant Test ----

    function test_BankrollAccounting() public {
        // Run a win and a loss, verifying bankroll + pendingWithdrawals == contract balance
        bytes32 secretA = bytes32(uint256(101));
        bytes32 secretB = bytes32(uint256(202));
        uint256 cBlock = block.number;

        // Determine coin for ALICE
        vm.roll(cBlock + 1);
        vm.warp(block.timestamp + 2);
        uint8 coinA = game.getCoin(ALICE, secretA, cBlock);
        uint8 coinB = game.getCoin(BOB, secretB, cBlock);

        // ALICE will win, BOB will lose
        vm.roll(cBlock);
        vm.warp(block.timestamp - 2);

        vm.prank(ALICE);
        game.flipCommit(STAKE, keccak256(abi.encodePacked(coinA, secretA)));

        vm.prank(BOB);
        game.flipCommit(STAKE, keccak256(abi.encodePacked(1 - coinB, secretB)));

        // Reveal both
        vm.roll(cBlock + 1);
        vm.warp(block.timestamp + 2);

        vm.prank(ALICE);
        game.flipReveal(coinA, secretA); // Win

        vm.prank(BOB);
        game.flipReveal(1 - coinB, secretB); // Lose

        // Contract solvency:
        uint256 totalPending = game.pendingWithdrawals(ALICE) +
            game.pendingWithdrawals(BOB) +
            game.pendingWithdrawals(TREASURY);
        uint256 expectedBankroll = INITIAL_BANKROLL - STAKE + STAKE; // Net zero change
        assertEq(game.bankroll(), expectedBankroll);
        assertEq(usdg.balanceOf(address(game)), game.bankroll() + totalPending);
    }

    // ---- Double-Reveal Test ----

    function test_DoubleRevealReverts() public {
        bytes32 secret = bytes32(uint256(555));
        uint256 cBlock = block.number;

        vm.roll(cBlock + 1);
        vm.warp(block.timestamp + 2);
        uint8 coin = game.getCoin(ALICE, secret, cBlock);

        vm.roll(cBlock);
        vm.warp(block.timestamp - 2);
        vm.prank(ALICE);
        game.flipCommit(STAKE, keccak256(abi.encodePacked(coin, secret)));

        vm.roll(cBlock + 1);
        vm.warp(block.timestamp + 2);

        vm.prank(ALICE);
        game.flipReveal(coin, secret); // First reveal succeeds

        // Second reveal must revert
        vm.prank(ALICE);
        vm.expectRevert("no active flip");
        game.flipReveal(coin, secret);
    }

    // ---- Reveal Window & Timeout Refund Tests ----

    function test_RevealExpiredReverts() public {
        bytes32 secret = bytes32(uint256(123));
        uint8 choice = 0;
        bytes32 commitment = keccak256(abi.encodePacked(choice, secret));

        vm.prank(ALICE);
        game.flipCommit(STAKE, commitment);

        // Advance 51 blocks (> 50 block reveal window)
        vm.roll(block.number + 51);

        vm.prank(ALICE);
        vm.expectRevert("reveal window expired");
        game.flipReveal(choice, secret);
    }

    function test_RefundBeforeTimeoutReverts() public {
        bytes32 commitment = keccak256(abi.encodePacked(uint8(0), bytes32(uint256(1))));

        vm.prank(ALICE);
        game.flipCommit(STAKE, commitment);

        // Only 30 blocks elapsed
        vm.roll(block.number + 30);

        vm.prank(ALICE);
        vm.expectRevert("reveal window active");
        game.refund();
    }

    function test_RevealTimeoutRefund() public {
        bytes32 commitment = keccak256(abi.encodePacked(uint8(0), bytes32(uint256(1))));

        vm.prank(ALICE);
        game.flipCommit(STAKE, commitment);

        uint256 bankrollBefore = game.bankroll();

        // Advance 51 blocks past commit
        vm.roll(block.number + 51);

        vm.expectEmit(true, false, false, true);
        emit Refunded(ALICE, STAKE);

        vm.prank(ALICE);
        game.refund();

        // Flip is cleared
        (, , , bool active) = game.getFlip(ALICE);
        assertFalse(active);

        // Stake credited to pendingWithdrawals
        assertEq(game.pendingWithdrawals(ALICE), STAKE);

        // Bankroll unchanged
        assertEq(game.bankroll(), bankrollBefore);

        // Can commit again after refund
        bytes32 newCommitment = keccak256(abi.encodePacked(uint8(1), bytes32(uint256(2))));
        vm.prank(ALICE);
        game.flipCommit(STAKE, newCommitment);
        (, , , bool newActive) = game.getFlip(ALICE);
        assertTrue(newActive);
    }

    // ---- Invalid Secret / Choice Tests ----

    function test_InvalidSecretReverts() public {
        bytes32 secret = bytes32(uint256(111));
        bytes32 wrongSecret = bytes32(uint256(222));
        bytes32 commitment = keccak256(abi.encodePacked(uint8(0), secret));

        vm.prank(ALICE);
        game.flipCommit(STAKE, commitment);

        vm.roll(block.number + 1);

        vm.prank(ALICE);
        vm.expectRevert("invalid secret");
        game.flipReveal(0, wrongSecret);
    }

    function test_InvalidChoiceReverts() public {
        bytes32 secret = bytes32(uint256(111));
        bytes32 commitment = keccak256(abi.encodePacked(uint8(2), secret));

        vm.prank(ALICE);
        game.flipCommit(STAKE, commitment);

        vm.roll(block.number + 1);

        vm.prank(ALICE);
        vm.expectRevert("invalid choice");
        game.flipReveal(2, secret);
    }

    // ---- Session Key Tests ----

    function test_SessionKeyCommitAndReveal() public {
        uint64 expiry = uint64(block.timestamp + 2 hours);

        // ALICE authorizes SESSION_KEY
        vm.prank(ALICE);
        game.authorizeSession(SESSION_KEY, expiry);
        assertTrue(game.isSessionValid(SESSION_KEY));

        bytes32 secret = bytes32(uint256(333));
        uint256 cBlock = block.number;

        vm.roll(cBlock + 1);
        vm.warp(block.timestamp + 2);
        uint8 coin = game.getCoin(ALICE, secret, cBlock);

        vm.roll(cBlock);
        vm.warp(block.timestamp - 2);

        // SESSION_KEY calls flipCommit on behalf of ALICE
        vm.prank(SESSION_KEY);
        game.flipCommit(STAKE, keccak256(abi.encodePacked(coin, secret)));

        (, uint256 stk, , bool act) = game.getFlip(ALICE);
        assertEq(stk, STAKE);
        assertTrue(act);

        // Advance and reveal via SESSION_KEY
        vm.roll(cBlock + 1);
        vm.warp(block.timestamp + 2);

        vm.prank(SESSION_KEY);
        game.flipReveal(coin, secret);

        // Winnings credited to ALICE, NOT to SESSION_KEY
        uint256 expectedPayout = (STAKE * 19) / 10;
        assertEq(game.pendingWithdrawals(ALICE), expectedPayout);
        assertEq(game.pendingWithdrawals(SESSION_KEY), 0);

        // Session key CANNOT claim funds
        vm.prank(SESSION_KEY);
        vm.expectRevert("nothing to claim");
        game.claim();

        // ALICE claims
        vm.prank(ALICE);
        game.claim();
        assertEq(game.pendingWithdrawals(ALICE), 0);
    }

    function test_SessionRevocation() public {
        uint64 expiry = uint64(block.timestamp + 2 hours);

        vm.prank(ALICE);
        game.authorizeSession(SESSION_KEY, expiry);

        // ALICE revokes
        vm.prank(ALICE);
        game.revokeSession(SESSION_KEY);
        assertFalse(game.isSessionValid(SESSION_KEY));

        bytes32 commitment = keccak256(abi.encodePacked(uint8(0), bytes32(uint256(1))));

        vm.prank(SESSION_KEY);
        vm.expectRevert("session revoked");
        game.flipCommit(STAKE, commitment);
    }

    function test_SessionExpiry() public {
        uint64 expiry = uint64(block.timestamp + 100);

        vm.prank(ALICE);
        game.authorizeSession(SESSION_KEY, expiry);

        // Fast-forward past expiry
        vm.warp(block.timestamp + 101);
        assertFalse(game.isSessionValid(SESSION_KEY));

        bytes32 commitment = keccak256(abi.encodePacked(uint8(0), bytes32(uint256(1))));

        vm.prank(SESSION_KEY);
        vm.expectRevert("session expired");
        game.flipCommit(STAKE, commitment);
    }

    // ---- VIPER bonus tests ----

    function test_WinCreditsViperBonus() public {
        _winFlip(game, ALICE, STAKE);
        assertEq(game.pendingViperBonus(ALICE), game.BONUS_PER_WIN());
        assertEq(game.viperBonusOwed(), game.BONUS_PER_WIN());
    }

    function test_ClaimViper() public {
        _winFlip(game, ALICE, STAKE);
        uint256 bonus = game.BONUS_PER_WIN();

        vm.prank(ALICE);
        game.claimViper();
        assertEq(viper.balanceOf(ALICE), bonus);
        assertEq(game.pendingViperBonus(ALICE), 0);
        assertEq(game.viperBonusOwed(), 0);

        // Second claim reverts.
        vm.prank(ALICE);
        vm.expectRevert("nothing to claim");
        game.claimViper();
    }

    function test_ClaimViperNothingReverts() public {
        vm.prank(BOB);
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

    function test_LoseCreditsNoViperBonus() public {
        bytes32 secret = bytes32(uint256(888));
        uint256 cBlock = block.number;

        vm.roll(cBlock + 1);
        vm.warp(block.timestamp + 2);
        uint8 coin = game.getCoin(ALICE, secret, cBlock);
        uint8 losingChoice = 1 - coin;

        vm.roll(cBlock);
        vm.warp(block.timestamp - 2);
        vm.prank(ALICE);
        game.flipCommit(STAKE, keccak256(abi.encodePacked(losingChoice, secret)));

        vm.roll(cBlock + 1);
        vm.warp(block.timestamp + 2);
        vm.prank(ALICE);
        game.flipReveal(losingChoice, secret);

        assertEq(game.pendingViperBonus(ALICE), 0);
        assertEq(game.viperBonusOwed(), 0);
    }

    /// @dev An empty VIPER reserve must never brick the game: the USDG prize
    ///      is still credited and claimable, the bonus just degrades to a
    ///      BonusShortfall event.
    function test_WinDoesNotBrickWhenReserveEmpty() public {
        ViperDoubleOrNothing game2 = new ViperDoubleOrNothing(
            address(usdg), address(viper), TREASURY, REWARDS_POOL
        );
        // USDG bankroll only — no VIPER funding.
        usdg.mint(address(this), INITIAL_BANKROLL);
        usdg.approve(address(game2), INITIAL_BANKROLL);
        game2.fund(INITIAL_BANKROLL);
        vm.prank(ALICE);
        usdg.approve(address(game2), type(uint256).max);

        uint256 expectedPayout = (STAKE * 19) / 10;

        vm.recordLogs();
        _winFlip(game2, ALICE, STAKE);

        // USDG prize still credited and claimable.
        assertEq(game2.pendingWithdrawals(ALICE), expectedPayout);
        uint256 balBefore = usdg.balanceOf(ALICE);
        vm.prank(ALICE);
        game2.claim();
        assertEq(usdg.balanceOf(ALICE), balBefore + expectedPayout);

        // No VIPER credited, and a BonusShortfall was emitted.
        assertEq(game2.pendingViperBonus(ALICE), 0);
        assertEq(game2.viperBonusOwed(), 0);
        assertTrue(
            _sawEvent(vm.getRecordedLogs(), keccak256("BonusShortfall(address,uint256,uint256)")),
            "no BonusShortfall event"
        );
    }
}
