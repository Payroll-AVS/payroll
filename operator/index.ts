import { ethers } from "ethers";
import * as dotenv from "dotenv";
const fs = require("fs");
const path = require("path");
dotenv.config();

// Check if the process.env object is empty
if (!Object.keys(process.env).length) {
  throw new Error("process.env object is empty");
}

// Setup environment variables
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
let chainId = 17000;

const avsDeploymentData = JSON.parse(
  fs.readFileSync(
    path.resolve(
      __dirname,
      `../contracts/deployments/hello-world/${chainId}.json`
    ),
    "utf8"
  )
);
const coreDeploymentData = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, `../contracts/deployments/core/${chainId}.json`),
    "utf8"
  )
);

const delegationManagerAddress = coreDeploymentData.addresses.delegation;
const avsDirectoryAddress = coreDeploymentData.addresses.avsDirectory;
const helloWorldServiceManagerAddress =
  avsDeploymentData.addresses.helloWorldServiceManager;
const ecdsaStakeRegistryAddress = avsDeploymentData.addresses.stakeRegistry;

// Load ABIs
const delegationManagerABI = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../abis/IDelegationManager.json"),
    "utf8"
  )
);
const ecdsaRegistryABI = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../abis/ECDSAStakeRegistry.json"),
    "utf8"
  )
);
const helloWorldServiceManagerABI = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../abis/PayrollServiceManager.json"),
    "utf8"
  )
);
const avsDirectoryABI = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../abis/IAVSDirectory.json"), "utf8")
);

// Initialize contract objects from ABIs
const delegationManager = new ethers.Contract(
  delegationManagerAddress,
  delegationManagerABI,
  wallet
);
const helloWorldServiceManager = new ethers.Contract(
  helloWorldServiceManagerAddress,
  helloWorldServiceManagerABI,
  wallet
);
const ecdsaRegistryContract = new ethers.Contract(
  ecdsaStakeRegistryAddress,
  ecdsaRegistryABI,
  wallet
);
const avsDirectory = new ethers.Contract(
  avsDirectoryAddress,
  avsDirectoryABI,
  wallet
);

const signAndRespondToTask = async (
  taskIndex: number,
  taskName: string,
  taskCreatedBlock: number,
  amount: ethers.BigNumberish,
  recipient: string,
  dueDate: number
) => {
  try {
    console.log(
      `Preparing to sign and respond to task ${taskIndex} with name "${taskName}"`
    );

    const message = `Hello, ${taskName}`;
    const messageHash = ethers.solidityPackedKeccak256(["string"], [message]);
    const messageBytes = ethers.getBytes(messageHash);
    const signature = await wallet.signMessage(messageBytes);

    console.log(`Checking Eligibility of Withdrawal...`);
    await new Promise((resolve, reject) =>
      setTimeout(() => {
        resolve(true);
      }, 1000)
    );

    console.log(
      `Signed message for task ${taskIndex}. Proceeding to respond...`
    );

    // Prepare signed task data
    const operators = [await wallet.getAddress()];
    const signatures = [signature];
    const signedTask = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]", "bytes[]", "uint32"],
      [
        operators,
        signatures,
        ethers.toBigInt((await provider.getBlockNumber()) - 1),
      ]
    );

    // Send transaction to respond to the task
    const tx = await helloWorldServiceManager.respondToTask(
      {
        name: taskName,
        taskCreatedBlock: taskCreatedBlock,
        amount: amount,
        recipient: recipient,
        dueDate: dueDate,
        isPaid: false,
      },
      taskIndex,
      signedTask
    );

    console.log(`Waiting for transaction to confirm...`);
    await tx.wait();
    console.log(
      `Responded to task ${taskIndex} successfully. with hash: ${tx.hash}`
    );

    // Mock send Ethereum to recipient
    await sendEthereum(recipient, amount);
    // Mark task as paid
    await markTaskAsPaid(taskIndex);
  } catch (error) {
    console.error(`Error responding to task ${taskIndex}:`, error);
  }
};

// Mock function to send Ethereum to the recipient
const sendEthereum = async (recipient: string, amount: ethers.BigNumberish) => {
  try {
    console.log(
      `Sending ${ethers.formatEther(amount)} ETH to recipient: ${recipient}`
    );
    const tx = await new Promise((resolve, reject) => {
      return setTimeout(() => {
        resolve(true);
      }, 1000);
    });
    console.log(`Waiting for Ethereum transfer to confirm...`);
    console.log(
      `Sent ${ethers.formatEther(amount)} ETH to ${recipient} successfully.`
    );
  } catch (error) {
    console.error("Error sending Ethereum:", error);
  }
};

// Call contract to mark the task as paid
const markTaskAsPaid = async (taskIndex: number) => {
  try {
    console.log(`Marking task ${taskIndex} as paid in contract...`);
    const tx = await helloWorldServiceManager.markTaskAsPaid(taskIndex);
    console.log(`Waiting for transaction to confirm...`);
    await tx.wait();
    console.log(`Task ${taskIndex} marked as paid successfully.`);
  } catch (error) {
    console.error(`Error marking task ${taskIndex} as paid:`, error);
  }
};

const registerOperator = async () => {
  try {
    console.log("Registering operator in Core EigenLayer contracts...");
    const tx1 = await delegationManager.registerAsOperator(
      {
        __deprecated_earningsReceiver: await wallet.address,
        delegationApprover: "0x0000000000000000000000000000000000000000",
        stakerOptOutWindowBlocks: 0,
      },
      ""
    );
    await tx1.wait();
    console.log("Operator registered in Core EigenLayer contracts.");

    const salt = ethers.hexlify(ethers.randomBytes(32));
    const expiry = Math.floor(Date.now() / 1000) + 3600;

    let operatorSignatureWithSaltAndExpiry = {
      signature: "",
      salt: salt,
      expiry: expiry,
    };

    console.log("Calculating operator digest hash for AVS registration...");
    const operatorDigestHash =
      await avsDirectory.calculateOperatorAVSRegistrationDigestHash(
        wallet.address,
        await helloWorldServiceManager.getAddress(),
        salt,
        expiry
      );
    console.log(`Operator Digest Hash: ${operatorDigestHash}`);

    console.log("Signing digest hash with operator's private key...");
    const operatorSigningKey = new ethers.SigningKey(process.env.PRIVATE_KEY!);
    const operatorSignedDigestHash =
      operatorSigningKey.sign(operatorDigestHash);

    operatorSignatureWithSaltAndExpiry.signature = ethers.Signature.from(
      operatorSignedDigestHash
    ).serialized;
    console.log("Registering Operator to AVS Registry contract...");

    const tx2 = await ecdsaRegistryContract.registerOperatorWithSignature(
      operatorSignatureWithSaltAndExpiry,
      wallet.address
    );
    await tx2.wait();
    console.log("Operator registered on AVS successfully.");
  } catch (error) {
    console.error("Error in registering as operator:", error);
  }
};

const monitorNewTasks = async () => {
  helloWorldServiceManager.on(
    "NewTaskCreated",
    async (taskIndex: number, task: any) => {
      console.log(`New task detected: Hello, ${task.name}`);
      await signAndRespondToTask(
        taskIndex,
        task.name,
        task.taskCreatedBlock,
        task.amount,
        task.recipient,
        task.dueDate
      );
    }
  );

  console.log("Monitoring for new tasks...");
};

const main = async () => {
  await registerOperator();
  monitorNewTasks().catch((error) => {
    console.error("Error monitoring tasks:", error);
  });
};

main().catch((error) => {
  console.error("Error in main function:", error);
});
