const mineflayer = require("mineflayer")
const data = require("minecraft-data")("1.21.1")
const fs = require("fs")
const { Movements, goals } = require("mineflayer-pathfinder")
const { Vec3 } = require("vec3")
const pathfinder = require("mineflayer-pathfinder").pathfinder

// Configuration
const config = require("./config.json")

// Bot state variables
let bot = null
const shulkerIDs = [522, 523, 524, 525, 526, 527, 528, 529, 530, 531, 532, 533, 534, 535, 536, 537, 538]

let itemDictionary = {}
const shulkerChestBlock = {
  x: null,
  y: null,
  z: null,
}

const shulkerBlock = {
  x: null,
  y: null,
  z: null,
}

let referenceKit = []
let itemShulker = {}
let firstRun = true

const shulkerPositions = []
let emptyShulkerCount = 0
let placedShulkers = 0
let brokenShulkers = 0

// Add a flag to prevent duplicate reference kit messages at the top with other state variables
// Remove this line near the top of the file:
// let referenceKitAlreadySet = false;

// Helper functions
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isDoubleChest(chestBlock) {
  return chestBlock._properties.type === "left" || chestBlock._properties.type === "right"
}

function getAdjacentChest(chestBlock) {
  const facing = chestBlock.metadata === 2 ? 1 : -1
  const adjacentPos = chestBlock.position.offset(facing, 0, 0)

  const adjacentBlock = bot.blockAt(adjacentPos)

  if (adjacentBlock && adjacentBlock.type === bot.registry.blocksByName.chest.id) {
    return adjacentBlock
  }

  return null
}

// Fix the moveToChest function to handle goal changes better
async function moveToChest(chestBlock) {
  try {
    console.log(`Moving to chest at ${chestBlock.position.x}, ${chestBlock.position.y}, ${chestBlock.position.z}`)

    // Cancel any existing pathfinding before starting a new one
    bot.pathfinder.setGoal(null)
    await sleep(100) // Give time for the previous goal to clear

    // First try to get close to the chest
    const goal = new goals.GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 2)

    try {
      await bot.pathfinder.goto(goal)
    } catch (pathError) {
      console.log(`Initial pathfinding failed: ${pathError.message}. Trying alternative approach.`)
      // If the first attempt fails, try a different approach
    }

    // Check if we're close enough
    const distance = bot.entity.position.distanceTo(chestBlock.position)
    if (distance > 4) {
      console.log(`Still ${distance} blocks away from chest. Trying to get closer.`)

      // Cancel the previous goal and set a new one
      bot.pathfinder.setGoal(null)
      await sleep(100)

      // Try a different approach - get as close as possible
      const closeGoal = new goals.GoalNear(
        chestBlock.position.x,
        chestBlock.position.y,
        chestBlock.position.z,
        Math.min(Math.floor(distance) - 1, 2), // Don't go too far back
      )

      try {
        await bot.pathfinder.goto(closeGoal)
      } catch (closePathError) {
        console.log(`Second pathfinding attempt failed: ${closePathError.message}`)
        // If we still can't get there, check if we're close enough to interact
      }

      // Check again
      const newDistance = bot.entity.position.distanceTo(chestBlock.position)
      if (newDistance > 4) {
        throw new Error(`Cannot reach chest. Distance: ${newDistance}`)
      }
    }

    // Look at the chest
    bot.lookAt(chestBlock.position.offset(0.5, 0.5, 0.5))
    await sleep(100)
  } catch (err) {
    console.error("Error during pathfinding:", err)
    throw err
  }
}

async function openChestAndStoreItems(chestBlock) {
  try {
    const chest = await bot.openContainer(chestBlock)

    const shulker = chest.containerItems().find((item) => item.name.includes("shulker"))

    if (!shulker) {
      console.log("No Shulker box found in this chest. Skipping...")
      await chest.close()
      return
    }

    const containerData = shulker.componentMap.get("container").data.contents

    for (let i = 0; i < containerData.length; i++) {
      const item = containerData[i]
      if (item.itemId) {
        const chestKey = `${chestBlock.position.x},${chestBlock.position.y},${chestBlock.position.z}`
        if (!itemDictionary[chestKey]) {
          itemDictionary[chestKey] = []
        }
        itemDictionary[chestKey].push(item.itemId)
        console.log(`Item ID: ${item.itemId} added to chest at ${chestKey}`)
        break
      }
    }

    await chest.close()
  } catch (err) {
    console.error("Error handling shulker:", err)
  }
}

