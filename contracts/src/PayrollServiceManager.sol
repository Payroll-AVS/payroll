// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {ECDSAServiceManagerBase} from "@eigenlayer-middleware/src/unaudited/ECDSAServiceManagerBase.sol";
import {ECDSAStakeRegistry} from "@eigenlayer-middleware/src/unaudited/ECDSAStakeRegistry.sol";
import {IServiceManager} from "@eigenlayer-middleware/src/interfaces/IServiceManager.sol";
import {ECDSAUpgradeable} from "@openzeppelin-upgrades/contracts/utils/cryptography/ECDSAUpgradeable.sol";
import {IERC1271Upgradeable} from "@openzeppelin-upgrades/contracts/interfaces/IERC1271Upgradeable.sol";
import {IPayrollServiceManager} from "./IPayrollServiceManager.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@eigenlayer/contracts/interfaces/IRewardsCoordinator.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

/**
 * @title Payroll Service Manager for managing payroll-related tasks.
 */
contract PayrollServiceManager is
    ECDSAServiceManagerBase,
    IPayrollServiceManager
{
    using ECDSAUpgradeable for bytes32;

    uint32 public latestTaskNum;

    // Mapping of task indices to task hashes
    mapping(uint32 => bytes32) public allTaskHashes;

    // Mapping of responses by operator and task index
    mapping(address => mapping(uint32 => bytes)) public allTaskResponses;

    // Mapping for storing task details by index
    mapping(uint32 => Task) public taskDetails;

    modifier onlyOperator() {
        require(
            ECDSAStakeRegistry(stakeRegistry).operatorRegistered(msg.sender),
            "Operator must be the caller"
        );
        _;
    }

    constructor(
        address _avsDirectory,
        address _stakeRegistry,
        address _rewardsCoordinator,
        address _delegationManager
    )
        ECDSAServiceManagerBase(
            _avsDirectory,
            _stakeRegistry,
            _rewardsCoordinator,
            _delegationManager
        )
    {}

    /* FUNCTIONS */

    function createNewTask(
        string memory name,
        uint256 amount,
        address payable recipient,
        uint256 dueDate
    ) external returns (Task memory) {
        Task memory newTask = Task({
            name: name,
            taskCreatedBlock: uint32(block.number),
            amount: amount,
            recipient: recipient,
            dueDate: dueDate,
            isPaid: false
        });

        // Store the hash of the task onchain and emit event
        allTaskHashes[latestTaskNum] = keccak256(abi.encode(newTask));
        taskDetails[latestTaskNum] = newTask;
        emit NewTaskCreated(latestTaskNum, newTask);

        latestTaskNum += 1;
        return newTask;
    }

    function respondToTask(
        Task calldata task,
        uint32 referenceTaskIndex,
        bytes calldata signature
    ) external onlyOperator {
        require(
            keccak256(abi.encode(task)) == allTaskHashes[referenceTaskIndex],
            "Supplied task does not match the recorded task"
        );
        require(
            allTaskResponses[msg.sender][referenceTaskIndex].length == 0,
            "Operator has already responded to the task"
        );

        // Validate the signature
        bytes32 messageHash = keccak256(abi.encodePacked("Hello, ", task.name));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        bytes4 magicValue = IERC1271Upgradeable.isValidSignature.selector;

        require(
            magicValue ==
                ECDSAStakeRegistry(stakeRegistry).isValidSignature(
                    ethSignedMessageHash,
                    signature
                ),
            "Invalid signature"
        );

        allTaskResponses[msg.sender][referenceTaskIndex] = signature;
        emit TaskResponded(referenceTaskIndex, task, msg.sender);
    }

    function markTaskAsPaid(uint32 taskIndex) external onlyOperator {
        Task storage task = taskDetails[taskIndex];
        require(!task.isPaid, "Task is already marked as paid");
        task.isPaid = true;

        emit TaskMarkedPaid(taskIndex, task.recipient, task.amount);
    }

    function getUnpaidTasks(
        address recipient
    ) external view returns (Task[] memory) {
        uint256 count = 0;

        // First, calculate the number of unpaid tasks for allocation
        for (uint32 i = 0; i < latestTaskNum; i++) {
            if (
                taskDetails[i].recipient == recipient && !taskDetails[i].isPaid
            ) {
                count++;
            }
        }

        Task[] memory unpaidTasks = new Task[](count);
        uint256 index = 0;

        // Populate the unpaid tasks
        for (uint32 i = 0; i < latestTaskNum; i++) {
            if (
                taskDetails[i].recipient == recipient && !taskDetails[i].isPaid
            ) {
                unpaidTasks[index] = taskDetails[i];
                index++;
            }
        }

        return unpaidTasks;
    }

    function getTaskDetails(
        uint32 taskIndex
    ) external view returns (Task memory) {
        return taskDetails[taskIndex];
    }
}
