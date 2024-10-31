import { ethers } from "ethers";
import * as dotenv from "dotenv";
const fs = require("fs");
const path = require("path");
dotenv.config();

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
const helloWorldServiceManagerAddress =
  avsDeploymentData.addresses.helloWorldServiceManager;
const helloWorldServiceManagerABI = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../abis/PayrollServiceManager.json"),
    "utf8"
  )
);
const helloWorldServiceManager = new ethers.Contract(
  helloWorldServiceManagerAddress,
  helloWorldServiceManagerABI,
  wallet
);

// Function to generate random names
function generateRandomName(): string {
  const adjectives = ["Quick", "Lazy", "Sleepy", "Noisy", "Hungry"];
  const nouns = ["Fox", "Dog", "Cat", "Mouse", "Bear"];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective}${noun}${Math.floor(Math.random() * 1000)}`;
}

// Function to generate a random amount (simulating payroll amounts)
function generateRandomAmount(): ethers.BigNumberish {
  return ethers.parseEther((Math.random() * 5 + 1).toFixed(2)); // Random ETH value between 1 and 6 ETH
}

// Function to generate a random recipient address
function generateRandomRecipient(): string {
  return ethers.Wallet.createRandom().address;
}

// Function to generate a future timestamp as due date
function generateDueDate(): number {
  return Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days from now
}

async function createNewTask(
  taskName: string,
  amount: ethers.BigNumberish,
  recipient: string,
  dueDate: number
) {
  try {
    const tx = await helloWorldServiceManager.createNewTask(
      taskName,
      amount,
      recipient,
      dueDate
    );
    const receipt = await tx.wait();
    console.log(
      `Task created successfully with transaction hash: ${receipt.hash}`
    );
  } catch (error) {
    console.error("Error creating new task:", error);
  }
}

// Function to create a new task with random parameters every 24 seconds
const randomName = generateRandomName();
const randomAmount = generateRandomAmount();
const randomRecipient = generateRandomRecipient();
const dueDate = generateDueDate();

console.log(`Creating new task with parameters: 
            Name: ${randomName}, 
            Amount: ${ethers.formatEther(randomAmount)} ETH, 
            Recipient: ${randomRecipient}, 
            Due Date: ${new Date(dueDate * 1000).toLocaleString()}`);

createNewTask(randomName, randomAmount, randomRecipient, dueDate);