// Fix the sequence function to handle first run better
async function sequence() {
  try {
    console.log("Starting sequence with reference kit:", referenceKit)

    // Check if we have a valid reference kit before proceeding
    if (!referenceKit || referenceKit.length === 0) {
      console.error("Reference kit is empty or not set! Attempting to read from reference chest...")
      try {
        await readReference()
        console.log("After reading reference, kit contains:", referenceKit)
      } catch (refError) {
        console.error("Error reading reference:", refError)
        return "Error: Reference kit is empty and could not read from reference chest"
      }

      // Check again after trying to read
      if (!referenceKit || referenceKit.length === 0) {
        return "Error: Reference kit is empty or not set"
      }
    }

    if (firstRun) {
      console.log("First run, scanning chests...")
      try {
        await scanChests()
      } catch (scanError) {
        console.error("Error during chest scanning:", scanError)
        // Continue even if scanning fails
      }
      firstRun = false
    }

    await placeShulkers()

    // Log the reference kit again to verify it's still set correctly
    console.log("Before processing items, reference kit contains:", referenceKit)

    for (const item of referenceKit) {
      console.log(`Processing item: ${item}`)

      try {
        const count = 1
        const itemName = item
        await grabItem(count, itemName)
        await fillShulkers()
        await breakItemShulker()
      } catch (itemError) {
        console.error(`Error processing item ${item}:`, itemError)
        // Continue with next item even if this one fails
      }
    }

    return await breakShulkers()
  } catch (error) {
    console.error("Error in sequence:", error)
    return `Sequence failed: ${error.message}`
  }
}

async function placeShulkers() {
  emptyShulkerCount = 0
  await bot.pathfinder.goto(new goals.GoalNear(config.shulkerChest.x, config.shulkerChest.y, config.shulkerChest.z, 2))

  try {
    const shulkerChestContainer = await bot.openContainer(
      bot.blockAt(new Vec3(config.shulkerChest.x, config.shulkerChest.y, config.shulkerChest.z)),
    )

    for (const slot of shulkerChestContainer.slots) {
      if (slot && emptyShulkerCount < 27) {
        try {
          await shulkerChestContainer.withdraw(slot.type, null, slot.count)
          emptyShulkerCount += 1
          await sleep(150)
        } catch (error) {
          console.log(`Failed to withdraw item: ${error.message}`)
        }
      }
    }
    shulkerChestContainer.close()

    const positions = bot.findBlocks({
      matching: (block) => block.name === config.shulkerBlock,
      maxDistance: config.searchRange,
      count: emptyShulkerCount,
    })

    if (positions.length === 0) {
      return "Could not find anywhere to place shulkers."
    }

    for (const pos of positions) {
      const placePosition = bot.blockAt(pos).position.offset(0, 1, 0)

      if (bot.blockAt(placePosition).boundingBox !== "empty") {
        console.log(`Skipping ${placePosition} - Block already exists.`)
        continue
      }

      await bot.pathfinder.goto(new goals.GoalNear(placePosition.x, placePosition.y + 1, placePosition.z, 2))
      shulkerPositions.push({ x: placePosition.x, y: placePosition.y, z: placePosition.z })

      try {
        const blockToPlace = bot.inventory.items().find((item) => shulkerIDs.includes(item.type))
        if (!blockToPlace) {
          return "No shulkers in inventory."
        }

        await bot.equip(blockToPlace, "hand")
        await bot.placeBlock(bot.blockAt(pos), { x: 0, y: 1, z: 0 })
        placedShulkers += 1
      } catch (err) {
        console.log(`Failed to place block at ${placePosition}: ${err.message}`)
      }
    }
    const placedMessage = `Placed ${placedShulkers} shulkers.`

    if (emptyShulkerCount - placedShulkers > 0) {
      await bot.pathfinder.goto(
        new goals.GoalNear(config.shulkerChest.x, config.shulkerChest.y, config.shulkerChest.z, 2),
      )
      const shulkerChestContainer = await bot.openContainer(
        bot.blockAt(new Vec3(config.shulkerChest.x, config.shulkerChest.y, config.shulkerChest.z)),
      )

      let remainingShulkers = emptyShulkerCount - placedShulkers
      while (remainingShulkers > 0) {
        for (const slot of bot.inventory.items()) {
          if (shulkerIDs.includes(slot.type)) {
            try {
              await shulkerChestContainer.deposit(slot.type, null, 1)
              remainingShulkers -= 1
              await sleep(150)
            } catch (error) {
              console.error(`Error depositing item: ${error.message}`)
            }
          }
        }
      }
      shulkerChestContainer.close()
    }
    return placedMessage
  } catch (error) {
    console.log("An error occurred: " + error.message)
    return `Error: ${error.message}`
  }
}

