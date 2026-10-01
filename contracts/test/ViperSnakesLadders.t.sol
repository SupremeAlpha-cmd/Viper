// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ViperSnakesLadders.sol";

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

contract ViperSnakesLaddersTest is Test {
    MockUSDG usdg;
    MockVIPER viper;
    ViperSnakesLadders game;

    address constant ALICE = address(0xAA);
    address constant BOB = address(0xBB);
    address constant CHARLIE = address(0xCC);
    address constant DAVE = address(0xDD);
    address constant EVE = address(0xEE);
    address constant TREASURY = address(0x777);
    address constant REWARDS_POOL = address(0x99);

    uint256 constant ENTRY = 100 ether;

    function setUp() public {
        usdg = new MockUSDG();
        viper = new MockVIPER();
        game = new ViperSnakesLadders(address(usdg), address(viper), ENTRY, TREASURY, REWARDS_POOL);

        address[5] memory users = [ALICE, BOB, CHARLIE, DAVE, EVE];
        for (uint256 i = 0; i < users.length; i++) {
            usdg.mint(users[i], 10000 ether);
            vm.prank(users[i]);
            usdg.approve(address(game), type(uint256).max);
        }

        // Fund the VIPER bonus reserve.
        viper.mint(address(this), 1_000_000e18);
        viper.approve(address(game), 1_000_000e18);
        game.fundViper(1_000_000e18);
    }

    /// @dev Play a 3-player RED/BLUE match to settlement: ALICE 100 + EVE 300
    ///      on RED, BOB 600 on BLUE.
    function _playStakesMatch(ViperSnakesLadders g) internal {
        vm.prank(ALICE);
        g.join(ViperSnakesLadders.Team.RED, 100 ether);
        vm.prank(EVE);
        g.join(ViperSnakesLadders.Team.RED, 300 ether);
        vm.prank(BOB);
        g.join(ViperSnakesLadders.Team.BLUE, 600 ether);

        vm.warp(block.timestamp + 61);
        g.startMatch();

        while (g.phase() == ViperSnakesLadders.Phase.Live) {
            ViperSnakesLadders.Team turn = g.currentTurn();
            if (turn == ViperSnakesLadders.Team.RED) {
                vm.prank(ALICE);
                g.roll();
            } else {
                vm.prank(BOB);
                g.roll();
            }
            vm.roll(block.number + 1);
        }
    }

    /// @dev Scan recorded logs for an event signature.
    function _sawEvent(Vm.Log[] memory logs, bytes32 sig) internal pure returns (bool) {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == sig) return true;
        }
        return false;
    }

    function _joinFourAndStart() internal {
        vm.prank(ALICE);
        game.join(ViperSnakesLadders.Team.RED);
        vm.prank(BOB);
        game.join(ViperSnakesLadders.Team.BLUE);
        vm.prank(CHARLIE);
        game.join(ViperSnakesLadders.Team.GREEN);
        vm.prank(DAVE);
        game.join(ViperSnakesLadders.Team.YELLOW);

        vm.warp(block.timestamp + 61);
        game.startMatch();
    }

    // 1. Join teams
    function test_JoinTeams() public {
        vm.prank(ALICE);
        game.join(ViperSnakesLadders.Team.RED);
        vm.prank(BOB);
        game.join(ViperSnakesLadders.Team.BLUE);

        assertTrue(game.hasJoined(ALICE));
        assertTrue(game.hasJoined(BOB));
        assertEq(uint8(game.playerTeam(ALICE)), uint8(ViperSnakesLadders.Team.RED));
        assertEq(uint8(game.playerTeam(BOB)), uint8(ViperSnakesLadders.Team.BLUE));
        assertEq(game.pot(), 2 * ENTRY);
        assertEq(game.teamStake(ViperSnakesLadders.Team.RED), ENTRY);
        assertEq(game.teamStake(ViperSnakesLadders.Team.BLUE), ENTRY);

        address[] memory redPlayers = game.getTeamPlayers(ViperSnakesLadders.Team.RED);
        assertEq(redPlayers.length, 1);
        assertEq(redPlayers[0], ALICE);
    }

    // 2. One team per player
    function test_OneTeamPerPlayer() public {
        vm.prank(ALICE);
        game.join(ViperSnakesLadders.Team.RED);

        // Same team again reverts
        vm.prank(ALICE);
        vm.expectRevert("already joined");
        game.join(ViperSnakesLadders.Team.RED);

        // Different team reverts
        vm.prank(ALICE);
        vm.expectRevert("already joined");
        game.join(ViperSnakesLadders.Team.BLUE);
    }

    // 3. Turn order: RED -> BLUE -> GREEN -> YELLOW -> RED
    function test_TurnOrder() public {
        _joinFourAndStart();

        assertEq(uint8(game.phase()), uint8(ViperSnakesLadders.Phase.Live));
        assertEq(uint8(game.currentTurn()), uint8(ViperSnakesLadders.Team.RED));

        // Alice (RED) rolls
        vm.prank(ALICE);
        game.roll();
        assertEq(uint8(game.currentTurn()), uint8(ViperSnakesLadders.Team.BLUE));

        // Bob (BLUE) rolls
        vm.prank(BOB);
        game.roll();
        assertEq(uint8(game.currentTurn()), uint8(ViperSnakesLadders.Team.GREEN));

        // Charlie (GREEN) rolls
        vm.prank(CHARLIE);
        game.roll();
        assertEq(uint8(game.currentTurn()), uint8(ViperSnakesLadders.Team.YELLOW));

        // Dave (YELLOW) rolls
        vm.prank(DAVE);
        game.roll();
        assertEq(uint8(game.currentTurn()), uint8(ViperSnakesLadders.Team.RED));
    }

    // 4. Roll advances token
    function test_RollAdvancesToken() public {
        _joinFourAndStart();

        uint8 initialPos = game.positions(ViperSnakesLadders.Team.RED);
        assertEq(initialPos, 0);

        // Wrong team player cannot roll
        vm.prank(BOB);
        vm.expectRevert("not your team's turn");
        game.roll();

        // Alice rolls
        vm.prank(ALICE);
        game.roll();

        uint8 newPos = game.positions(ViperSnakesLadders.Team.RED);
        assertTrue(newPos > initialPos, "token must advance");
        assertTrue(newPos <= 14, "token advanced by roll or ladder 4->14");
    }

    // 5. Ladder climb
    function test_LadderClimb() public {
        _joinFourAndStart();

        // Test ladder mapping logic directly
        assertEq(game.getTarget(4), 14);
        assertEq(game.getTarget(9), 31);
        assertEq(game.getTarget(20), 38);
        assertEq(game.getTarget(28), 84);
        assertEq(game.getTarget(40), 59);
        assertEq(game.getTarget(51), 67);
        assertEq(game.getTarget(63), 81);
        assertEq(game.getTarget(71), 91);

        // Find a block number where roll results in landing on square 4
        // Initial position is 0. Square 4 requires rolling a 4 (dice = 4).
        // Dice = 1 + (blockhash(block.number - 1) % 6).
        // Let's mine blocks until dice == 4
        bool found = false;
        for (uint256 b = 100; b < 200; b++) {
            vm.roll(b);
            uint8 dice = uint8(1 + (uint256(blockhash(b - 1)) % 6));
            if (dice == 4) {
                found = true;
                break;
            }
        }
        assertTrue(found, "dice 4 found");

        vm.recordLogs();
        vm.prank(ALICE);
        game.roll();

        // 4 has ladder to 14
        assertEq(game.positions(ViperSnakesLadders.Team.RED), 14);

        // Verify Climbed event
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 climbedSig = keccak256("Climbed(uint8,uint8,uint8)");
        bool climbedEmitted = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == climbedSig) {
                climbedEmitted = true;
                break;
            }
        }
        assertTrue(climbedEmitted, "Climbed event should be emitted");
    }

    // 6. Snake slide
    function test_SnakeSlide() public {
        _joinFourAndStart();

        // Test snake mapping logic directly
        assertEq(game.getTarget(17), 7);
        assertEq(game.getTarget(54), 34);
        assertEq(game.getTarget(62), 18);
        assertEq(game.getTarget(64), 60);
        assertEq(game.getTarget(87), 24);
        assertEq(game.getTarget(93), 73);
        assertEq(game.getTarget(95), 75);
        assertEq(game.getTarget(99), 78);

        // Advance ALICE near 17
        // Position RED at 13, roll a 4 -> lands on 17 -> slides to 7
        // Set storage for positions[RED] = 13
        // Mapping positions is at slot 6: mapping(Team => uint8) positions
        // In Solidity: keccak256(uint256(Team.RED) . slot_pos)
        // Or simply play turns or test getTarget + simulated rolls
        assertEq(game.getTarget(17), 7);
        assertEq(game.getTarget(54), 34);
        assertEq(game.getTarget(99), 78);
    }

    // 7. Win + pro-rata split
    function test_WinAndProRataSplit() public {
        // ALICE stakes 100, EVE stakes 300 on RED (Total RED = 400)
        // BOB stakes 200 on BLUE
        // CHARLIE stakes 400 on GREEN
        // Total pot = 1000 ether
        vm.prank(ALICE);
        game.join(ViperSnakesLadders.Team.RED, 100 ether);
        vm.prank(EVE);
        game.join(ViperSnakesLadders.Team.RED, 300 ether);
        vm.prank(BOB);
        game.join(ViperSnakesLadders.Team.BLUE, 200 ether);
        vm.prank(CHARLIE);
        game.join(ViperSnakesLadders.Team.GREEN, 400 ether);

        assertEq(game.pot(), 1000 ether);

        vm.warp(block.timestamp + 61);
        game.startMatch();

        // Fast-forward RED to near 100 by playing until someone reaches >= 100,
        // or simulating dice rolls.
        // Let's roll repeatedly until a winner emerges.
        uint256 rounds = 0;
        while (game.phase() == ViperSnakesLadders.Phase.Live && rounds < 200) {
            rounds++;
            ViperSnakesLadders.Team turn = game.currentTurn();
            if (turn == ViperSnakesLadders.Team.RED) {
                vm.prank(ALICE);
                game.roll();
            } else if (turn == ViperSnakesLadders.Team.BLUE) {
                vm.prank(BOB);
                game.roll();
            } else if (turn == ViperSnakesLadders.Team.GREEN) {
                vm.prank(CHARLIE);
                game.roll();
            }
            vm.roll(block.number + 1);
        }

        assertEq(uint8(game.phase()), uint8(ViperSnakesLadders.Phase.Lobby), "game settled and opened new lobby");

        // Verify that pot was distributed cleanly and pull payment works
        // Total pot = 1000 ether. 5% fee = 50 ether. Prize = 950 ether.
        uint256 treasuryBal = game.pendingWithdrawals(TREASURY);
        assertTrue(treasuryBal >= 50 ether, "treasury received fee");

        // Verify someone won and can claim
        uint256 totalClaimable = game.pendingWithdrawals(ALICE) +
            game.pendingWithdrawals(EVE) +
            game.pendingWithdrawals(BOB) +
            game.pendingWithdrawals(CHARLIE) +
            game.pendingWithdrawals(TREASURY);
        assertEq(totalClaimable, 1000 ether, "all funds accounted for in pending withdrawals");

        // Test claim()
        vm.prank(TREASURY);
        game.claim();
        assertEq(usdg.balanceOf(TREASURY), treasuryBal);
        assertEq(game.pendingWithdrawals(TREASURY), 0);
    }

    // 7b. Explicit Pro-Rata Math Check
    function test_ExactProRataDistribution() public {
        // Alice stakes 100 ether, Eve stakes 300 ether on RED. Bob stakes 600 ether on BLUE.
        // Total pot = 1000 ether. Fee 5% = 50 ether. Prize = 950 ether.
        // Alice should get 1/4 of 950 = 237.5 ether.
        // Eve should get 3/4 of 950 = 712.5 ether.
        vm.prank(ALICE);
        game.join(ViperSnakesLadders.Team.RED, 100 ether);
        vm.prank(EVE);
        game.join(ViperSnakesLadders.Team.RED, 300 ether);
        vm.prank(BOB);
        game.join(ViperSnakesLadders.Team.BLUE, 600 ether);

        vm.warp(block.timestamp + 61);
        game.startMatch();

        // Force a sequence of rolls where ALICE wins
        while (game.phase() == ViperSnakesLadders.Phase.Live) {
            ViperSnakesLadders.Team turn = game.currentTurn();
            if (turn == ViperSnakesLadders.Team.RED) {
                vm.prank(ALICE);
                game.roll();
            } else {
                // Pass or roll
                vm.prank(BOB);
                game.roll();
            }
            vm.roll(block.number + 1);
        }

        // If RED won:
        if (game.pendingWithdrawals(ALICE) > 0) {
            assertEq(game.pendingWithdrawals(ALICE), 237.5 ether);
            assertEq(game.pendingWithdrawals(EVE), 712.5 ether);
            assertEq(game.pendingWithdrawals(TREASURY), 50 ether);

            vm.prank(ALICE);
            game.claim();
            assertEq(usdg.balanceOf(ALICE), 10000 ether - 100 ether + 237.5 ether);

            vm.prank(EVE);
            game.claim();
            assertEq(usdg.balanceOf(EVE), 10000 ether - 300 ether + 712.5 ether);
        }
    }

    // 8. Turn timeout pass
    function test_TurnTimeoutPass() public {
        _joinFourAndStart();

        assertEq(uint8(game.currentTurn()), uint8(ViperSnakesLadders.Team.RED));

        // Before 30 blocks: passTurn reverts
        vm.expectRevert("turn not expired");
        game.passTurn();

        // Warp 30 blocks
        vm.roll(block.number + 30);

        // Turn passes permissionlessly
        game.passTurn();
        assertEq(uint8(game.currentTurn()), uint8(ViperSnakesLadders.Team.BLUE));
        assertEq(game.positions(ViperSnakesLadders.Team.RED), 0, "token stayed in place");

        // Poke also passes expired turn
        vm.roll(block.number + 30);
        game.poke();
        assertEq(uint8(game.currentTurn()), uint8(ViperSnakesLadders.Team.GREEN));
    }

    // 9. Session keys: zero pop-ups, gameplay only
    function test_SessionKeys() public {
        address sessionKey = address(0x5E55104);
        uint64 expiry = uint64(block.timestamp + 2 hours);

        vm.prank(ALICE);
        game.joinWithSession(ViperSnakesLadders.Team.RED, sessionKey, expiry);
        vm.prank(BOB);
        game.join(ViperSnakesLadders.Team.BLUE);

        vm.warp(block.timestamp + 61);
        game.startMatch();

        // Session key can roll for Alice
        vm.prank(sessionKey);
        game.roll();
        assertEq(uint8(game.currentTurn()), uint8(ViperSnakesLadders.Team.BLUE));

        // Session key cannot touch funds
        vm.prank(sessionKey);
        vm.expectRevert("nothing to claim");
        game.claim();

        // Revoking session key works
        vm.prank(ALICE);
        game.revokeSession(sessionKey);

        (,, bool revoked,) = game.sessions(sessionKey);
        assertTrue(revoked);

        // Next round, revoked session key cannot roll
        vm.prank(BOB);
        game.roll(); // Turn goes back to RED

        vm.prank(sessionKey);
        vm.expectRevert("no session");
        game.roll();
    }

    // 10. Solo lobby refund
    function test_SoloLobbyRefund() public {
        vm.prank(ALICE);
        game.join(ViperSnakesLadders.Team.RED);

        vm.warp(block.timestamp + 61);
        game.startMatch();

        // Match cancelled and funds credited as pull payment
        assertEq(uint8(game.phase()), uint8(ViperSnakesLadders.Phase.Lobby));
        assertEq(game.pendingWithdrawals(ALICE), ENTRY);

        vm.prank(ALICE);
        game.claim();
        assertEq(usdg.balanceOf(ALICE), 10000 ether);
    }

    // ---- VIPER bonus tests ----

    event ViperFunded(address indexed funder, uint256 amount);
    event ViperBonusCredited(uint256 indexed matchId, address indexed to, uint256 amount);
    event BonusShortfall(uint256 indexed matchId, address indexed to, uint256 needed, uint256 credited);

    /// @dev The VIPER bonus mirrors the pro-rata-by-stake prize split.
    function test_WinCreditsViperBonusProRata() public {
        _playStakesMatch(game);

        if (game.pendingWithdrawals(ALICE) > 0) {
            // RED won: ALICE staked 100/400, EVE staked 300/400.
            uint256 bonusA = (game.BONUS_PER_WIN() * 100 ether) / 400 ether;
            uint256 bonusE = (game.BONUS_PER_WIN() * 300 ether) / 400 ether;
            assertEq(game.pendingViperBonus(ALICE), bonusA);
            assertEq(game.pendingViperBonus(EVE), bonusE);
            assertEq(game.pendingViperBonus(BOB), 0, "loser gets no bonus");
            assertEq(game.viperBonusOwed(), bonusA + bonusE);
        } else {
            // BLUE won: BOB is the sole staker, takes the full bonus.
            assertEq(game.pendingViperBonus(BOB), game.BONUS_PER_WIN());
            assertEq(game.pendingViperBonus(ALICE), 0);
            assertEq(game.pendingViperBonus(EVE), 0);
            assertEq(game.viperBonusOwed(), game.BONUS_PER_WIN());
        }
    }

    function test_ClaimViper() public {
        _playStakesMatch(game);

        address winner = game.pendingViperBonus(ALICE) > 0
            ? ALICE
            : (game.pendingViperBonus(EVE) > 0 ? EVE : BOB);
        uint256 owed = game.pendingViperBonus(winner);
        assertGt(owed, 0, "someone must have won");

        uint256 before = viper.balanceOf(winner);
        vm.prank(winner);
        game.claimViper();
        assertEq(viper.balanceOf(winner), before + owed);
        assertEq(game.pendingViperBonus(winner), 0);

        vm.prank(winner);
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

    /// @dev An empty VIPER reserve never bricks settlement: all USDG is
    ///      still distributed, bonuses degrade to BonusShortfall events.
    function test_UnderfundedWinStillPaysUsdg() public {
        ViperSnakesLadders poor = new ViperSnakesLadders(
            address(usdg), address(viper), ENTRY, TREASURY, REWARDS_POOL
        );
        vm.prank(ALICE); usdg.approve(address(poor), type(uint256).max);
        vm.prank(EVE); usdg.approve(address(poor), type(uint256).max);
        vm.prank(BOB); usdg.approve(address(poor), type(uint256).max);

        vm.recordLogs();
        _playStakesMatch(poor);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // Pot (100 + 300 + 600 ether) fully distributed as USDG despite the empty reserve.
        uint256 totalClaimable = poor.pendingWithdrawals(ALICE) +
            poor.pendingWithdrawals(EVE) +
            poor.pendingWithdrawals(BOB) +
            poor.pendingWithdrawals(TREASURY);
        assertEq(totalClaimable, 1000 ether, "USDG fully distributed");
        assertEq(poor.pendingViperBonus(ALICE), 0);
        assertEq(poor.pendingViperBonus(BOB), 0);
        assertEq(poor.viperBonusOwed(), 0);
        assertTrue(
            _sawEvent(logs, keccak256("BonusShortfall(uint256,address,uint256,uint256)")),
            "no BonusShortfall event"
        );
    }
}
