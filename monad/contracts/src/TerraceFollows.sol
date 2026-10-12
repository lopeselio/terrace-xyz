// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TerraceFollows
/// @notice The social graph: fans follow fans. Public and portable, so follows come back on any device
///         and the person you follow hears about it (the indexer turns events into notifications).
contract TerraceFollows {
    mapping(address => mapping(address => bool)) public isFollowing;
    mapping(address => uint32) public followers;
    mapping(address => uint32) public following;

    event Followed(address indexed follower, address indexed followee);
    event Unfollowed(address indexed follower, address indexed followee);

    error CannotFollowSelf();

    function follow(address who) external {
        if (who == msg.sender) revert CannotFollowSelf();
        if (isFollowing[msg.sender][who]) return;
        isFollowing[msg.sender][who] = true;
        followers[who] += 1;
        following[msg.sender] += 1;
        emit Followed(msg.sender, who);
    }

    function unfollow(address who) external {
        if (!isFollowing[msg.sender][who]) return;
        isFollowing[msg.sender][who] = false;
        followers[who] -= 1;
        following[msg.sender] -= 1;
        emit Unfollowed(msg.sender, who);
    }
}