async function fillShulkers() {
  await bot.pathfinder.goto(new goals.GoalNear(itemShulker.x, itemShulker.y, itemShulker.z, 2))

  try {
    const itemContainer = await bot.openContainer(bot.blockAt(new Vec3(itemShulker.x, itemShulker.y, itemShulker.z)))

    let itemsWithdrawn = 0
    let itemType
    let itemCount
    for (const slot of itemContainer.slots) {
      if (slot && itemsWithdrawn < placedShulkers) {
        try {
          await itemContainer.withdraw(slot.type, null, slot.count)

          itemType = slot.type
          itemCount = slot.count

          itemsWithdrawn += 1
          if (itemsWithdrawn >= placedShulkers) {
            break
          }
          await sleep(150)
        } catch (error) {
          console.log(`Failed to withdraw item: ${error.message}`)
        }
      }
    }
    itemContainer.close()
    await sleep(250) // Add a small delay after closing the container

    let fillCount = 0
    const failedPositions = []

    // Process each shulker position
    for (const pos of shulkerPositions) {
      console.log(`Attempting to fill shulker at ${pos.x}, ${pos.y}, ${pos.z}`)

      // Use a more precise goal to get closer to the shulker
      try {
        // First try to get very close to the shulker
        await bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 1))

        // Look at the shulker to ensure proper interaction
        const shulkerBlock = bot.blockAt(new Vec3(pos.x, pos.y, pos.z))
        if (!shulkerBlock) {
          console.log(`No block found at ${pos.x}, ${pos.y}, ${pos.z}`)
          failedPositions.push(pos)
          continue
        }

        bot.lookAt(shulkerBlock.position.offset(0.5, 0.5, 0.5))
        await sleep(100)

        // Try to open the container with a timeout
        let kitContainer
        try {
          const openPromise = bot.openContainer(shulkerBlock)
          // Set a timeout for opening the container
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout opening container")), 5000),
          )

          kitContainer = await Promise.race([openPromise, timeoutPromise])
        } catch (error) {
          console.log(`Failed to open shulker at ${pos.x}, ${pos.y}, ${pos.z}: ${error.message}`)
          failedPositions.push(pos)
          continue
        }

        // Try to deposit the item
        try {
          await kitContainer.deposit(itemType, null, itemCount)
          fillCount += 1
          console.log(`Successfully filled shulker at ${pos.x}, ${pos.y}, ${pos.z}`)
        } catch (error) {
          console.log(`Failed to deposit item in shulker at ${pos.x}, ${pos.y}, ${pos.z}: ${error.message}`)
        }

        // Close the container
        try {
          kitContainer.close()
          await sleep(250) // Add a delay after closing
        } catch (closeError) {
          console.log(`Error closing container: ${closeError.message}`)
        }
      } catch (pathError) {
        console.log(`Pathfinding error for shulker at ${pos.x}, ${pos.y}, ${pos.z}: ${pathError.message}`)
        failedPositions.push(pos)
      }
    }

    // Report on failed positions
    if (failedPositions.length > 0) {
      console.log(`Failed to fill ${failedPositions.length} shulkers`)
    }

    return `Filled ${fillCount} shulkers with ${itemCount} items each. Failed to fill ${failedPositions.length} shulkers.`
  } catch (error) {
    console.log("An error occurred: " + error.message)
    return `Error: ${error.message}`
  }
}

