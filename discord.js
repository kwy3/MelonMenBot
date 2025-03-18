const { Client, GatewayIntentBits } = require("discord.js")
const config = require("./config.json")
const botController = require("./index.js")

// Create Discord client
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
})

// Login to Discord
discordClient.login(config.discordToken)

// Discord ready event
discordClient.once("ready", () => {
  console.log(`Discord bot logged in as ${discordClient.user.tag}`)
  console.log("Waiting for commands...")
})

// Command handler
discordClient.on("messageCreate", async (message) => {
  if (message.author.bot) return

  const args = message.content.split(" ")
  const command = args.shift().toLowerCase()

  // Bot initialization command
  if (command === "!startbot") {
    const bot = botController.getBot()
    if (bot) {
      message.reply("Bot is already running!")
      return
    }

    message.reply("Starting Mineflayer bot...")

    const newBot = botController.createBot()

    newBot.once("spawn", () => {
      message.reply("Mineflayer bot started and ready for commands!")
    })

    newBot.on("error", (err) => {
      console.error("Bot error:", err)
      message.reply(`Bot encountered an error: ${err.message}`)
    })

    newBot.on("end", () => {
      message.reply("Bot has disconnected.")
    })

    return
  }

  // All other commands require the bot to be running
  if (!botController.getBot()) {
    message.reply("Bot is not running. Use !startbot to start the bot first.")
    return
  }

  // Bot commands
  try {
    switch (command) {
      case "!stopbot":
        message.reply("Stopping bot...")
        const stopped = botController.stopBot()
        if (stopped) {
          message.reply("Bot stopped successfully.")
        } else {
          message.reply("Bot was not running.")
        }
        break

      case "!placeshulkers":
        message.reply("Placing shulkers...")
        const placeResult = await botController.placeShulkers()
        message.reply(placeResult)
        break

      case "!fillshulkers":
        message.reply("Filling shulkers...")
        const fillResult = await botController.fillShulkers()
        message.reply(fillResult)
        break

      case "!breakshulkers":
        message.reply("Breaking shulkers...")
        const breakResult = await botController.breakShulkers()
        message.reply(breakResult)
        break

      case "!scanchests":
        message.reply("Scanning chests...")
        const scanResult = await botController.scanChests()
        message.reply(scanResult)
        break

      case "!grabitem":
        if (args.length < 1) {
          message.reply("Usage: !grabitem <item_name>")
          return
        }
        const itemName = args[0]
        message.reply(`Grabbing item: ${itemName}...`)
        const grabResult = await botController.grabItem(1, itemName)
        message.reply(grabResult)
        break

      case "!readreference":
        message.reply("Reading reference kit...")
        const refResult = await botController.readReference()
        message.reply(refResult)
        break

      case "!breakitemshulker":
        message.reply("Breaking item shulker...")
        const breakItemResult = await botController.breakItemShulker()
        message.reply(breakItemResult)
        break

      case "!sequence":
        message.reply("Starting sequence...")

        // Check if reference kit is set
        const currentKit = botController.getReferenceKit()
        if (!currentKit || currentKit.length === 0) {
          message.reply("Warning: Reference kit is not set. Will attempt to read from reference chest.")
        } else {
          message.reply(`Using reference kit with ${currentKit.length} items: ${currentKit.join(", ")}`)
        }

        const sequenceResult = await botController.sequence()
        message.reply(`Sequence completed! ${sequenceResult}`)
        break

      case "!help":
        const helpMessage = `
**Available Commands:**
!startbot - Start the Minecraft bot
!stopbot - Stop the Minecraft bot
!placeshulkers - Place shulkers from chest
!fillshulkers - Fill placed shulkers with items
!breakshulkers - Break all placed shulkers
!scanchests - Scan chests in the area
!grabitem <item_name> - Grab a specific item
!readreference - Read reference kit
!breakitemshulker - Break the item shulker
!sequence - Run the full sequence
!help - Show this help message
                `
        message.reply(helpMessage)
        break

      default:
        message.reply("Unknown command. Use !help to see available commands.")
    }
  } catch (error) {
    console.error("Error executing command:", error)
    message.reply(`Error executing command: ${error.message}`)
  }
})

// Main entry point
console.log("Discord bot starting...")

