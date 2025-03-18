const express = require("express")
const http = require("http")
const socketIo = require("socket.io")
const path = require("path")
const fs = require("fs")
const config = require("./config.json")

// Import the bot controller to access its functions
const botController = require("./index.js")

// Create Express app
const app = express()
const server = http.createServer(app)
const io = socketIo(server)

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "public")))
app.use(express.json())

// Store the shulker items
let shulkerItems = Array(27).fill(null) // 27 slots in a shulker box

// Get all available items from the Minecraft data
function getAllItems() {
  try {
    const bot = botController.getBot()
    if (!bot) {
      return { error: "Bot is not running" }
    }

    // Get all items from the registry
    const items = Object.values(bot.registry.items)
      .filter((item) => item && item.name && !item.name.includes("air")) // Filter out air and invalid items
      .map((item) => ({
        id: item.id,
        name: item.name,
        displayName: item.displayName || formatItemName(item.name),
        stackSize: item.stackSize || 64,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))

    return items
  } catch (error) {
    console.error("Error getting items:", error)
    return { error: error.message }
  }
}

// Format item name for display (convert snake_case to Title Case)
function formatItemName(name) {
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

// Get items from the item dictionary
function getAvailableItems() {
  try {
    // Check if the bot is running
    const bot = botController.getBot()
    if (!bot) {
      return { error: "Bot is not running" }
    }

    // Check if the item dictionary exists
    if (!fs.existsSync("itemDictionary.json")) {
      return { error: "Item dictionary not found. Run !scanchests first." }
    }

    // Read the item dictionary
    const itemDictionaryData = fs.readFileSync("itemDictionary.json", "utf8")
    const itemDictionary = JSON.parse(itemDictionaryData)

    // Get all unique item IDs from the dictionary
    const uniqueItemIds = new Set()
    Object.values(itemDictionary).forEach((items) => {
      items.forEach((itemId) => uniqueItemIds.add(itemId))
    })

    // Convert item IDs to item objects
    const availableItems = Array.from(uniqueItemIds)
      .map((itemId) => {
        const item = bot.registry.items[itemId]
        if (!item) return null

        return {
          id: itemId,
          name: item.name,
          displayName: item.displayName || formatItemName(item.name),
          stackSize: item.stackSize || 64,
        }
      })
      .filter((item) => item !== null) // Remove null items
      .sort((a, b) => a.displayName.localeCompare(b.displayName))

    return availableItems
  } catch (error) {
    console.error("Error getting available items:", error)
    return { error: error.message }
  }
}

// Convert shulker items to reference kit
function convertShulkerItemsToReferenceKit() {
  // Filter out null items and extract the item names
  const referenceKit = shulkerItems.filter((item) => item !== null).map((item) => item.name)

  return referenceKit
}

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

app.get("/api/items", (req, res) => {
  const items = getAllItems()
  res.json(items)
})

app.get("/api/available-items", (req, res) => {
  const items = getAvailableItems()
  res.json(items)
})

app.get("/api/shulker-items", (req, res) => {
  res.json(shulkerItems)
})

app.post("/api/shulker-items", (req, res) => {
  const { items } = req.body
  if (!Array.isArray(items) || items.length !== 27) {
    return res.status(400).json({ error: "Invalid shulker items format" })
  }

  shulkerItems = items
  io.emit("shulker-updated", shulkerItems)
  res.json({ success: true, items: shulkerItems })
})

// Update the start-sequence handler to ensure the reference kit is set correctly
// Replace the app.post("/api/start-sequence") handler with this:
app.post("/api/start-sequence", async (req, res) => {
  try {
    const bot = botController.getBot()
    if (!bot) {
      return res.status(400).json({ error: "Bot is not running" })
    }

    // Check if there are any items in the shulker
    const hasItems = shulkerItems.some((item) => item !== null)
    if (!hasItems) {
      return res.status(400).json({ error: "No items in the shulker box" })
    }

    // Convert shulker items to reference kit
    const referenceKit = convertShulkerItemsToReferenceKit()

    console.log("Web interface setting reference kit:", referenceKit)

    // Set the reference kit and verify it was set
    const setKit = botController.setReferenceKit(referenceKit)
    console.log("Verification - reference kit after setting:", setKit)

    // Double check the reference kit from the bot controller
    const currentKit = botController.getReferenceKit()
    console.log("Double verification - current reference kit:", currentKit)

    // Start the sequence
    res.json({ success: true, message: "Sequence started" })

    // Run the sequence in the background with error handling
    try {
      const result = await botController.sequence()
      io.emit("sequence-completed", { success: true, result })
    } catch (sequenceError) {
      console.error("Sequence error:", sequenceError)
      io.emit("sequence-error", { error: sequenceError.message || "Unknown error during sequence" })
    }
  } catch (error) {
    console.error("Error starting sequence:", error)
    res.status(500).json({ error: error.message || "Unknown error" })
  }
})

// Add a route to serve item icons
app.get("/icons/:itemName.png", async (req, res) => {
  const itemName = req.params.itemName
  const iconPath = path.join(__dirname, "public", "icons", `${itemName}.png`)

  // Check if the icon exists
  if (fs.existsSync(iconPath)) {
    // Serve the cached icon
    res.sendFile(iconPath)
  } else {
    try {
      // Create the icons directory if it doesn't exist
      if (!fs.existsSync(path.join(__dirname, "public", "icons"))) {
        fs.mkdirSync(path.join(__dirname, "public", "icons"), { recursive: true })
      }

      // Fetch the icon from a public Minecraft API
      const response = await fetch(`https://mc-heads.net/item/${itemName}`)

      if (response.ok) {
        // Create a write stream to save the icon
        const fileStream = fs.createWriteStream(iconPath)

        // Pipe the response to the file
        response.body.pipe(fileStream)

        // Wait for the file to be saved
        await new Promise((resolve, reject) => {
          fileStream.on("finish", resolve)
          fileStream.on("error", reject)
        })

        // Serve the saved icon
        res.sendFile(iconPath)
      } else {
        // If the icon couldn't be fetched, serve the placeholder
        res.sendFile(path.join(__dirname, "public", "placeholder.svg"))
      }
    } catch (error) {
      console.error(`Error fetching icon for ${itemName}:`, error)
      // Serve the placeholder if there was an error
      res.sendFile(path.join(__dirname, "public", "placeholder.svg"))
    }
  }
})

// Add a route to read reference kit
app.get("/api/read-reference", async (req, res) => {
  try {
    const bot = botController.getBot()
    if (!bot) {
      return res.status(400).json({ error: "Bot is not running" })
    }

    const result = await botController.readReference()
    res.json({ success: true, message: result })
  } catch (error) {
    console.error("Error reading reference:", error)
    res.status(500).json({ error: error.message || "Unknown error" })
  }
})

io.on("connection", (socket) => {
  console.log("A user connected")

  // Also update the socket.io start-sequence handler:
  socket.on("start-sequence", async () => {
    try {
      socket.emit("status", { message: "Starting sequence..." })

      // Make sure bot is created
      if (!botController.getBot()) {
        botController.createBot()
        socket.emit("status", { message: "Bot created and connecting..." })

        // Wait for bot to spawn
        await new Promise((resolve, reject) => {
          const checkBot = setInterval(() => {
            if (botController.getBot() && botController.getBot().entity) {
              clearInterval(checkBot)
              resolve()
            }
          }, 1000)

          // Timeout after 30 seconds
          setTimeout(() => {
            clearInterval(checkBot)
            reject(new Error("Timeout waiting for bot to spawn"))
          }, 30000)
        })
      }

      // Convert shulker items to reference kit
      const referenceKit = convertShulkerItemsToReferenceKit()

      console.log("Socket.io setting reference kit:", referenceKit)

      // Set the reference kit and verify it was set
      const setKit = botController.setReferenceKit(referenceKit)
      console.log("Verification - reference kit after setting:", setKit)

      // Double check the reference kit from the bot controller
      const currentKit = botController.getReferenceKit()
      console.log("Double verification - current reference kit:", currentKit)

      socket.emit("status", { message: "Bot ready, starting sequence" })

      // Run the sequence with proper error handling
      try {
        const result = await botController.sequence()
        socket.emit("sequence-completed", { result })
      } catch (sequenceError) {
        console.error("Sequence error:", sequenceError)
        socket.emit("sequence-error", { error: sequenceError.message || "Unknown error during sequence" })
      }
    } catch (error) {
      console.error("Error in start-sequence handler:", error)
      socket.emit("error", { message: error.message || "Unknown error" })
    }
  })

  // Handle scanning chests
  socket.on("scan-chests", async () => {
    try {
      socket.emit("status", { message: "Starting chest scan..." })

      if (!botController.getBot()) {
        botController.createBot()
        socket.emit("status", { message: "Bot created and connecting..." })

        // Wait for bot to spawn
        await new Promise((resolve) => {
          const checkBot = setInterval(() => {
            if (botController.getBot() && botController.getBot().entity) {
              clearInterval(checkBot)
              resolve()
            }
          }, 1000)

          // Timeout after 30 seconds
          setTimeout(() => {
            clearInterval(checkBot)
            resolve()
          }, 30000)
        })
      }

      socket.emit("status", { message: "Bot ready, starting chest scan" })

      // Run the scan
      const result = await botController.scanChests()
      socket.emit("scan-complete", { message: result })
    } catch (error) {
      socket.emit("error", { message: `Scan failed: ${error.message}` })
    }
  })

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected")
  })
})

// Start the server
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Web server running on http://localhost:${PORT}`)
})

module.exports = {
  getShulkerItems: () => shulkerItems,
  setShulkerItems: (items) => {
    if (Array.isArray(items) && items.length === 27) {
      shulkerItems = items
      io.emit("shulker-updated", shulkerItems)
    }
  },
}

