// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/tokens/MockUSDC.sol";
import {DemoToken} from "../src/tokens/DemoToken.sol";
import {DemoERC20} from "../src/tokens/DemoERC20.sol";

contract DemoTokensTest is Test {
    address internal owner = address(this);
    address internal user = address(0xBEEF);

    function test_mockUsdc_decimals() public {
        MockUSDC usdc = new MockUSDC(owner);
        assertEq(usdc.decimals(), 6);
        assertEq(usdc.symbol(), "USDC");
    }

    function test_mockUsdc_mint() public {
        MockUSDC usdc = new MockUSDC(owner);
        usdc.mint(user, 1_000_000);
        assertEq(usdc.balanceOf(user), 1_000_000);
    }

    function test_mockUsdc_mint_revertsForNonOwner() public {
        MockUSDC usdc = new MockUSDC(owner);
        vm.prank(user);
        vm.expectRevert(DemoERC20.Unauthorized.selector);
        usdc.mint(user, 1);
    }

    function test_demoToken_transfer() public {
        DemoToken good = new DemoToken("Good Token", "GOOD", owner);
        good.mint(user, 100 ether);
        vm.prank(user);
        good.transfer(owner, 40 ether);
        assertEq(good.balanceOf(user), 60 ether);
        assertEq(good.balanceOf(owner), 40 ether);
    }
}
