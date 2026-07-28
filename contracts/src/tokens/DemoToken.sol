// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DemoERC20} from "./DemoERC20.sol";

/// @notice 18-decimal demo asset deployed as GOOD, BAD, or BAIT.
contract DemoToken is DemoERC20 {
    constructor(string memory name_, string memory symbol_, address owner_)
        DemoERC20(name_, symbol_, 18, owner_)
    {}
}
