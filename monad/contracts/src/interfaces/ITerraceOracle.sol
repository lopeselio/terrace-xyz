// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Answer codes shared by every Terrace contract.
library Answer {
    uint8 internal constant OPEN = 0; // no answer yet
    uint8 internal constant YES = 1;
    uint8 internal constant NO = 2;
    uint8 internal constant VOID = 3; // refund everyone

    uint8 internal constant FIXTURE_PENDING = 0;
    uint8 internal constant FIXTURE_FINAL = 1;
    uint8 internal constant FIXTURE_VOID = 2;
}

/// @notice Read side of TerraceOracle used by markets, parlays, matchups and leagues.
interface ITerraceOracle {
    function outcomeOf(uint256 questionId) external view returns (uint8);
    function closeTimeOf(uint256 questionId) external view returns (uint64);
    function fixtureOfQuestion(uint256 questionId) external view returns (uint256);
    function questionExists(uint256 questionId) external view returns (bool);

    function fixtureExists(uint256 fixtureId) external view returns (bool);
    function fixtureKickoff(uint256 fixtureId) external view returns (uint64);
    /// @return state Answer.FIXTURE_PENDING / FIXTURE_FINAL / FIXTURE_VOID
    function fixtureResult(uint256 fixtureId) external view returns (uint8 state, uint8 homeGoals, uint8 awayGoals);
}

/// @notice Contracts that accept CRE report kinds routed through TerraceOracle.
interface ITerraceReportHandler {
    function handleReport(uint8 kind, bytes calldata payload) external;
}