async function breakShulkers() {
  for (const pos of shulkerPositions) {
    bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z))
    try {
      const breakTool = bot.inventory
        .items()
        .find((item) => item.name === "diamond_pickaxe" || item.name === "netherite_pickaxe")
      if (breakTool) {
        bot.equip(breakTool, "hand")
      }

      await bot.dig(bot.blockAt(new Vec3(pos.x, pos.y, pos.z)))
      brokenShulkers += 1
    } catch (error) {
      console.log(`Failed to break shulker: ${error}`)
    }
  }
  const brokeMessage = `Broke ${brokenShulkers} shulkers`

  await sleep(500)

  const floatingItems = Object.values(bot.entities).filter((entity) => entity.name && entity.displayName === "Item")
  for (const item of floatingItems) {
    const { x, y, z } = item.position
    await bot.pathfinder.goto(new goals.GoalBlock(x, y, z))
  }

  await bot.pathfinder.goto(new goals.GoalNear(config.kitChest.x, config.kitChest.y, config.kitChest.z, 2))
  try {
    const kitChestContainer = await bot.openContainer(
      bot.blockAt(new Vec3(config.kitChest.x, config.kitChest.y, config.kitChest.z)),
    )

    while (brokenShulkers > 0) {
      for (const slot of bot.inventory.items()) {
        if (shulkerIDs.includes(slot.type)) {
          try {
            await kitChestContainer.deposit(slot.type, null, 1)
            brokenShulkers -= 1
            await sleep(150)
          } catch (error) {
            console.log(`Error depositing item: ${error}`)
          }
        }
      }
    }
    kitChestContainer.close()
    return brokeMessage
  } catch (error) {
    console.log(`An error occurred: ${error}`)
    return `Error: ${error}`
  }
}

