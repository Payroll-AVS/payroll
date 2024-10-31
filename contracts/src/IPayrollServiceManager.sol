// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

interface IPayrollServiceManager {
    event NewTaskCreated(uint32 indexed taskIndex, Task task);
    event TaskResponded(uint32 indexed taskIndex, Task task, address operator);
    event TaskMarkedPaid(
        uint32 indexed taskIndex,
        address recipient,
        uint256 amount
    );

    struct Task {
        string name;
        uint32 taskCreatedBlock;
        uint256 amount;
        address payable recipient;
        uint256 dueDate;
        bool isPaid;
    }

    function latestTaskNum() external view returns (uint32);

    function allTaskHashes(uint32 taskIndex) external view returns (bytes32);

    function allTaskResponses(
        address operator,
        uint32 taskIndex
    ) external view returns (bytes memory);

    function createNewTask(
        string memory name,
        uint256 amount,
        address payable recipient,
        uint256 dueDate
    ) external returns (Task memory);

    function respondToTask(
        Task calldata task,
        uint32 referenceTaskIndex,
        bytes calldata signature
    ) external;

    // New method to mark a task as paid
    function markTaskAsPaid(uint32 taskIndex) external;

    // Get unpaid tasks for a specific recipient
    function getUnpaidTasks(
        address recipient
    ) external view returns (Task[] memory);

    // Retrieve a task's details by index
    function getTaskDetails(
        uint32 taskIndex
    ) external view returns (Task memory);
}
