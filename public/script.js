// Make sure the socket.io connection is properly initialized
document.addEventListener("DOMContentLoaded", () => {
  // Connect to the server
  const socket = io()

  // DOM Elements
  const availableItemsList = document.getElementById("availableItemsList")
  const shulkerBox = document.getElementById("shulkerBox")
  const itemSearchInput = document.getElementById("itemSearchInput")
  const showAllItemsSwitch = document.getElementById("showAllItemsSwitch")
  const refreshItemsBtn = document.getElementById("refreshItemsBtn")
  const clearShulkerBtn = document.getElementById("clearShulkerBtn")
  const startSequenceBtn = document.getElementById("startSequenceBtn")
  const scanChestsBtn = document.getElementById("scanChestsBtn")
  const readReferenceBtn = document.getElementById("readReferenceBtn")
  const botStatus = document.getElementById("botStatus")
  const botStatusIndicator = document.getElementById("botStatusIndicator")
  const botStatusText = document.getElementById("botStatusText")
  const sequenceStatus = document.getElementById("sequenceStatus")
  const sequenceProgress = document.getElementById("sequenceProgress")
  const statusMessage = document.getElementById("statusMessage")

  // Modal elements
  const quantityModal = new bootstrap.Modal(document.getElementById("quantityModal"))
  const modalItemName = document.getElementById("modalItemName")
  const modalItemIcon = document.getElementById("modalItemIcon")
  const itemQuantity = document.getElementById("itemQuantity")
  const confirmQuantityBtn = document.getElementById("confirmQuantityBtn")

  // Toast elements
  const notificationToast = document.getElementById("notificationToast")
  const toastTitle = document.getElementById("toastTitle")
  const toastMessage = document.getElementById("toastMessage")
  const toastTime = document.getElementById("toastTime")
  const toast = new bootstrap.Toast(notificationToast, { delay: 5000 })

  // Templates
  const itemTemplate = document.getElementById("itemTemplate")
  const slotItemTemplate = document.getElementById("slotItemTemplate")

  // State
  let allItems = []
  let availableItems = []
  let shulkerItems = Array(27).fill(null) // 27 slots in a shulker box
  let currentSlot = null
  let currentItem = null
  let showAllItems = false
  let sequenceInProgress = false

  // Initialize
  function init() {
    fetchItems()
    setupEventListeners()
    setupShulkerSlots()
  }

  // Fetch items from the server
  function fetchItems() {
    availableItemsList.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-2 text-muted">Loading items...</p>
      </div>
    `

    const endpoint = showAllItems ? "/api/items" : "/api/available-items"

    fetch(endpoint)
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          showNotification("Error", data.error, "error")
          return
        }

        if (showAllItems) {
          allItems = data
          renderItems(allItems)
        } else {
          availableItems = data
          renderItems(availableItems)
        }
      })
      .catch((error) => {
        showNotification("Error", `Failed to load items: ${error.message}`, "error")
      })

    // Also fetch current shulker items if any
    fetch("/api/shulker-items")
      .then((response) => response.json())
      .then((data) => {
        if (!data.error) {
          shulkerItems = data
          renderShulkerItems()
        }
      })
      .catch((error) => {
        console.error("Failed to load shulker items:", error)
      })
  }

  // Setup event listeners
  function setupEventListeners() {
    // Search input
    itemSearchInput.addEventListener("input", filterItems)

    // Show all items switch
    showAllItemsSwitch.addEventListener("change", () => {
      showAllItems = showAllItemsSwitch.checked
      fetchItems()
    })

    // Refresh button
    refreshItemsBtn.addEventListener("click", () => {
      refreshItemsBtn.classList.add("spin")
      fetchItems()

    })

    // Clear shulker button
    clearShulkerBtn.addEventListener("click", clearShulker)

    // Start sequence button
    startSequenceBtn.addEventListener("click", startSequence)

    // Scan chests button
    scanChestsBtn.addEventListener("click", scanChests)

    // Read reference button
    readReferenceBtn.addEventListener("click", readReference)

    // Confirm quantity button
    confirmQuantityBtn.addEventListener("click", confirmItemQuantity)

    // Socket events
    socket.on("bot-status", updateBotStatus)
    socket.on("shulker-updated", updateShulkerItems)
    socket.on("status", updateStatus)
    socket.on("sequence-completed", sequenceCompleted)
    socket.on("sequence-error", sequenceError)
    socket.on("scan-complete", scanCompleted)

    socket.on("connect", () => {
      console.log("Connected to server")
      showNotification("Connected", "Connected to server", "success")
    })

    socket.on("disconnect", () => {
      console.log("Disconnected from server")
      updateBotStatus({ running: false })
      showNotification("Disconnected", "Disconnected from server", "error")
    })

    // Add a more robust socket connection handler
    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error)
      updateBotStatus({ running: false })
      showNotification("Connection Error", `Connection error: ${error.message}`, "error")
    })

    // Add a reconnection handler
    socket.on("reconnect", (attemptNumber) => {
      console.log(`Reconnected after ${attemptNumber} attempts`)
      showNotification("Reconnected", `Reconnected to server after ${attemptNumber} attempts`, "success")
    })
  }

  // Setup shulker slots
  function setupShulkerSlots() {
    const slots = shulkerBox.querySelectorAll(".shulker-slot")

    slots.forEach((slot) => {
      slot.addEventListener("click", () => {
        // If the slot already has an item, show the quantity modal to edit
        const slotIndex = Number.parseInt(slot.dataset.slot)
        if (shulkerItems[slotIndex]) {
          editSlotItem(slotIndex)
          return
        }

        // Otherwise, highlight this slot for item selection
        slots.forEach((s) => s.classList.remove("active"))
        slot.classList.add("active")
        currentSlot = slotIndex
      })
    })
  }

  // Filter items based on search input
  function filterItems() {
    const searchTerm = itemSearchInput.value.toLowerCase()
    const items = showAllItems ? allItems : availableItems

    const filteredItems = items.filter(
      (item) =>
        item.name.toLowerCase().includes(searchTerm) ||
        (item.displayName && item.displayName.toLowerCase().includes(searchTerm)),
    )

    renderItems(filteredItems)
  }

  // Render available items
  function renderItems(items) {
    if (!items || items.length === 0) {
      availableItemsList.innerHTML = `
        <div class="text-center py-5">
          <i class="bi bi-search" style="font-size: 2rem; opacity: 0.5;"></i>
          <p class="mt-2 text-muted">No items found</p>
        </div>
      `
      return
    }

    availableItemsList.innerHTML = ""

    items.forEach((item) => {
      const itemElement = itemTemplate.content.cloneNode(true)
      const itemCard = itemElement.querySelector(".item-card")

      itemCard.dataset.id = item.id
      itemCard.querySelector(".item-name").textContent = item.displayName || formatItemName(item.name)
      itemCard.querySelector(".item-id").textContent = `ID: ${item.id}`

      // Set the proper item icon
      const iconImg = itemCard.querySelector(".item-icon img")
      iconImg.src = getItemIconUrl(item.name)
      iconImg.alt = item.displayName || formatItemName(item.name)

      const selectBtn = itemCard.querySelector(".item-select-btn")
      selectBtn.addEventListener("click", () => selectItem(item))

      availableItemsList.appendChild(itemElement)
    })
  }

  // Render shulker items
  function renderShulkerItems() {
    const slots = shulkerBox.querySelectorAll(".shulker-slot")

    slots.forEach((slot, index) => {
      // Clear the slot first
      slot.innerHTML = ""

      const item = shulkerItems[index]
      if (!item) return

      const slotItemElement = slotItemTemplate.content.cloneNode(true)
      const slotItem = slotItemElement.querySelector(".slot-item")

      slotItem.dataset.id = item.id

      // Set the proper item icon
      const iconImg = slotItem.querySelector(".item-icon")
      iconImg.src = getItemIconUrl(item.name)
      iconImg.alt = item.displayName || formatItemName(item.name)

      slotItem.querySelector(".item-count").textContent = item.count

      const removeBtn = slotItem.querySelector(".remove-item-btn")
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation() // Prevent slot click
        removeSlotItem(index)
      })

      slot.appendChild(slotItemElement)
    })
  }

  // Format item name for display
  function formatItemName(name) {
    return name
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  // Get the item icon URL
  function getItemIconUrl(itemName) {
    // First try to get from the server's cached icons
    const serverIconUrl = `/icons/${itemName}.png`

    // Fallback to a public Minecraft API if needed
    const fallbackIconUrl = `https://mc-heads.net/item/${itemName}`

    // Return the server icon URL (will fallback to the public API if not found)
    return serverIconUrl
  }

  // Select an item for the current slot
  function selectItem(item) {
    if (currentSlot === null) {
      showNotification("Warning", "Please select a slot in the shulker box first", "warning")
      return
    }

    currentItem = item

    // Show the quantity modal
    modalItemName.textContent = item.displayName || formatItemName(item.name)

    // Set the proper item icon in the modal
    modalItemIcon.innerHTML = `<img src="${getItemIconUrl(item.name)}" alt="${item.displayName || formatItemName(item.name)}" style="max-width: 100%; max-height: 100%;">`

    itemQuantity.value = 1
    itemQuantity.max = item.stackSize || 64

    quantityModal.show()
  }

  // Confirm item quantity and add to slot
  function confirmItemQuantity() {
    if (currentSlot === null || !currentItem) return

    const count = Number.parseInt(itemQuantity.value)
    if (isNaN(count) || count < 1 || count > (currentItem.stackSize || 64)) {
      showNotification("Error", "Invalid quantity", "error")
      return
    }

    // Add item to the slot
    shulkerItems[currentSlot] = {
      id: currentItem.id,
      name: currentItem.name,
      displayName: currentItem.displayName || formatItemName(currentItem.name),
      count: count,
    }

    // Update the UI
    renderShulkerItems()

    // Reset current slot and item
    const slots = shulkerBox.querySelectorAll(".shulker-slot")
    slots.forEach((slot) => slot.classList.remove("active"))
    currentSlot = null
    currentItem = null

    // Hide the modal
    quantityModal.hide()

    // Update the server
    updateShulkerItemsOnServer()

    showNotification("Success", "Item added to shulker", "success")
  }

  // Edit an item in a slot
  function editSlotItem(slotIndex) {
    const item = shulkerItems[slotIndex]
    if (!item) return

    currentSlot = slotIndex
    currentItem = item

    // Show the quantity modal
    modalItemName.textContent = item.displayName || formatItemName(item.name)

    // Set the proper item icon in the modal
    modalItemIcon.innerHTML = `<img src="${getItemIconUrl(item.name)}" alt="${item.displayName || formatItemName(item.name)}" style="max-width: 100%; max-height: 100%;">`

    itemQuantity.value = item.count
    itemQuantity.max = item.stackSize || 64

    quantityModal.show()
  }

  // Remove an item from a slot
  function removeSlotItem(slotIndex) {
    shulkerItems[slotIndex] = null
    renderShulkerItems()
    updateShulkerItemsOnServer()
    showNotification("Info", "Item removed from shulker", "info")
  }

  // Clear all items from the shulker
  function clearShulker() {
    shulkerItems = Array(27).fill(null)
    renderShulkerItems()
    updateShulkerItemsOnServer()
    showNotification("Info", "Shulker box cleared", "info")
  }

  // Update shulker items on the server
  function updateShulkerItemsOnServer() {
    fetch("/api/shulker-items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: shulkerItems }),
    }).catch((error) => {
      console.error("Failed to update shulker items:", error)
      showNotification("Error", "Failed to update shulker items", "error")
    })

    // Also update via socket for real-time updates
    socket.emit("update-shulker", shulkerItems)
  }

  // Start the sequence
  function startSequence() {
    // Check if there are any items in the shulker
    const hasItems = shulkerItems.some((item) => item !== null)
    if (!hasItems) {
      showNotification("Warning", "Please add at least one item to the shulker box", "warning")
      return
    }

    if (sequenceInProgress) {
      showNotification("Warning", "Sequence already in progress", "warning")
      return
    }

    sequenceInProgress = true
    sequenceStatus.textContent = "Running"
    sequenceStatus.className = "badge bg-warning"
    startSequenceBtn.disabled = true
    sequenceProgress.style.width = "10%"
    sequenceProgress.setAttribute("aria-valuenow", "10")

    showMessage("Starting sequence...", "info")
    showNotification("Sequence", "Starting sequence...", "info")

    fetch("/api/start-sequence", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ shulkerItems }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`)
        }
        return response.json()
      })
      .then((data) => {
        if (data.error) {
          sequenceError({ error: data.error })
        } else {
          showMessage(data.message || "Sequence started successfully", "info")
          sequenceProgress.style.width = "25%"
          sequenceProgress.setAttribute("aria-valuenow", "25")
        }
      })
      .catch((error) => {
        sequenceError({ error: error.message || "Failed to start sequence" })
      })

    // Also notify via socket
    socket.emit("start-sequence", shulkerItems)
  }

  // Scan chests
  function scanChests() {
    showMessage("Starting chest scan...", "info")
    showNotification("Scan", "Starting chest scan...", "info")

    socket.emit("scan-chests")
  }

  // Read reference
  function readReference() {
    showMessage("Reading reference kit...", "info")
    showNotification("Reference", "Reading reference kit...", "info")

    fetch("/api/read-reference", {
      method: "GET",
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          showNotification("Error", data.error, "error")
          showMessage(data.error, "danger")
        } else {
          showNotification("Success", data.message, "success")
          showMessage(data.message, "success")
        }
      })
      .catch((error) => {
        showNotification("Error", error.message, "error")
        showMessage(`Error reading reference: ${error.message}`, "danger")
      })
  }

  // Update bot status
  function updateBotStatus(data) {
    if (data.running) {
      botStatus.textContent = "Connected"
      botStatus.className = "badge bg-success"
      botStatusIndicator.classList.remove("offline")
      botStatusIndicator.classList.add("online")
      botStatusText.textContent = "Online"
    } else {
      botStatus.textContent = "Disconnected"
      botStatus.className = "badge bg-danger"
      botStatusIndicator.classList.remove("online")
      botStatusIndicator.classList.add("offline")
      botStatusText.textContent = "Offline"
    }
  }

  // Update shulker items from socket
  function updateShulkerItems(items) {
    shulkerItems = items
    renderShulkerItems()
  }

  // Update status message
  function updateStatus(data) {
    showMessage(data.message, "info")

    // Update progress bar
    if (data.progress) {
      sequenceProgress.style.width = `${data.progress}%`
      sequenceProgress.setAttribute("aria-valuenow", data.progress)
    }
  }

  // Sequence completed
  function sequenceCompleted(data) {
    sequenceInProgress = false
    sequenceStatus.textContent = "Completed"
    sequenceStatus.className = "badge bg-success"
    startSequenceBtn.disabled = false
    sequenceProgress.style.width = "100%"
    sequenceProgress.setAttribute("aria-valuenow", "100")

    showMessage(data.result, "success")
    showNotification("Success", "Sequence completed successfully", "success")

    // Reset progress bar after a delay
    setTimeout(() => {
      sequenceProgress.style.width = "0%"
      sequenceProgress.setAttribute("aria-valuenow", "0")
    }, 3000)
  }

  // Sequence error
  function sequenceError(data) {
    sequenceInProgress = false
    sequenceStatus.textContent = "Error"
    sequenceStatus.className = "badge bg-danger"
    startSequenceBtn.disabled = false
    sequenceProgress.style.width = "0%"
    sequenceProgress.setAttribute("aria-valuenow", "0")

    const errorMessage = data.error || "Unknown error occurred"
    console.error("Sequence error:", errorMessage)
    showError(`Sequence error: ${errorMessage}`)
    showNotification("Error", `Sequence error: ${errorMessage}`, "error")
  }

  // Scan completed
  function scanCompleted(data) {
    showMessage(data.message, "success")
    showNotification("Success", "Chest scan completed", "success")

    // Refresh available items
    fetchItems()
  }

  // Show error message
  function showError(message) {
    showMessage(message, "danger")
  }

  // Show message
  function showMessage(message, type) {
    statusMessage.textContent = message
    statusMessage.className = `alert alert-${type}`
    statusMessage.classList.remove("d-none")

    // Auto-hide after 5 seconds for success messages
    if (type === "success") {
      setTimeout(() => {
        statusMessage.classList.add("d-none")
      }, 5000)
    }
  }

  // Show notification toast
  function showNotification(title, message, type) {
    // Set toast content
    toastTitle.textContent = title
    toastMessage.textContent = message
    toastTime.textContent = new Date().toLocaleTimeString()

    // Set toast type
    notificationToast.className = "toast"

    switch (type) {
      case "success":
        notificationToast.classList.add("bg-success", "text-white")
        break
      case "error":
        notificationToast.classList.add("bg-danger", "text-white")
        break
      case "warning":
        notificationToast.classList.add("bg-warning")
        break
      case "info":
      default:
        notificationToast.classList.add("bg-info", "text-white")
        break
    }

    // Show toast
    toast.show()
  }

  // Add a keydown event listener for the quantity input
  itemQuantity.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      confirmItemQuantity()
    }
  })

  // Initialize the app
  init()
})

// Add CSS animation for refresh button
document.head.insertAdjacentHTML(
  "beforeend",
  `
  <style>
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .spin {
      animation: spin 1s linear;
    }
  </style>
  `,
)