async function grabItem(count, itemName) {
  const itemDictionaryData = fs.readFileSync("itemDictionary.json", "utf8")
  itemDictionary = JSON.parse(itemDictionaryData)

  const stackAmount = data.itemsArray.find((item) => item.name === itemName).stackSize
  const itemId = data.itemsArray.find((item) => item.name === String(itemName)).id

  let chestCoordinates = null
  for (const [coordinates, items] of Object.entries(itemDictionary)) {
    if (items.includes(itemId)) {
      chestCoordinates = coordinates
      break
    }
  }

  if (chestCoordinates) {
    const [x, y, z] = chestCoordinates.split(",").map(Number)
    const chestPosition = new Vec3(x, y, z)
    const chestBlock = bot.blockAt(chestPosition)

    await moveToChest(chestBlock)

    const chest = await bot.openContainer(chestBlock)

    const shulkerItem = chest.containerItems().find((item) => item.name.includes("shulker"))

    if (!shulkerItem) {
      console.log("No Shulker box found in the chest.")
      await chest.close()
      return `No Shulker box found in the chest at ${chestCoordinates}`
    }

    console.log(`Found Shulker box: ${shulkerItem.name}`)

    const containerData = shulkerItem.componentMap.get("container").data.contents
    if (containerData.length * stackAmount >= count) {
      console.log(`Withdrawing 1 Shulker box of type ${shulkerItem.name}`)
      await chest.withdraw(shulkerItem.type, null, 1)

      await chest.close()
      console.log("Chest closed after withdrawing Shulker box.")

      await bot.equip(shulkerItem, "hand")

      function isValidPlacement(block) {
        if (!block || !block.position) {
          console.log("Block or block position is null. Invalid placement position.")
          return false
        }

        const belowBlock = bot.blockAt(block.position.offset(0, -1, 0))
        if (!belowBlock) {
          console.log("No block found below the given position.")
          return false
        }

        return (
          belowBlock.boundingBox !== "empty" && // Block below is solid
          block.boundingBox === "empty" // Placement position is empty
        )
      }

      let placeBlock = bot.blockAt(bot.entity.position.offset(1, 0, 0))

      if (!isValidPlacement(placeBlock)) {
        console.log("Block in front is not valid for placement. Searching for a nearby valid block...")

        const nearbyBlocks = bot.findBlocks({
          matching: (block) => isValidPlacement(block),
          maxDistance: 5, // Search within 5 blocks
          count: 1, // Find only 1 valid block
        })

        if (nearbyBlocks.length > 0) {
          placeBlock = bot.blockAt(nearbyBlocks[0])
          console.log(`Found valid block at ${placeBlock.position}`)
        } else {
          console.log("No valid block found nearby.")
          return "No valid block found nearby for shulker placement"
        }
      }

      try {
        await bot.placeBlock(placeBlock, new Vec3(0, 1, 0))
        await sleep(100)

        if (placeBlock && placeBlock.name === "shulker_box") {
          console.log(`Successfully placed Shulker box at ${placeBlock.position}`)
        } else {
          console.log("Failed to place Shulker box: Block was not placed.")
          return "Failed to place Shulker box: Block was not placed"
        }
      } catch (error) {
        if (error.message.includes("Event blockUpdate") && error.message.includes("did not fire within timeout")) {
          // Ignore timeout errors
        } else {
          console.error(`Failed to place Shulker box: ${error.message}`)
          return `Failed to place Shulker box: ${error.message}`
        }
      }

      itemShulker = {
        x: placeBlock.position.x,
        y: placeBlock.position.y,
        z: placeBlock.position.z,
      }

      const shulkerContainer = await bot.openContainer(bot.blockAt(placeBlock.position))
      const shulkerContents = shulkerContainer.containerItems()

      if (shulkerContents.length > 0) {
        const firstItem = shulkerContents[0].name
        console.log(`Shulker contains: ${firstItem}`)
        shulkerContainer.close()
        return `Successfully placed Shulker box containing ${firstItem} at ${placeBlock.position}`
      } else {
        console.log("Shulker is empty.")
        shulkerContainer.close()
        return "Shulker is empty"
      }
    } else {
      console.log("Not enough items in the Shulker box.")
      await chest.close()
      return "Not enough items in the Shulker box"
    }
  } else {
    console.log(`Item with ID ${itemId} not found in any chests.`)
    return `Item ${itemName} (ID: ${itemId}) not found in any chests`
  }
}

async function breakItemShulker() {
  await bot.pathfinder.goto(new goals.GoalNear(itemShulker.x, itemShulker.y, itemShulker.z, 2))

  try {
    const breakTool = bot.inventory
      .items()
      .find((item) => item.name === "diamond_pickaxe" || item.name === "netherite_pickaxe")
    if (breakTool) {
      bot.equip(breakTool, "hand")
    }

    await bot.dig(bot.blockAt(new Vec3(itemShulker.x, itemShulker.y, itemShulker.z)))
    await sleep(500)

    const floatingItems = Object.values(bot.entities).filter((entity) => entity.name && entity.displayName === "Item")
    for (const item of floatingItems) {
      const { x, y, z } = item.position
      await bot.pathfinder.goto(new goals.GoalBlock(x, y, z))
    }
  } catch (error) {
    console.log(`Could not break shulker: ${error}`)
    return `Could not break shulker: ${error}`
  }
  await bot.pathfinder.goto(new goals.GoalNear(config.discardChest.x, config.discardChest.y, config.discardChest.z, 2))
  const shulkerChestContainer = await bot.openContainer(
    bot.blockAt(new Vec3(config.discardChest.x, config.discardChest.y, config.discardChest.z)),
  )

  for (const item of bot.inventory.items()) {
    if (shulkerIDs.includes(item.type)) {
      await shulkerChestContainer.deposit(item.type, null, 1)
    }
  }
  shulkerChestContainer.close()
  return "Successfully broke item shulker and deposited in discard chest"
}

