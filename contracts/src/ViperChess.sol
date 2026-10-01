// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ViperChess — team chess, fully on-chain
/// @notice Two sides (White / Black) stake VIPER. During a side's turn ANY
///         member of that side may submit a move; the first valid submission
///         executes. Full chess rules are enforced on-chain (see simplifications
///         below); the winning side splits the pot minus the 5% protocol fee.
///
///         Session keys are the default path: joinWithSession authorizes a
///         browser-held key once, then moves go through it with zero wallet
///         pop-ups (same SessionAuth pattern as ViperArena / ViperSnake).
///
///         Rules implemented: all piece movement, pawn double-push, captures,
///         promotion (with choice), check, checkmate, stalemate, 50-move rule.
///         Deliberately skipped (see CHESS_SPEC.md): castling, en passant,
///         threefold repetition. A per-move timeout (MOVE_TIMEOUT) forfeits a
///         stalled side; a MAX_PLYS cap bounds pathological games.
///
///         Staked in VIPER. Timed 60s lobbies -> live game -> winning side
///         splits the pot (5% protocol fee). Draws (stalemate / 50-move /
///         ply-cap) split the pot equally among ALL players.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract ViperChess {
    // ---- Tunables ----
    uint256 public constant FEE_BPS = 500; // 5% protocol fee
    uint256 public constant LOBBY_DURATION = 60; // seconds
    uint8 public constant MAX_PER_SIDE = 8;
    uint8 public constant SIDE_WHITE = 0;
    uint8 public constant SIDE_BLACK = 1;

    /// @notice Seconds a side has to move before anyone can claim the forfeit.
    uint256 public immutable MOVE_TIMEOUT;
    /// @notice Backstop ply cap: a game this long is declared a draw.
    uint256 public immutable MAX_PLYS;
    /// @notice Plies without a pawn move or capture before a 50-move draw.
    uint256 public constant FIFTY_MOVE_PLYS = 100;

    IERC20 public immutable stakeToken;
    uint256 public immutable entryFee;
    address public immutable treasury;

    enum Phase { Lobby, Live }

    // Piece codes: 0 = empty; White 1..6 = P,N,B,R,Q,K; Black 7..12 = p,n,b,r,q,k.
    uint8 private constant WP = 1;
    uint8 private constant WN = 2;
    uint8 private constant WB = 3;
    uint8 private constant WR = 4;
    uint8 private constant WQ = 5;
    uint8 private constant WK = 6;

    // promo codes: 0 = none/auto-queen, 2 = knight, 3 = bishop, 4 = rook, 5 = queen
    uint8 private constant NO_SQUARE = 255;

    uint256 public matchId;
    Phase public phase;
    uint256 public lobbyEndsAt;
    uint8 public sideToMove; // 0 = White, 1 = Black
    uint8[64] public board;
    address[] public whitePlayers;
    address[] public blackPlayers;
    uint256 public pot;
    uint8 public lastMoveFrom = NO_SQUARE;
    uint8 public lastMoveTo = NO_SQUARE;
    uint256 public halfmoveClock;
    uint256 public plyCount;
    uint256 public moveDeadline;

    mapping(address => bool) public joined;
    mapping(address => uint8) public sideOf; // 0 = White, 1 = Black (valid when joined)

    /// @notice Pull-payment ledger (same as ViperArena/ViperSnake): winnings,
    ///         splits, refunds and fees are credited here instead of
    ///         push-transferred during settlement, so one failing recipient
    ///         can't brick the match.
    mapping(address => uint256) public pendingWithdrawals;

    /// @notice Maximum session-key lifetime. Bounds the compromise window of
    ///         a browser-held key. Matches last minutes; a day is generous.
    uint64 public constant MAX_SESSION_TTL = 1 days;

    struct SessionAuth {
        address player;
        uint64 expiry;
        bool revoked;
        uint256 authMatchId; // keys only work in the match they joined
    }

    /// @notice Browser-held session keys authorized for gameplay-only
    ///         actions. A session key can never move funds: move() resolves
    ///         it to its player; everything else keys off msg.sender.
    mapping(address => SessionAuth) public sessions;

    bool private _locked;

    // ---- Events: the client rebuilds game state from these + getMatchState ----
    event LobbyOpened(uint256 indexed matchId, uint256 closesAt);
    event PlayerJoined(uint256 indexed matchId, address indexed player, uint8 side);
    event MatchStarted(uint256 indexed matchId, uint256 whiteCount, uint256 blackCount);
    event MatchCancelled(uint256 indexed matchId);
    event MoveMade(uint256 indexed matchId, uint256 ply, address indexed player, uint8 fromSq, uint8 toSq, uint8 promo);
    event MatchEnded(uint256 indexed matchId, uint8 winningSide, uint8 reason); // reason: 0=checkmate 1=resign 2=timeout
    event Draw(uint256 indexed matchId, uint8 reason); // reason: 0=stalemate 1=fifty-move 2=ply-cap
    event PotSplit(uint256 indexed matchId, uint256 recipients, uint256 shareEach);
    event Refunded(uint256 indexed matchId, address indexed player, uint256 amount);
    event WithdrawalCredited(uint256 indexed matchId, address indexed to, uint256 amount);
    event SessionAuthorized(uint256 indexed matchId, address indexed player, address indexed sessionKey, uint64 expiry);
    event SessionRevoked(uint256 indexed matchId, address indexed player, address indexed sessionKey);

    modifier nonReentrant() {
        require(!_locked, "reentrant");
        _locked = true;
        _;
        _locked = false;
    }

    constructor(
        address _stakeToken,
        uint256 _entryFee,
        address _treasury,
        uint256 _moveTimeout,
        uint256 _maxPlys
    ) {
        require(_stakeToken != address(0) && _treasury != address(0), "zero addr");
        require(_entryFee > 0 && _moveTimeout > 0 && _maxPlys > 0, "zero param");
        stakeToken = IERC20(_stakeToken);
        entryFee = _entryFee;
        treasury = _treasury;
        MOVE_TIMEOUT = _moveTimeout;
        MAX_PLYS = _maxPlys;
        _openLobby();
    }

    // ---- Lobby ----

    /// @notice Pay the entry fee to join a side (0 = White, 1 = Black).
    function join(uint8 side) external nonReentrant {
        _join(side, address(0), 0);
    }

    /// @notice Join a side and authorize a session key for moves in one tx.
    function joinWithSession(uint8 side, address sessionKey, uint64 expiry) external nonReentrant {
        require(sessionKey != address(0), "zero session key");
        require(expiry > block.timestamp, "expiry in past");
        require(expiry <= block.timestamp + MAX_SESSION_TTL, "expiry too far");
        _join(side, sessionKey, expiry);
    }

    function _join(uint8 side, address sessionKey, uint64 expiry) internal {
        require(side == SIDE_WHITE || side == SIDE_BLACK, "bad side");
        require(phase == Phase.Lobby, "lobby closed");
        require(!joined[msg.sender], "already joined");
        require(whitePlayers.length + blackPlayers.length < MAX_PER_SIDE * 2, "lobby full");
        if (whitePlayers.length + blackPlayers.length == 0) {
            // First joiner (re)starts the 60s countdown, so a lobby left
            // idle past expiry can't trap anyone in an instant-cancel.
            lobbyEndsAt = block.timestamp + LOBBY_DURATION;
        } else {
            require(block.timestamp < lobbyEndsAt, "lobby closed");
        }
        if (side == SIDE_WHITE) {
            require(whitePlayers.length < MAX_PER_SIDE, "white full");
        } else {
            require(blackPlayers.length < MAX_PER_SIDE, "black full");
        }
        require(stakeToken.transferFrom(msg.sender, address(this), entryFee), "fee failed");

        joined[msg.sender] = true;
        sideOf[msg.sender] = side;
        if (side == SIDE_WHITE) whitePlayers.push(msg.sender);
        else blackPlayers.push(msg.sender);
        pot += entryFee;
        emit PlayerJoined(matchId, msg.sender, side);

        if (sessionKey != address(0)) {
            sessions[sessionKey] = SessionAuth(msg.sender, expiry, false, matchId);
            emit SessionAuthorized(matchId, msg.sender, sessionKey, expiry);
        }
    }

    /// @notice Anyone can start the game once the 60s window closes.
    ///         Fewer than 1 player per side -> everyone refunded, new lobby.
    function startMatch() external nonReentrant {
        require(phase == Phase.Lobby, "not in lobby");
        require(block.timestamp >= lobbyEndsAt, "lobby still open");

        if (whitePlayers.length == 0 || blackPlayers.length == 0) {
            for (uint256 i = 0; i < whitePlayers.length; i++) {
                _credit(whitePlayers[i], entryFee);
                emit Refunded(matchId, whitePlayers[i], entryFee);
            }
            for (uint256 i = 0; i < blackPlayers.length; i++) {
                _credit(blackPlayers[i], entryFee);
                emit Refunded(matchId, blackPlayers[i], entryFee);
            }
            emit MatchCancelled(matchId);
            _openLobby();
            return;
        }

        phase = Phase.Live;
        sideToMove = SIDE_WHITE;
        _setupBoard();
        halfmoveClock = 0;
        plyCount = 0;
        lastMoveFrom = NO_SQUARE;
        lastMoveTo = NO_SQUARE;
        moveDeadline = block.timestamp + MOVE_TIMEOUT;
        emit MatchStarted(matchId, whitePlayers.length, blackPlayers.length);
    }

    // ---- Gameplay ----

    /// @notice Submit a move for the side to move. Any member of that side
    ///         may call; the first VALID submission executes. Squares are
    ///         0..63 (rank*8+file, rank 0 = White's home rank). promo:
    ///         0 = none (auto-queen on promotion), 2/3/4/5 = N/B/R/Q.
    ///         Callable directly or via an authorized session key.
    function move(uint8 fromSq, uint8 toSq, uint8 promo) external nonReentrant {
        require(phase == Phase.Live, "not live");
        address player = _resolvePlayer(msg.sender);
        require(joined[player] && sideOf[player] == sideToMove, "not your side's turn");

        uint8[64] memory b = _loadBoard();
        bool white = sideToMove == SIDE_WHITE;
        require(_moveIsLegal(b, fromSq, toSq, white, promo), "illegal move");

        uint8 piece = b[fromSq];
        bool isPawn = _base(piece) == 1;
        bool isCapture = b[toSq] != 0;

        // Apply to the memory board, then write the two touched squares back.
        uint8 moved = piece;
        if (isPawn && _isPromoRank(toSq, white)) {
            moved = _promoPiece(promo, white);
        }
        b[fromSq] = 0;
        b[toSq] = moved;
        board[fromSq] = 0;
        board[toSq] = moved;

        if (isPawn || isCapture) halfmoveClock = 0;
        else halfmoveClock += 1;
        plyCount += 1;
        lastMoveFrom = fromSq;
        lastMoveTo = toSq;
        emit MoveMade(matchId, plyCount, player, fromSq, toSq, promo);

        // Terminal detection for the side now to move.
        bool nextWhite = !white;
        bool inChk = _inCheck(b, nextWhite);
        if (!_hasLegalMove(b, nextWhite)) {
            if (inChk) {
                // Checkmate: the mover's side wins.
                _settleWin(sideToMove, 0);
            } else {
                _settleDraw(0); // stalemate
            }
            return;
        }
        if (halfmoveClock >= FIFTY_MOVE_PLYS) {
            _settleDraw(1); // fifty-move rule
            return;
        }
        if (plyCount >= MAX_PLYS) {
            _settleDraw(2); // ply cap
            return;
        }

        sideToMove = nextWhite ? SIDE_WHITE : SIDE_BLACK;
        moveDeadline = block.timestamp + MOVE_TIMEOUT;
    }

    /// @notice Any member may forfeit for their own side.
    function resign() external nonReentrant {
        require(phase == Phase.Live, "not live");
        require(joined[msg.sender], "not joined");
        uint8 loser = sideOf[msg.sender];
        uint8 winner = loser == SIDE_WHITE ? SIDE_BLACK : SIDE_WHITE;
        _settleWin(winner, 1);
    }

    /// @notice Permissionless: if the side to move missed its deadline, the
    ///         other side wins. Keeps stalled games resolving without keepers.
    function claimTimeout() external nonReentrant {
        require(phase == Phase.Live, "not live");
        require(block.timestamp > moveDeadline, "deadline not passed");
        uint8 winner = sideToMove == SIDE_WHITE ? SIDE_BLACK : SIDE_WHITE;
        _settleWin(winner, 2);
    }

    /// @notice Pull-payment: withdraw credited winnings, splits, refunds or
    ///         fees. Balance zeroed BEFORE the transfer; a failing transfer
    ///         only reverts the caller's own claim.
    function claim() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "nothing to claim");
        pendingWithdrawals[msg.sender] = 0;
        require(stakeToken.transfer(msg.sender, amount), "claim failed");
    }

    /// @notice Revoke a session key. Callable by the player who authorized
    ///         it, or by the session key itself (escape hatch).
    function revokeSession(address sessionKey) external nonReentrant {
        SessionAuth storage s = sessions[sessionKey];
        require(s.player != address(0), "unknown session");
        require(msg.sender == s.player || msg.sender == sessionKey, "not authorized");
        require(!s.revoked, "already revoked");
        s.revoked = true;
        emit SessionRevoked(s.authMatchId, s.player, sessionKey);
    }

    // ---- Settlement ----

    function _settleWin(uint8 winningSide, uint8 reason) internal {
        address[] storage winners = winningSide == SIDE_WHITE ? whitePlayers : blackPlayers;
        uint256 n = winners.length;
        require(n > 0, "no winners");
        uint256 fee = (pot * FEE_BPS) / 10000;
        uint256 distributable = pot - fee;
        uint256 share = distributable / n;
        uint256 dust = distributable % n;
        emit MatchEnded(matchId, winningSide, reason);
        emit PotSplit(matchId, n, share);
        _credit(treasury, fee);
        _credit(treasury, dust);
        for (uint256 i = 0; i < n; i++) {
            _credit(winners[i], share);
        }
        _openLobby();
    }

    function _settleDraw(uint8 reason) internal {
        uint256 n = whitePlayers.length + blackPlayers.length;
        require(n > 0, "no players");
        uint256 fee = (pot * FEE_BPS) / 10000;
        uint256 distributable = pot - fee;
        uint256 share = distributable / n;
        uint256 dust = distributable % n;
        emit Draw(matchId, reason);
        emit PotSplit(matchId, n, share);
        _credit(treasury, fee);
        _credit(treasury, dust);
        for (uint256 i = 0; i < whitePlayers.length; i++) {
            _credit(whitePlayers[i], share);
        }
        for (uint256 i = 0; i < blackPlayers.length; i++) {
            _credit(blackPlayers[i], share);
        }
        _openLobby();
    }

    // ---- Internals ----

    /// @dev Resolve a gameplay caller to its player. Direct joiners act as
    ///      themselves; an authorized session key acts as its player — but
    ///      only in the match it was authorized for, while unexpired and
    ///      unrevoked. Funds-moving functions never route through here.
    function _resolvePlayer(address sender) internal view returns (address) {
        if (joined[sender]) return sender;
        SessionAuth memory s = sessions[sender];
        require(
            s.player != address(0) &&
            !s.revoked &&
            s.authMatchId == matchId &&
            block.timestamp <= s.expiry,
            "no session"
        );
        return s.player;
    }

    /// @dev Pull-payment credit. Storage write + event only: can never
    ///      revert on a recipient's behalf. Called before _openLobby() so
    ///      the event carries the settled match's id.
    function _credit(address to, uint256 amount) internal {
        if (amount == 0) return;
        pendingWithdrawals[to] += amount;
        emit WithdrawalCredited(matchId, to, amount);
    }

    function _openLobby() internal {
        for (uint256 i = 0; i < whitePlayers.length; i++) {
            address p = whitePlayers[i];
            joined[p] = false;
        }
        for (uint256 i = 0; i < blackPlayers.length; i++) {
            address p = blackPlayers[i];
            joined[p] = false;
        }
        delete whitePlayers;
        delete blackPlayers;
        pot = 0;
        sideToMove = SIDE_WHITE;
        halfmoveClock = 0;
        plyCount = 0;
        moveDeadline = 0;
        lastMoveFrom = NO_SQUARE;
        lastMoveTo = NO_SQUARE;
        matchId += 1;
        phase = Phase.Lobby;
        lobbyEndsAt = block.timestamp + LOBBY_DURATION;
        emit LobbyOpened(matchId, lobbyEndsAt);
    }

    function _setupBoard() internal {
        // White back rank: R N B Q K B N R
        board[0] = WR; board[1] = WN; board[2] = WB; board[3] = WQ;
        board[4] = WK; board[5] = WB; board[6] = WN; board[7] = WR;
        for (uint8 f = 0; f < 8; f++) {
            board[8 + f] = WP;
            board[48 + f] = WP + 6; // black pawns
        }
        // Black back rank: r n b q k b n r
        board[56] = WR + 6; board[57] = WN + 6; board[58] = WB + 6; board[59] = WQ + 6;
        board[60] = WK + 6; board[61] = WB + 6; board[62] = WN + 6; board[63] = WR + 6;
        for (uint8 s = 16; s < 48; s++) board[s] = 0;
    }

    function _loadBoard() internal view returns (uint8[64] memory b) {
        for (uint256 i = 0; i < 64; i++) b[i] = board[i];
    }

    // ---- Chess rules (pure; operate on a memory board) ----

    /// @dev 0 = empty, 1 = white, 2 = black.
    function _color(uint8 p) internal pure returns (uint8) {
        if (p == 0) return 0;
        return p <= 6 ? 1 : 2;
    }

    /// @dev Base piece: 1=P 2=N 3=B 4=R 5=Q 6=K.
    function _base(uint8 p) internal pure returns (uint8) {
        return p > 6 ? p - 6 : p;
    }

    function _isPromoRank(uint8 sq, bool white) internal pure returns (bool) {
        return white ? sq >= 56 : sq < 8;
    }

    function _promoPiece(uint8 promo, bool white) internal pure returns (uint8) {
        // promo: 0 = auto-queen, 2/3/4/5 = N/B/R/Q
        uint8 base = promo == 0 ? 5 : promo;
        return white ? base : base + 6;
    }

    /// @dev True if square `sq` is attacked by `byWhite`'s pieces.
    ///      (Split into helpers to stay under the stack limit.)
    function _isAttacked(uint8[64] memory b, uint8 sq, bool byWhite) internal pure returns (bool) {
        uint8 f = sq & 7;
        uint8 r = sq >> 3;
        if (_pawnAttacks(b, sq, f, r, byWhite)) return true;
        if (_leaperAttacks(b, f, r, byWhite ? WN : WN + 6, true)) return true; // knights
        if (_leaperAttacks(b, f, r, byWhite ? WK : WK + 6, false)) return true; // king
        uint8 myC = byWhite ? 1 : 2;
        if (_rayAttacks(b, f, r, myC, true)) return true; // diagonals: bishop/queen
        if (_rayAttacks(b, f, r, myC, false)) return true; // straights: rook/queen
        return false;
    }

    /// @dev Pawn attacks on `sq`. A white pawn on p attacks p+7/p+9, so sq is
    ///      hit from sq-7 (file(sq) > 0) or sq-9 (file(sq) < 7); black mirrors.
    function _pawnAttacks(
        uint8[64] memory b,
        uint8 sq,
        uint8 f,
        uint8 r,
        bool byWhite
    ) internal pure returns (bool) {
        uint8 pawnC = byWhite ? WP : WP + 6;
        if (byWhite) {
            if (r == 0) return false;
            return (f > 0 && b[sq - 7] == pawnC) || (f < 7 && b[sq - 9] == pawnC);
        }
        if (r == 7) return false;
        return (f < 7 && b[sq + 7] == pawnC) || (f > 0 && b[sq + 9] == pawnC);
    }

    /// @dev Knight (knight=true) or king (knight=false) attacks on (f, r).
    function _leaperAttacks(
        uint8[64] memory b,
        uint8 f,
        uint8 r,
        uint8 target,
        bool knight
    ) internal pure returns (bool) {
        if (knight) {
            int8[8] memory df = [int8(1), 2, 2, 1, -1, -2, -2, -1];
            int8[8] memory dr = [int8(2), 1, -1, -2, -2, -1, 1, 2];
            return _scanLeaps(b, f, r, target, df, dr);
        }
        int8[8] memory kdf = [int8(1), 1, 1, 0, 0, -1, -1, -1];
        int8[8] memory kdr = [int8(1), 0, -1, 1, -1, 1, 0, -1];
        return _scanLeaps(b, f, r, target, kdf, kdr);
    }

    function _scanLeaps(
        uint8[64] memory b,
        uint8 f,
        uint8 r,
        uint8 target,
        int8[8] memory df,
        int8[8] memory dr
    ) internal pure returns (bool) {
        for (uint256 i = 0; i < 8; i++) {
            int16 nf = int16(uint16(f)) + df[i];
            int16 nr = int16(uint16(r)) + dr[i];
            if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
            if (b[uint8(uint16(nr)) * 8 + uint8(uint16(nf))] == target) return true;
        }
        return false;
    }

    /// @dev Sliding attacks: diag=true scans diagonals (bishop/queen),
    ///      diag=false scans straights (rook/queen).
    function _rayAttacks(
        uint8[64] memory b,
        uint8 f,
        uint8 r,
        uint8 myC,
        bool diag
    ) internal pure returns (bool) {
        uint8 want = diag ? 3 : 4; // bishop or rook (queen = 5 either way)
        if (diag) {
            int8[4] memory df = [int8(1), 1, -1, -1];
            int8[4] memory dr = [int8(1), -1, 1, -1];
            return _scanRays(b, f, r, myC, want, df, dr);
        }
        int8[4] memory sdf = [int8(1), -1, 0, 0];
        int8[4] memory sdr = [int8(0), 0, 1, -1];
        return _scanRays(b, f, r, myC, want, sdf, sdr);
    }

    function _scanRays(
        uint8[64] memory b,
        uint8 f,
        uint8 r,
        uint8 myC,
        uint8 want,
        int8[4] memory df,
        int8[4] memory dr
    ) internal pure returns (bool) {
        for (uint256 d = 0; d < 4; d++) {
            int16 nf = int16(uint16(f)) + df[d];
            int16 nr = int16(uint16(r)) + dr[d];
            while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
                uint8 p = b[uint8(uint16(nr)) * 8 + uint8(uint16(nf))];
                if (p != 0) {
                    if (_color(p) == myC) {
                        uint8 base = _base(p);
                        if (base == want || base == 5) return true;
                    }
                    break;
                }
                nf += df[d];
                nr += dr[d];
            }
        }
        return false;
    }

    function _findKing(uint8[64] memory b, bool white) internal pure returns (uint8) {
        uint8 k = white ? WK : WK + 6;
        for (uint8 i = 0; i < 64; i++) {
            if (b[i] == k) return i;
        }
        revert("no king");
    }

    function _inCheck(uint8[64] memory b, bool white) internal pure returns (bool) {
        return _isAttacked(b, _findKing(b, white), !white);
    }

    /// @dev Movement-pattern check only: piece moves like it should, path is
    ///      clear, promotion flag is sane. Does NOT test king safety.
    ///      (Split per piece kind to stay under the stack limit.)
    function _patternOk(
        uint8[64] memory b,
        uint8 from,
        uint8 to,
        bool white,
        uint8 promo
    ) internal pure returns (bool) {
        if (from >= 64 || to >= 64 || from == to) return false;
        uint8 piece = b[from];
        if (_color(piece) != (white ? 1 : 2)) return false;
        if (_color(b[to]) == (white ? 1 : 2)) return false; // own piece
        if (promo > 5 || promo == 1) return false; // only 0/2/3/4/5

        uint8 base = _base(piece);
        bool promotes = base == 1 && _isPromoRank(to, white);
        if (!promotes && promo != 0) return false;

        if (base == 1) return _pawnPattern(b, from, to, white);

        uint8 ff = from & 7;
        uint8 fr = from >> 3;
        uint8 tf = to & 7;
        uint8 tr = to >> 3;
        uint8 df = ff > tf ? ff - tf : tf - ff;
        // dr normalized so + means "forward" for the moving color.
        int8 dr = int8(uint8(tr)) - int8(uint8(fr));
        if (!white) dr = -dr;

        if (base == 2) {
            // Knight.
            return (df == 1 && (dr == 2 || dr == -2)) || (df == 2 && (dr == 1 || dr == -1));
        }
        if (base == 6) {
            // King: one square (no castling).
            return df <= 1 && dr <= 1 && dr >= -1;
        }
        return _sliderPattern(b, ff, fr, tf, tr, df, dr, base);
    }

    /// @dev Pawn movement: single push, double push from the starting rank
    ///      (path clear), diagonal capture (no en passant), promotion handled
    ///      by the caller via the promo flag.
    function _pawnPattern(
        uint8[64] memory b,
        uint8 from,
        uint8 to,
        bool white
    ) internal pure returns (bool) {
        uint8 ff = from & 7;
        uint8 fr = from >> 3;
        uint8 tf = to & 7;
        uint8 tr = to >> 3;
        uint8 df = ff > tf ? ff - tf : tf - ff;
        int8 dr = int8(uint8(tr)) - int8(uint8(fr));
        if (!white) dr = -dr;
        if (df == 0) {
            if (b[to] != 0) return false;
            if (dr == 1) return true;
            if (dr == 2 && fr == (white ? 1 : 6)) {
                uint8 mid = white ? from + 8 : from - 8;
                return b[mid] == 0;
            }
            return false;
        }
        if (df == 1 && dr == 1) return b[to] != 0; // capture only
        return false;
    }

    /// @dev Bishop/rook/queen movement: correct geometry + clear path.
    function _sliderPattern(
        uint8[64] memory b,
        uint8 ff,
        uint8 fr,
        uint8 tf,
        uint8 tr,
        uint8 df,
        int8 dr,
        uint8 base
    ) internal pure returns (bool) {
        uint8 adr = dr >= 0 ? uint8(dr) : uint8(-dr);
        bool diag = df == adr && df > 0;
        bool straight = (df == 0) != (dr == 0); // exactly one delta is zero
        if (base == 3 && !diag) return false; // bishop
        if (base == 4 && !straight) return false; // rook
        if (base == 5 && !diag && !straight) return false; // queen
        return _pathClear(b, ff, fr, tf, tr);
    }

    /// @dev True if every square strictly between from and to is empty.
    function _pathClear(
        uint8[64] memory b,
        uint8 ff,
        uint8 fr,
        uint8 tf,
        uint8 tr
    ) internal pure returns (bool) {
        int8 sf = tf > ff ? int8(1) : (tf < ff ? int8(-1) : int8(0));
        int8 sr = tr > fr ? int8(1) : (tr < fr ? int8(-1) : int8(0));
        uint8 cf = uint8(int8(ff) + sf);
        uint8 cr = uint8(int8(fr) + sr);
        while (cf != tf || cr != tr) {
            if (b[cr * 8 + cf] != 0) return false;
            cf = uint8(int8(cf) + sf);
            cr = uint8(int8(cr) + sr);
        }
        return true;
    }

    /// @dev Full legality: pattern ok AND the move doesn't leave the mover's
    ///      own king in check.
    function _moveIsLegal(
        uint8[64] memory b,
        uint8 from,
        uint8 to,
        bool white,
        uint8 promo
    ) internal pure returns (bool) {
        if (!_patternOk(b, from, to, white, promo)) return false;
        uint8[64] memory nb = _copyBoard(b);
        uint8 piece = nb[from];
        uint8 moved = piece;
        if (_base(piece) == 1 && _isPromoRank(to, white)) {
            moved = _promoPiece(promo, white);
        }
        nb[from] = 0;
        nb[to] = moved;
        return !_isAttacked(nb, _findKing(nb, white), !white);
    }

    function _copyBoard(uint8[64] memory b) internal pure returns (uint8[64] memory nb) {
        for (uint256 i = 0; i < 64; i++) nb[i] = b[i];
    }

    /// @dev Enumerate pattern-valid destinations for the piece on `from`
    ///      into `dests`; returns the count. Used by _hasLegalMove.
    /// @dev Enumerate pattern-valid destinations for the piece on `from`
    ///      into `dests`; returns the count. Used by _hasLegalMove.
    ///      (Split per piece kind to stay under the stack limit.)
    function _genDests(
        uint8[64] memory b,
        uint8 from,
        bool white,
        uint8[64] memory dests
    ) internal pure returns (uint256 count) {
        uint8 base = _base(b[from]);
        if (base == 1) return _genPawnDests(b, from, white, dests);
        if (base == 2) return _genKnightDests(b, from, white, dests);
        if (base == 6) return _genKingDests(b, from, white, dests);
        return _genSliderDests(b, from, white, base, dests);
    }

    /// @dev Pawn destinations: pushes (1/2) + captures.
    function _genPawnDests(
        uint8[64] memory b,
        uint8 from,
        bool white,
        uint8[64] memory dests
    ) internal pure returns (uint256 count) {
        uint8 f = from & 7;
        uint8 r = from >> 3;
        uint8 myC = white ? 1 : 2;
        count = 0;
        int8 step = white ? int8(8) : int8(-8);
        int16 t1 = int16(uint16(from)) + step;
        if (t1 < 0 || t1 >= 64) return count;
        uint8 s1 = uint8(uint16(t1));
        if (b[s1] == 0) {
            dests[count++] = s1;
            uint8 startR = white ? 1 : 6;
            if (r == startR) {
                uint8 s2 = uint8(uint16(int16(uint16(from)) + step * 2));
                if (b[s2] == 0) dests[count++] = s2;
            }
        }
        if (f > 0) {
            uint8 c = s1 - 1;
            if (_color(b[c]) != 0 && _color(b[c]) != myC) dests[count++] = c;
        }
        if (f < 7) {
            uint8 c = s1 + 1;
            if (_color(b[c]) != 0 && _color(b[c]) != myC) dests[count++] = c;
        }
        return count;
    }

    /// @dev Knight destinations.
    function _genKnightDests(
        uint8[64] memory b,
        uint8 from,
        bool white,
        uint8[64] memory dests
    ) internal pure returns (uint256 count) {
        uint8 f = from & 7;
        uint8 r = from >> 3;
        uint8 myC = white ? 1 : 2;
        count = 0;
        int8[8] memory df = [int8(1), 2, 2, 1, -1, -2, -2, -1];
        int8[8] memory dr = [int8(2), 1, -1, -2, -2, -1, 1, 2];
        for (uint256 i = 0; i < 8; i++) {
            int16 nf = int16(uint16(f)) + df[i];
            int16 nr = int16(uint16(r)) + dr[i];
            if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
            uint8 c = uint8(uint16(nr)) * 8 + uint8(uint16(nf));
            if (_color(b[c]) != myC) dests[count++] = c;
        }
        return count;
    }

    /// @dev King destinations (no castling).
    function _genKingDests(
        uint8[64] memory b,
        uint8 from,
        bool white,
        uint8[64] memory dests
    ) internal pure returns (uint256 count) {
        uint8 f = from & 7;
        uint8 r = from >> 3;
        uint8 myC = white ? 1 : 2;
        count = 0;
        int8[8] memory df = [int8(1), 1, 1, 0, 0, -1, -1, -1];
        int8[8] memory dr = [int8(1), 0, -1, 1, -1, 1, 0, -1];
        for (uint256 i = 0; i < 8; i++) {
            int16 nf = int16(uint16(f)) + df[i];
            int16 nr = int16(uint16(r)) + dr[i];
            if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
            uint8 c = uint8(uint16(nr)) * 8 + uint8(uint16(nf));
            if (_color(b[c]) != myC) dests[count++] = c;
        }
        return count;
    }

    /// @dev Bishop/rook/queen destinations: ray walks.
    function _genSliderDests(
        uint8[64] memory b,
        uint8 from,
        bool white,
        uint8 base,
        uint8[64] memory dests
    ) internal pure returns (uint256) {
        uint8 f = from & 7;
        uint8 r = from >> 3;
        uint8 myC = white ? 1 : 2;
        if (base == 3) return _genRaySet(b, f, r, myC, dests, 0, true); // bishop
        if (base == 4) return _genRaySet(b, f, r, myC, dests, 0, false); // rook
        // queen: diagonals then straights, appended into one list
        uint256 n = _genRaySet(b, f, r, myC, dests, 0, true);
        return _genRaySet(b, f, r, myC, dests, n, false);
    }

    /// @dev Walk 4 rays (diagonal or straight), appending destinations.
    function _genRaySet(
        uint8[64] memory b,
        uint8 f,
        uint8 r,
        uint8 myC,
        uint8[64] memory dests,
        uint256 start,
        bool diag
    ) internal pure returns (uint256 count) {
        count = start;
        if (diag) {
            int8[4] memory df = [int8(1), 1, -1, -1];
            int8[4] memory dr = [int8(1), -1, 1, -1];
            for (uint256 d = 0; d < 4; d++) {
                count = _walkRay(b, f, r, myC, dests, count, df[d], dr[d]);
            }
            return count;
        }
        int8[4] memory sdf = [int8(1), -1, 0, 0];
        int8[4] memory sdr = [int8(0), 0, 1, -1];
        for (uint256 d = 0; d < 4; d++) {
            count = _walkRay(b, f, r, myC, dests, count, sdf[d], sdr[d]);
        }
        return count;
    }

    /// @dev Walk one ray, appending empty/enemy squares until blocked.
    function _walkRay(
        uint8[64] memory b,
        uint8 f,
        uint8 r,
        uint8 myC,
        uint8[64] memory dests,
        uint256 count,
        int8 sdf,
        int8 sdr
    ) internal pure returns (uint256) {
        int16 nf = int16(uint16(f)) + sdf;
        int16 nr = int16(uint16(r)) + sdr;
        while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
            uint8 c = uint8(uint16(nr)) * 8 + uint8(uint16(nf));
            uint8 cc = _color(b[c]);
            if (cc == myC) break;
            dests[count++] = c;
            if (cc != 0) break;
            nf += sdf;
            nr += sdr;
        }
        return count;
    }

    /// @dev True if `white` has at least one legal move. Early-exits on the
    ///      first one found — only true terminal positions pay the full scan.
    function _hasLegalMove(uint8[64] memory b, bool white) internal pure returns (bool) {
        uint8 myC = white ? 1 : 2;
        uint8[64] memory dests;
        for (uint8 from = 0; from < 64; from++) {
            if (_color(b[from]) != myC) continue;
            uint256 n = _genDests(b, from, white, dests);
            for (uint256 i = 0; i < n; i++) {
                if (_moveIsLegal(b, from, dests[i], white, 0)) return true;
            }
        }
        return false;
    }

    // ---- Views for the client ----

    function getBoard() external view returns (uint8[64] memory) {
        uint8[64] memory b;
        for (uint256 i = 0; i < 64; i++) b[i] = board[i];
        return b;
    }

    function getPlayers(uint8 side) external view returns (address[] memory) {
        return side == SIDE_WHITE ? whitePlayers : blackPlayers;
    }

    function playerCount() external view returns (uint256) {
        return whitePlayers.length + blackPlayers.length;
    }

    /// @notice Whole match state in one call, so the client polls with a
    ///         single eth_call instead of many (no multicall3 on this chain).
    function getMatchState()
        external
        view
        returns (
            uint8 phase_,
            uint256 matchId_,
            uint8 sideToMove_,
            uint8[64] memory board_,
            address[] memory whitePlayers_,
            address[] memory blackPlayers_,
            uint8 lastFrom_,
            uint8 lastTo_,
            uint256 halfmoveClock_,
            uint256 plyCount_,
            uint256 moveDeadline_,
            uint256 pot_
        )
    {
        phase_ = uint8(phase);
        matchId_ = matchId;
        sideToMove_ = sideToMove;
        for (uint256 i = 0; i < 64; i++) board_[i] = board[i];
        whitePlayers_ = whitePlayers;
        blackPlayers_ = blackPlayers;
        lastFrom_ = lastMoveFrom;
        lastTo_ = lastMoveTo;
        halfmoveClock_ = halfmoveClock;
        plyCount_ = plyCount;
        moveDeadline_ = moveDeadline;
        pot_ = pot;
    }

    function lobbyOpen() external view returns (bool) {
        return phase == Phase.Lobby && block.timestamp < lobbyEndsAt;
    }
}
