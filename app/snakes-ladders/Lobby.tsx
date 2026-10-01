"use client";

import React, { useEffect, useState } from "react";
import { Team, TEAM_META } from "./contract";
import { formatTokens } from "./useSnakesLadders";
import { Card, ChunkyButton, NAVY, BLUE } from "../components/cartoon";

interface LobbyProps {
  matchId: number;
  lobbyEndsAt: number;
  teamStakes: [bigint, bigint, bigint, bigint];
  teamPlayers: Record<Team, `0x${string}`[]>;
  pot: bigint;
  entryFee: bigint;
  tokenSymbol: string;
  tokenDecimals: number;
  hasJoined: boolean;
  myTeam: Team | null;
  myStake: bigint;
  isConnected: boolean;
  pending: string | null;
  onJoin: (team: Team, customAmount?: bigint, fast?: boolean) => void;
  onStart: () => void;
}

export function Lobby({
  matchId,
  lobbyEndsAt,
  teamStakes,
  teamPlayers,
  pot,
  entryFee,
  tokenSymbol,
  tokenDecimals,
  hasJoined,
  myTeam,
  myStake,
  isConnected,
  pending,
  onJoin,
  onStart,
}: LobbyProps) {
  const [selectedTeam, setSelectedTeam] = useState<Team>(Team.RED);
  const [stakeMultiplier, setStakeMultiplier] = useState<number>(1);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const totalPlayers =
    teamPlayers[Team.RED].length +
    teamPlayers[Team.BLUE].length +
    teamPlayers[Team.GREEN].length +
    teamPlayers[Team.YELLOW].length;

  const secondsLeft = Math.max(0, lobbyEndsAt - now);
  const canStart = secondsLeft === 0 && totalPlayers >= 2;

  const calculatedStake = entryFee * BigInt(stakeMultiplier);

  return (
    <div className="space-y-6">
      {/* Lobby Header info */}
      <Card className="text-center">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 pb-4" style={{ borderColor: NAVY }}>
          <div className="text-left">
            <span className="font-pixel text-[9px] uppercase tracking-widest text-zinc-500">
              LOBBY #{matchId}
            </span>
            <div className="font-pixel text-lg" style={{ color: NAVY }}>
              POT: {formatTokens(pot, tokenDecimals)} {tokenSymbol}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border-2 px-3 py-1.5 text-center" style={{ borderColor: NAVY }}>
              <span className="text-[10px] font-bold text-zinc-500">PLAYERS</span>
              <div className="font-pixel text-xs text-zinc-900">{totalPlayers}</div>
            </div>

            <div className="rounded-xl border-2 px-3 py-1.5 text-center" style={{ borderColor: NAVY }}>
              <span className="text-[10px] font-bold text-zinc-500">START IN</span>
              <div className="font-pixel text-xs" style={{ color: secondsLeft > 0 ? BLUE : "#16a34a" }}>
                {secondsLeft > 0 ? `${secondsLeft}s` : "READY"}
              </div>
            </div>
          </div>
        </div>

        {/* 4 Team Selection Cards */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-left">
          {([Team.RED, Team.BLUE, Team.GREEN, Team.YELLOW] as Team[]).map((team) => {
            const meta = TEAM_META[team];
            const stake = teamStakes[team];
            const players = teamPlayers[team];
            const isSelected = selectedTeam === team;
            const isMine = hasJoined && myTeam === team;

            return (
              <button
                key={meta.name}
                type="button"
                disabled={hasJoined}
                onClick={() => setSelectedTeam(team)}
                className={`relative flex flex-col justify-between rounded-2xl border-[3px] p-3.5 transition-all text-left ${
                  isSelected ? "scale-[1.02] shadow-md" : "hover:border-zinc-500 opacity-90"
                } ${isMine ? "ring-2 ring-emerald-500" : ""}`}
                style={{
                  borderColor: isSelected ? meta.border : NAVY,
                  background: isSelected ? meta.bgLight : "#ffffff",
                  boxShadow: isSelected ? `4px 4px 0 ${meta.border}` : `3px 3px 0 ${NAVY}`,
                }}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xl">{meta.glyph}</span>
                    <span
                      className="font-pixel rounded-full px-2 py-0.5 text-[8px] text-white"
                      style={{ background: meta.color }}
                    >
                      {meta.name}
                    </span>
                  </div>

                  <div className="font-pixel mt-2 text-xs" style={{ color: NAVY }}>
                    {meta.label}
                  </div>
                </div>

                <div className="mt-4 border-t border-zinc-200 pt-2 text-[10px]">
                  <div className="flex justify-between text-zinc-600">
                    <span>Pool Stake:</span>
                    <span className="font-bold text-zinc-900">
                      {formatTokens(stake, tokenDecimals)}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-600 mt-0.5">
                    <span>Roster:</span>
                    <span className="font-bold text-zinc-900">{players.length} racers</span>
                  </div>
                </div>

                {isMine && (
                  <div className="absolute top-2 right-2 rounded-full bg-emerald-500 px-2 py-0.5 font-pixel text-[8px] text-white">
                    JOINED
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Joining Controls */}
        {!hasJoined ? (
          <div className="mt-6 space-y-4">
            {/* Stake Multiplier */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="font-pixel text-[10px]" style={{ color: NAVY }}>
                YOUR STAKE:
              </span>
              {[1, 2, 5, 10].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setStakeMultiplier(m)}
                  className={`font-pixel rounded-xl border-2 px-3 py-1.5 text-[10px] transition ${
                    stakeMultiplier === m
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "bg-white text-zinc-800 border-zinc-300 hover:border-zinc-600"
                  }`}
                >
                  {m}x ({formatTokens(entryFee * BigInt(m), tokenDecimals)} {tokenSymbol})
                </button>
              ))}
            </div>

            {/* Join buttons */}
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <ChunkyButton
                onClick={() => onJoin(selectedTeam, calculatedStake, true)}
                disabled={!isConnected || pending !== null}
                className="bg-emerald-600 hover:bg-emerald-500"
              >
                {pending === "joinFast" ? "JOINING FAST…" : "⚡ FAST JOIN (ZERO POP-UPS)"}
              </ChunkyButton>

              <ChunkyButton
                onClick={() => onJoin(selectedTeam, calculatedStake, false)}
                disabled={!isConnected || pending !== null}
                className="bg-zinc-800"
              >
                {pending === "join" ? "JOINING…" : "STANDARD JOIN"}
              </ChunkyButton>
            </div>
            <p className="text-[10px] font-medium text-zinc-500">
              * Fast Join authorizes a browser session key: 1 signature at join, then 0 wallet confirmations to roll!
            </p>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border-2 bg-emerald-50 p-4 text-center border-emerald-300">
            <span className="font-pixel text-xs text-emerald-800">
              ✓ YOU ARE ON {TEAM_META[myTeam!].name} ({formatTokens(myStake, tokenDecimals)} {tokenSymbol} staked)
            </span>
            <p className="mt-1 text-xs text-emerald-700">
              Waiting for match countdown to finish or other teams to join.
            </p>
          </div>
        )}

        {/* Start Match Trigger */}
        <div className="mt-6 border-t-2 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3" style={{ borderColor: NAVY }}>
          <div className="text-left text-xs text-zinc-600">
            {secondsLeft > 0 ? (
              <span>Lobby closes in <strong className="text-zinc-900">{secondsLeft}s</strong></span>
            ) : totalPlayers < 2 ? (
              <span className="text-amber-600 font-bold">Needs at least 2 teams to start</span>
            ) : (
              <span className="text-emerald-600 font-bold">Lobby closed — ready to start!</span>
            )}
          </div>

          <ChunkyButton
            onClick={onStart}
            disabled={!canStart || pending !== null}
          >
            {pending === "start" ? "STARTING…" : "🏁 START RACE"}
          </ChunkyButton>
        </div>
      </Card>
    </div>
  );
}
