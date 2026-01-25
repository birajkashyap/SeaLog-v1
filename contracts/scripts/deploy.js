const hre = require('hardhat');

async function main() {
  console.log('Deploying SeaLogAnchor contract...');

  const SeaLogAnchor = await hre.ethers.getContractFactory('SeaLogAnchor');
  const sealogAnchor = await SeaLogAnchor.deploy();

  await sealogAnchor.waitForDeployment();

  const address = await sealogAnchor.getAddress();

  console.log(`SeaLogAnchor deployed to: ${address}`);
  console.log('\nUpdate your .env file with:');
  console.log(`CONTRACT_ADDRESS=${address}`);

  // Wait for a few block confirmations
  console.log('\nWaiting for block confirmations...');
  await sealogAnchor.deploymentTransaction().wait(6);

  console.log('Deployment confirmed!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
