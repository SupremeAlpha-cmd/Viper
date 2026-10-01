// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ViperChess.sol";

contract ChessMockToken {
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

contract ViperChessTest is Test {
    ChessMockToken token;
    ViperChess game;

    address constant A = address(0xA);
    address constant B = address(0xB);
    address constant C = address(0xC);
    address constant D = address(0xD);
    address constant TREASURY = address(0x77);
    uint256 constant ENTRY = 100;
    uint256 constant MOVE_TIMEOUT = 300;
    uint256 constant MAX_PLYS = 300;

    // Squares (rank*8+file, rank 0 = White home).
    uint8 constant E2 = 12; uint8 constant E4 = 28;
    uint8 constant E7 = 52; uint8 constant E5 = 36;
    uint8 constant D2 = 11; uint8 constant D7 = 51; uint8 constant D5 = 35; uint8 constant D6 = 43;
    uint8 constant D8 = 59; uint8 constant E8 = 60;
    uint8 constant F2 = 13; uint8 constant F3 = 21; uint8 constant F7 = 53;
    uint8 constant G2 = 14; uint8 constant G4 = 30; uint8 constant G1 = 6;
    uint8 constant H5 = 39; uint8 constant H4 = 31;
    uint8 constant B1 = 1;  uint8 constant C3 = 18;
    uint8 constant B8 = 57; uint8 constant C6 = 42;
    uint8 constant G8 = 62; uint8 constant F6 = 45;
    uint8 constant F1 = 5;  uint8 constant C4 = 26;
    uint8 constant F8 = 61; uint8 constant C5 = 34;
    uint8 constant A2 = 8;  uint8 constant A4 = 24; uint8 constant A5 = 32;
    uint8 constant A6 = 40; uint8 constant B7 = 49; uint8 constant A8 = 56;
    uint8 constant D1 = 3;

    // Piece codes.
    uint8 constant WP = 1; uint8 constant WN = 2; uint8 constant WB = 3;
    uint8 constant WR = 4; uint8 constant WQ = 5; uint8 constant WK = 6;
    uint8 constant BP = 7; uint8 constant BN = 8; uint8 constant BB = 9;
    uint8 constant BR = 10; uint8 constant BQ = 11; uint8 constant BK = 12;

    function setUp() public {
        token = new ChessMockToken();
        game = new ViperChess(address(token), ENTRY, TREASURY, MOVE_TIMEOUT, MAX_PLYS);
        vm.warp(100000);
        address[4] memory ps = [A, B, C, D];
        for (uint256 i = 0; i < 4; i++) {
            token.mint(ps[i], 10000);
            vm.prank(ps[i]);
            token.approve(address(game), 10000);
        }
    }

    // ---- helpers ----

    /// @dev Join `nw` white / `nb` black (A,B,C,D in order), warp past the
    ///      60s lobby, start the match.
    function _joinStart(uint256 nw, uint256 nb) internal {
        address[4] memory ps = [A, B, C, D];
        uint256 i = 0;
        for (uint256 w = 0; w < nw; w++) {
            vm.prank(ps[i++]);
            game.join(0);
        }
        for (uint256 bl = 0; bl < nb; bl++) {
            vm.prank(ps[i++]);
            game.join(1);
        }
        vm.warp(block.timestamp + 61);
        game.startMatch();
    }

    function _mv(address p, uint8 from, uint8 to) internal {
        vm.prank(p);
        game.move(from, to, 0);
    }

    function _mvPromo(address p, uint8 from, uint8 to, uint8 promo) internal {
        vm.prank(p);
        game.move(from, to, promo);
    }

    // ---- constructor / lobby ----

    function testConstructorParams() public view {
        assertEq(address(game.stakeToken()), address(token));
        assertEq(game.entryFee(), ENTRY);
        assertEq(game.treasury(), TREASURY);
        assertEq(game.MOVE_TIMEOUT(), MOVE_TIMEOUT);
        assertEq(game.MAX_PLYS(), MAX_PLYS);
        assertEq(game.FEE_BPS(), 500);
    }

    function testJoinSidesAndPot() public {
        vm.prank(A); game.join(0);
        vm.prank(B); game.join(1);
        assertEq(game.playerCount(), 2);
        assertEq(game.pot(), 2 * ENTRY);
        assertEq(game.sideOf(A), 0);
        assertEq(game.sideOf(B), 1);
        assertEq(token.balanceOf(address(game)), 2 * ENTRY);
    }

    function testJoinBadSideReverts() public {
        vm.prank(A);
        vm.expectRevert("bad side");
        game.join(2);
    }

    function testJoinTwiceReverts() public {
        vm.prank(A); game.join(0);
        vm.prank(A);
        vm.expectRevert("already joined");
        game.join(1);
    }

    function testStartMatchTooEarlyReverts() public {
        vm.prank(A); game.join(0);
        vm.prank(B); game.join(1);
        vm.expectRevert("lobby still open");
        game.startMatch();
    }

    function testStartMatchRefundsWhenOneSideEmpty() public {
        vm.prank(A); game.join(0);
        vm.warp(block.timestamp + 61);
        game.startMatch();
        // Everyone refunded via pull payments; fresh lobby opens.
        assertEq(game.pendingWithdrawals(A), ENTRY);
        assertEq(uint8(game.phase()), 0); // Lobby
        assertEq(game.matchId(), 2);
        assertEq(game.playerCount(), 0);
    }

    function testStartMatchSetsInitialPosition() public {
        _joinStart(1, 1);
        assertEq(uint8(game.phase()), 1); // Live
        assertEq(game.sideToMove(), 0); // White
        uint8[64] memory b = game.getBoard();
        // White back rank.
        assertEq(b[0], WR); assertEq(b[1], WN); assertEq(b[2], WB); assertEq(b[3], WQ);
        assertEq(b[4], WK); assertEq(b[5], WB); assertEq(b[6], WN); assertEq(b[7], WR);
        // Pawns.
        for (uint8 f = 0; f < 8; f++) {
            assertEq(b[8 + f], WP);
            assertEq(b[48 + f], BP);
        }
        // Empty middle.
        for (uint8 s = 16; s < 48; s++) assertEq(b[s], 0);
        // Black back rank.
        assertEq(b[56], BR); assertEq(b[57], BN); assertEq(b[58], BB); assertEq(b[59], BQ);
        assertEq(b[60], BK); assertEq(b[61], BB); assertEq(b[62], BN); assertEq(b[63], BR);
        // Move deadline armed.
        assertEq(game.moveDeadline(), block.timestamp + MOVE_TIMEOUT);
    }

    // ---- basic moves ----

    function testPawnPushAndTurnFlip() public {
        _joinStart(1, 1);
        _mv(A, E2, E4);
        uint8[64] memory b = game.getBoard();
        assertEq(b[E2], 0);
        assertEq(b[E4], WP);
        assertEq(game.sideToMove(), 1); // Black to move
        assertEq(game.plyCount(), 1);
        assertEq(game.halfmoveClock(), 0); // pawn move resets
    }

    function testKnightMove() public {
        _joinStart(1, 1);
        _mv(A, B1, C3);
        assertEq(game.getBoard()[C3], WN);
    }

    function testCapture() public {
        _joinStart(1, 1);
        _mv(A, E2, E4);
        _mv(B, D7, D5);
        _mv(A, E4, D5); // exd5
        uint8[64] memory b = game.getBoard();
        assertEq(b[D5], WP);
        assertEq(b[E4], 0);
    }

    function testIllegalMoveReverts() public {
        _joinStart(1, 1);
        vm.prank(A);
        vm.expectRevert("illegal move");
        game.move(E2, 36, 0); // e2-e5: three squares
    }

    function testMoveOutOfTurnReverts() public {
        _joinStart(1, 1);
        vm.prank(B); // Black tries on White's turn
        vm.expectRevert("not your side's turn");
        game.move(E7, E5, 0);
    }

    function testMoveOpponentPieceReverts() public {
        _joinStart(1, 1);
        _mv(A, E2, E4);
        vm.prank(B); // Black tries to move White's pawn
        vm.expectRevert("illegal move");
        game.move(E4, 44, 0);
    }

    function testAnySideMemberMayMove() public {
        _joinStart(2, 1); // A, B white; C black
        _mv(B, E2, E4); // B (white's 2nd member) moves on move 1
        assertEq(game.getBoard()[E4], WP);
        assertEq(game.sideToMove(), 1);
    }

    // ---- check / checkmate ----

    /// @dev Qxe5+ gives check; a non-answering move must revert, a block works.
    function testCheckMustBeAnswered() public {
        _joinStart(1, 1);
        _mv(A, E2, E4);
        _mv(B, E7, E5);
        _mv(A, D1, H5); // Qd1-h5
        _mv(B, B8, C6);
        _mv(A, H5, E5); // Qxe5+: check on the e-file
        // d6 doesn't answer the check -> reverts.
        vm.prank(B);
        vm.expectRevert("illegal move");
        game.move(D7, D6, 0);
        // Qe7 blocks -> legal, game continues.
        _mv(B, D8, E7);
        assertEq(uint8(game.phase()), 1);
        assertEq(game.sideToMove(), 0);
    }

    /// @dev Scholar's mate: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#.
    function testScholarsMateWhiteWins() public {
        _joinStart(1, 1);
        _mv(A, E2, E4);
        _mv(B, E7, E5);
        _mv(A, F1, C4);
        _mv(B, B8, C6);
        _mv(A, D1, H5); // Qd1-h5
        _mv(B, G8, F6);
        _mv(A, H5, F7); // Qxf7#: mate
        // Settled: new lobby open, White paid out.
        assertEq(uint8(game.phase()), 0);
        assertEq(game.matchId(), 2);
        uint256 fee = (2 * ENTRY * 500) / 10000;
        assertEq(game.pendingWithdrawals(A), 2 * ENTRY - fee);
        assertEq(game.pendingWithdrawals(TREASURY), fee);
        assertEq(game.pendingWithdrawals(B), 0);
    }

    /// @dev Fool's mate: 1.f3 e5 2.g4 Qh4#. Black (side 1) wins.
    function testFoolsMateBlackWins() public {
        _joinStart(1, 1);
        _mv(A, F2, F3);
        _mv(B, E7, E5);
        _mv(A, G2, G4);
        _mv(B, D8, H4); // Qh4#: mate
        assertEq(uint8(game.phase()), 0);
        uint256 fee = (2 * ENTRY * 500) / 10000;
        assertEq(game.pendingWithdrawals(B), 2 * ENTRY - fee);
        assertEq(game.pendingWithdrawals(A), 0);
    }

    /// @dev Dust from integer division sweeps to the treasury.
    function testWinSplitDustToTreasury() public {
        _joinStart(2, 1); // A, B white; C black
        _mv(A, F2, F3);
        _mv(C, E7, E5);
        _mv(B, G2, G4); // any white member may move
        _mv(C, D8, H4); // Qh4#: black wins
        uint256 fee = (3 * ENTRY * 500) / 10000; // 15
        uint256 share = 3 * ENTRY - fee; // 285, sole black player
        assertEq(game.pendingWithdrawals(C), share);
        assertEq(game.pendingWithdrawals(TREASURY), fee);
    }

    function testTeammateMovesForSide() public {
        _joinStart(1, 2); // A white; B, C black
        _mv(A, E2, E4);
        _mv(B, E7, E5);
        _mv(A, F1, C4);
        _mv(C, B8, C6); // black's second member moves
        _mv(A, D1, H5); // Qd1-h5
        _mv(B, G8, F6);
        _mv(A, H5, F7); // Qxf7#: white wins; single white player takes all
        assertEq(game.pendingWithdrawals(A), 3 * ENTRY - (3 * ENTRY * 500) / 10000);
    }

    // ---- draws ----

    /// @dev 50-move rule: 25 cycles of knight shuffling = 100 plies, no pawn
    ///      move or capture -> draw, pot split equally among ALL players.
    function testFiftyMoveRuleDraws() public {
        _joinStart(1, 1);
        for (uint256 i = 0; i < 24; i++) {
            _mv(A, G1, F3);
            _mv(B, G8, F6);
            _mv(A, F3, G1);
            _mv(B, F6, G8);
        }
        // The 100th ply must settle the draw via the fifty-move rule
        // (reason 1), not stalemate or the ply cap: inspect the Draw log.
        _mv(A, G1, F3);
        _mv(B, G8, F6);
        _mv(A, F3, G1);
        vm.recordLogs();
        _mv(B, F6, G8); // ply 100 -> fifty-move draw
        bool sawDraw;
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("Draw(uint256,uint8)")) {
                sawDraw = true;
                assertEq(uint256(logs[i].topics[1]), 1); // matchId
                assertEq(abi.decode(logs[i].data, (uint8)), 1); // reason: fifty-move
            }
        }
        assertTrue(sawDraw, "no Draw event");
        assertEq(game.matchId(), 2); // fresh lobby opened
        uint256 fee = (2 * ENTRY * 500) / 10000;
        uint256 share = (2 * ENTRY - fee) / 2;
        assertEq(game.pendingWithdrawals(A), share);
        assertEq(game.pendingWithdrawals(B), share);
        assertEq(game.pendingWithdrawals(TREASURY), fee);
    }

    /// @dev Ply-cap draw with a tiny MAX_PLYS deployment.
    function testPlyCapDraws() public {
        ViperChess quick = new ViperChess(address(token), ENTRY, TREASURY, MOVE_TIMEOUT, 6);
        token.mint(A, 10000); token.mint(B, 10000);
        vm.prank(A); token.approve(address(quick), 10000);
        vm.prank(B); token.approve(address(quick), 10000);
        vm.prank(A); quick.join(0);
        vm.prank(B); quick.join(1);
        vm.warp(block.timestamp + 61);
        quick.startMatch();
        vm.prank(A); quick.move(E2, E4, 0);
        vm.prank(B); quick.move(E7, E5, 0);
        vm.prank(A); quick.move(G1, F3, 0);
        vm.prank(B); quick.move(B8, C6, 0);
        vm.prank(A); quick.move(F3, G1, 0);
        vm.prank(B); quick.move(C6, B8, 0); // ply 6 = cap -> draw
        assertEq(uint8(quick.phase()), 0);
        uint256 fee = (2 * ENTRY * 500) / 10000;
        assertEq(quick.pendingWithdrawals(A), (2 * ENTRY - fee) / 2);
    }

    // ---- resign / timeout ----

    function testResignForfeitsSide() public {
        _joinStart(1, 1);
        _mv(A, E2, E4);
        vm.prank(A);
        game.resign(); // white forfeits -> black wins
        assertEq(uint8(game.phase()), 0);
        uint256 fee = (2 * ENTRY * 500) / 10000;
        assertEq(game.pendingWithdrawals(B), 2 * ENTRY - fee);
    }

    function testResignByNonPlayerReverts() public {
        _joinStart(1, 1);
        vm.prank(C);
        vm.expectRevert("not joined");
        game.resign();
    }

    function testClaimTimeoutBeforeDeadlineReverts() public {
        _joinStart(1, 1);
        vm.prank(C);
        vm.expectRevert("deadline not passed");
        game.claimTimeout();
    }

    function testClaimTimeoutForfeitsStalledSide() public {
        _joinStart(1, 1);
        vm.warp(block.timestamp + MOVE_TIMEOUT + 1);
        vm.prank(C); // anyone can claim
        game.claimTimeout(); // white to move stalled -> black wins
        assertEq(uint8(game.phase()), 0);
        uint256 fee = (2 * ENTRY * 500) / 10000;
        assertEq(game.pendingWithdrawals(B), 2 * ENTRY - fee);
    }

    function testMoveDeadlineResetsEachMove() public {
        _joinStart(1, 1);
        uint256 d0 = game.moveDeadline();
        vm.warp(block.timestamp + 100);
        _mv(A, E2, E4);
        assertEq(game.moveDeadline(), block.timestamp + MOVE_TIMEOUT);
        assertGt(game.moveDeadline(), d0);
    }

    // ---- promotion / simplifications ----

    /// @dev Fast promotion line: a-pawn races while black's d-pawn races,
    ///      axb7 then bxa8=Q (capturing the rook).
    function testPromotionWithChoice() public {
        _joinStart(1, 1);
        _mv(A, A2, A4);
        _mv(B, D7, D5);
        _mv(A, A4, A5);
        _mv(B, D5, 35 - 8); // d5-d4 (35 -> 27)
        _mv(A, A5, A6);
        _mv(B, 27, 19); // d4-d3
        _mv(A, A6, B7); // axb7
        _mv(B, 19, 10); // dxc2
        _mvPromo(A, B7, A8, 5); // bxa8=Q
        uint8[64] memory b = game.getBoard();
        assertEq(b[A8], WQ);
        assertEq(uint8(game.phase()), 1); // game continues
        assertEq(game.sideToMove(), 1);
    }

    function testPromotionAutoQueen() public {
        _joinStart(1, 1);
        _mv(A, A2, A4);
        _mv(B, D7, D5);
        _mv(A, A4, A5);
        _mv(B, D5, 27);
        _mv(A, A5, A6);
        _mv(B, 27, 19);
        _mv(A, A6, B7);
        _mv(B, 19, 10);
        _mvPromo(A, B7, A8, 0); // promo=0 -> auto-queen
        assertEq(game.getBoard()[A8], WQ);
    }

    function testPromotionToKnight() public {
        _joinStart(1, 1);
        _mv(A, A2, A4);
        _mv(B, D7, D5);
        _mv(A, A4, A5);
        _mv(B, D5, 27);
        _mv(A, A5, A6);
        _mv(B, 27, 19);
        _mv(A, A6, B7);
        _mv(B, 19, 10);
        _mvPromo(A, B7, A8, 2); // underpromotion to knight
        assertEq(game.getBoard()[A8], WN);
    }

    function testPromoFlagOffLastRankReverts() public {
        _joinStart(1, 1);
        vm.prank(A);
        vm.expectRevert("illegal move");
        game.move(E2, E4, 5); // promo flag on a non-promoting move
    }

    function testBadPromoCodeReverts() public {
        _joinStart(1, 1);
        _mv(A, A2, A4);
        _mv(B, D7, D5);
        _mv(A, A4, A5);
        _mv(B, D5, 27);
        _mv(A, A5, A6);
        _mv(B, 27, 19);
        _mv(A, A6, B7);
        _mv(B, 19, 10);
        vm.prank(A);
        vm.expectRevert("illegal move");
        game.move(B7, A8, 6); // promo=6 invalid
    }

    /// @dev Documents the simplification: no en passant. exf6 e.p. reverts
    ///      because f6 is empty.
    function testEnPassantNotSupported() public {
        _joinStart(1, 1);
        _mv(A, E2, E4);
        _mv(B, D7, D5);
        _mv(A, E4, E5);
        _mv(B, 53, 37); // f7-f5
        vm.prank(A);
        vm.expectRevert("illegal move");
        game.move(E5, F6, 0); // exf6 e.p. would be the capture square
    }

    /// @dev Documents the simplification: no castling. King moving two
    ///      squares reverts even with f1/g1 clear.
    function testCastlingNotSupported() public {
        _joinStart(1, 1);
        _mv(A, E2, E4);
        _mv(B, E7, E5);
        _mv(A, G1, F3);
        _mv(B, B8, C6);
        _mv(A, F1, C4);
        _mv(B, F8, C5);
        vm.prank(A);
        vm.expectRevert("illegal move");
        game.move(E8 - 56, G1, 0); // O-O: Ke1-g1 (4 -> 6)
    }

    // ---- session keys / claim ----

    function testJoinWithSessionThenMoveViaKey() public {
        address sess = address(0x5E55);
        vm.prank(A);
        game.joinWithSession(0, sess, uint64(block.timestamp + 3600));
        vm.prank(B);
        game.join(1);
        vm.warp(block.timestamp + 61);
        game.startMatch();
        vm.prank(sess);
        game.move(E2, E4, 0); // session key moves for A
        assertEq(game.getBoard()[E4], WP);
        assertEq(game.sideToMove(), 1);
    }

    function testRevokedSessionCannotMove() public {
        address sess = address(0x5E55);
        vm.prank(A);
        game.joinWithSession(0, sess, uint64(block.timestamp + 3600));
        vm.prank(B);
        game.join(1);
        vm.warp(block.timestamp + 61);
        game.startMatch();
        vm.prank(A);
        game.revokeSession(sess);
        vm.prank(sess);
        vm.expectRevert("no session");
        game.move(E2, E4, 0);
    }

    function testSessionKeyCannotClaim() public {
        address sess = address(0x5E55);
        vm.prank(A);
        game.joinWithSession(0, sess, uint64(block.timestamp + 3600));
        vm.prank(B);
        game.join(1);
        vm.warp(block.timestamp + 61);
        game.startMatch();
        _mv(A, F2, F3);
        _mv(B, E7, E5);
        _mv(A, G2, G4);
        _mv(B, D8, H4); // black wins
        // The session key holds no funds path: claim as sess reverts.
        vm.prank(sess);
        vm.expectRevert("nothing to claim");
        game.claim();
        // The player claims normally.
        uint256 before = token.balanceOf(B);
        vm.prank(B);
        game.claim();
        assertGt(token.balanceOf(B), before);
    }

    function testClaimAfterWin() public {
        _joinStart(1, 1);
        _mv(A, F2, F3);
        _mv(B, E7, E5);
        _mv(A, G2, G4);
        _mv(B, D8, H4); // black wins
        uint256 fee = (2 * ENTRY * 500) / 10000;
        uint256 before = token.balanceOf(B);
        vm.prank(B);
        game.claim();
        assertEq(token.balanceOf(B), before + 2 * ENTRY - fee);
        assertEq(game.pendingWithdrawals(B), 0);
    }

    function testNewLobbyAfterMatch() public {
        _joinStart(1, 1);
        _mv(A, F2, F3);
        _mv(B, E7, E5);
        _mv(A, G2, G4);
        _mv(B, D8, H4); // black wins, lobby reopens
        assertEq(game.matchId(), 2);
        vm.prank(A); game.join(1); // A can join the other side next game
        vm.prank(B); game.join(0);
        assertEq(game.sideOf(A), 1);
        assertEq(game.pot(), 2 * ENTRY);
    }
}