async function readReference() {
  await bot.pathfinder.goto(new goals.GoalNear(config.referenceKit.x, config.referenceKit.y, config.referenceKit.z, 2))
  try {
    const referenceContainer = await bot.openContainer(
      bot.blockAt(new Vec3(config.referenceKit.x, config.referenceKit.y, config.referenceKit.z)),
    )
    referenceKit = []
    for (const slot of referenceContainer.slots) {
      if (slot && slot.slot >= 0 && slot.slot < 27 && slot.type) {
        const itemName = bot.registry.items[slot.type]?.name
        if (itemName) {
          referenceKit.push(itemName)
        }
      }
    }

    referenceContainer.close()
    console.log(referenceKit)
    return `Reference kit loaded with ${referenceKit.length} items: ${referenceKit.join(", ")}`
  } catch (error) {
    console.log(`Could not open reference container: ${error}`)
    return `Could not open reference container: ${error}`
  }
}

// Fix the scanChests function to be more robust
async function scanChests() {
  console.log(`Scanning for double chests within a ${config.searchRange} block radius...`)

  // Cancel any existing pathfinding
  bot.pathfinder.setGoal(null)
  await sleep(100)

  const chests = bot.findBlocks({
    matching: bot.registry.blocksByName.chest.id,
    maxDistance: config.searchRange,
    count: 1000,
  })

  if (chests.length === 0) {
    console.log(`No chests found within ${config.searchRange} blocks.`)
    return `No chests found within ${config.searchRange} blocks.`
  }

  console.log(`Found ${chests.length} chest blocks.`)

  const processedChests = new Set()
  const chestsToOpen = []

  for (const chestPos of chests) {
    const chestKey = `${chestPos.x},${chestPos.y},${chestPos.z}`

    if (processedChests.has(chestKey)) continue

    const chestBlock = bot.blockAt(chestPos)
    if (chestBlock && isDoubleChest(chestBlock)) {
      chestsToOpen.push(chestBlock)

      const adjacentChest = getAdjacentChest(chestBlock)
      if (adjacentChest) {
        processedChests.add(`${adjacentChest.position.x},${adjacentChest.position.y},${adjacentChest.position.z}`)
      }
    }
    processedChests.add(chestKey)
  }
  console.log(`Found ${chestsToOpen.length} double chests to open.`)

  for (const chestBlock of chestsToOpen) {
    try {
      await moveToChest(chestBlock)
      await openChestAndStoreItems(chestBlock)
      await sleep(200) // Longer delay between chest operations
    } catch (chestError) {
      console.error(`Error processing chest at ${chestBlock.position}:`, chestError)
      // Continue with next chest even if this one fails
    }
  }

  console.log("Finished scanning all double chests")

  try {
    fs.writeFileSync("itemDictionary.json", JSON.stringify(itemDictionary, null, 2))
    console.log("Item Dictionary has been saved to itemDictionary.json")
  } catch (fileError) {
    console.error("Error writing to file:", fileError)
  }

  return `Finished scanning all ${chestsToOpen.length} double chests in a ${config.searchRange} block radius.`
}

// Bot creation function
function createBot() {
  if (bot) return bot

  bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    version: "1.21.1",
  })

  bot.loadPlugin(pathfinder)

  bot.once("spawn", () => {
    const defaultMove = new Movements(bot)
    defaultMove.canDig = false
    bot.pathfinder.setMovements(defaultMove)
    bot.physics.yawSpeed = 5
    console.log("Bot spawned and ready")
  })

  bot.on("error", (err) => {
    console.error("Bot error:", err)
  })

  bot.on("end", () => {
    console.log("Bot has disconnected.")
    bot = null
  })

  return bot
}

// Export functions and variables for discord.js
module.exports = {
  createBot,
  placeShulkers,
  fillShulkers,
  breakShulkers,
  scanChests,
  grabItem,
  readReference,
  breakItemShulker,
  sequence,
  getBot: () => bot,
  stopBot: () => {
    if (bot) {
      bot.quit()
      bot = null
      return true
    }
    return false
  },
  // Add these functions for web interface integration
  setReferenceKit: (items) => {
    // No flag check, always set the reference kit
    referenceKit = items
    console.log(`Reference kit set with ${items.length} items: ${items.join(", ")}`)
    return referenceKit
  },
  // Add these functions to expose item data for the web interface
  getItemsArray: () => data.itemsArray,
  getReferenceKit: () => referenceKit,
}

