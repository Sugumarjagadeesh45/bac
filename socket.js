// D:\newapp\fullbackend-main\fullbackend-main_\socket.js
const { Server } = require("socket.io");
const DriverLocation = require("./models/DriverLocation");
const Driver = require("./models/driver/driver");
const Ride = require("./models/ride");
let io;
const rides = {};
const activeDriverSockets = new Map();

// Helper function to log current driver status
const logDriverStatus = () => {
  console.log("\n📊 === CURRENT DRIVER STATUS ===");
  if (activeDriverSockets.size === 0) {
    console.log("❌ No drivers currently online");
  } else {
    console.log(`✅ ${activeDriverSockets.size} drivers currently online:`);
    activeDriverSockets.forEach((driver, driverId) => {
      const timeSinceUpdate = Math.floor((Date.now() - driver.lastUpdate) / 1000);
      console.log(`  🚗 ${driver.driverName} (${driverId})`);
      console.log(`     Status: ${driver.status}`);
      console.log(`     Vehicle: ${driver.vehicleType}`);
      console.log(`     Location: ${driver.location.latitude.toFixed(6)}, ${driver.location.longitude.toFixed(6)}`);
      console.log(`     Last update: ${timeSinceUpdate}s ago`);
      console.log(`     Socket: ${driver.socketId}`);
      console.log(`     Online: ${driver.isOnline ? 'Yes' : 'No'}`);
    });
  }
  console.log("================================\n");
};

// Helper function to log ride status
const logRideStatus = () => {
  console.log("\n🚕 === CURRENT RIDE STATUS ===");
  const rideEntries = Object.entries(rides);
  if (rideEntries.length === 0) {
    console.log("❌ No active rides");
  } else {
    console.log(`✅ ${rideEntries.length} active rides:`);
    rideEntries.forEach(([rideId, ride]) => {
      console.log(`  📍 Ride ${rideId}:`);
      console.log(`     Status: ${ride.status}`);
      console.log(`     Driver: ${ride.driverId || 'Not assigned'}`);
      console.log(`     User: ${ride.userId}`);
      console.log(`     Pickup: ${ride.pickup?.address || ride.pickup?.lat + ',' + ride.pickup?.lng}`);
      console.log(`     Drop: ${ride.drop?.address || ride.drop?.lat + ',' + ride.drop?.lng}`);
    });
  }
  console.log("================================\n");
};

const init = (server) => {
  io = new Server(server, {
    cors: { 
      origin: "*", 
      methods: ["GET", "POST"] 
    },
  });
  
  // Log server status every 30 seconds
  setInterval(() => {
    console.log(`\n⏰ ${new Date().toLocaleString()} - Server Status Check`);
    logDriverStatus();
    logRideStatus();
  }, 30000);
  
  io.on("connection", (socket) => {
    console.log(`\n⚡ New client connected: ${socket.id}`);
    console.log(`📱 Total connected clients: ${io.engine.clientsCount}`);
    
    // -------------------- DRIVER REGISTRATION --------------------
socket.on("registerDriver", async ({ driverId, driverName, latitude, longitude, vehicleType = "taxi" }) => {
  try {
    socket.driverId = driverId;
    socket.driverName = driverName;
    
    // Store driver connection info
    activeDriverSockets.set(driverId, {
      socketId: socket.id,
      driverId,
      driverName,
      location: { latitude, longitude },
      vehicleType,
      lastUpdate: Date.now(),
      status: "Live",
      isOnline: true
    });
    
    // Join driver to a room for ride notifications
    socket.join("allDrivers");
    socket.join(`driver_${driverId}`);
    
    console.log(`\n✅ DRIVER REGISTERED: ${driverName} (${driverId})`);
    console.log(`📍 Location: ${latitude}, ${longitude}`);
    console.log(`🚗 Vehicle: ${vehicleType}`);
    console.log(`🔌 Socket ID: ${socket.id}`);
    
    // Save initial location to database
    await saveDriverLocationToDB(driverId, driverName, latitude, longitude, vehicleType);
    
    // Broadcast updated driver list to ALL connected users
    broadcastDriverLocationsToAllUsers();
    
    // Log current status
    logDriverStatus();
    
  } catch (error) {
    console.error("❌ Error registering driver:", error);
  }
});
    
    // -------------------- DRIVER LIVE LOCATION UPDATE --------------------
socket.on("driverLiveLocationUpdate", async ({ driverId, driverName, lat, lng }) => {
  try {
    if (activeDriverSockets.has(driverId)) {
      const driverData = activeDriverSockets.get(driverId);
      driverData.location = { latitude: lat, longitude: lng };
      driverData.lastUpdate = Date.now();
      driverData.isOnline = true;
      activeDriverSockets.set(driverId, driverData);
      
      console.log(`\n📍 DRIVER LOCATION UPDATE: ${driverName} (${driverId})`);
      console.log(`🗺️  New location: ${lat}, ${lng}`);
      
      // Save to database immediately
      await saveDriverLocationToDB(driverId, driverName, lat, lng, driverData.vehicleType);
      
      // Broadcast to ALL connected users
      broadcastDriverLocationsToAllUsers();
    }
  } catch (error) {
    console.error("❌ Error updating driver location:", error);
  }
});





socket.on("getNearbyDrivers", ({ latitude, longitude, radius = 5000 }) => {
  try {
    console.log(`\n🔍 USER REQUESTED NEARBY DRIVERS: ${socket.id}`);
    console.log(`📍 User location: ${latitude}, ${longitude}`);
    
    // Get all active drivers (only those who are online)
    const drivers = Array.from(activeDriverSockets.values())
      .filter(driver => driver.isOnline)
      .map(driver => ({
        driverId: driver.driverId,
        name: driver.driverName,
        location: {
          coordinates: [driver.location.longitude, driver.location.latitude]
        },
        vehicleType: driver.vehicleType,
        status: driver.status,
        lastUpdate: driver.lastUpdate
      }));
    
    console.log(`📤 Sending ${drivers.length} online drivers to user`);
    
    // Send to the requesting client only
    socket.emit("nearbyDriversResponse", { drivers });
  } catch (error) {
    console.error("❌ Error fetching nearby drivers:", error);
    socket.emit("nearbyDriversResponse", { drivers: [] });
  }
});



function broadcastDriverLocationsToAllUsers() {
  // Only broadcast drivers who are online
  const drivers = Array.from(activeDriverSockets.values())
    .filter(driver => driver.isOnline)
    .map(driver => ({
      driverId: driver.driverId,
      name: driver.driverName,
      location: {
        coordinates: [driver.location.longitude, driver.location.latitude]
      },
      vehicleType: driver.vehicleType,
      status: driver.status,
      lastUpdate: driver.lastUpdate
    }));
  
  // Emit to all connected clients (both users and drivers)
  io.emit("driverLocationsUpdate", { drivers });
}


// Helper function to calculate distance
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}


    // -------------------- DRIVER STATUS UPDATE --------------------
    socket.on("driverStatusUpdate", async ({ driverId, status }) => {
      try {
        if (activeDriverSockets.has(driverId)) {
          const driverData = activeDriverSockets.get(driverId);
          const oldStatus = driverData.status;
          driverData.status = status;
          driverData.lastUpdate = Date.now();
          driverData.isOnline = status !== "Offline"; // Update online status
          activeDriverSockets.set(driverId, driverData);
          
          console.log(`\n🔄 DRIVER STATUS CHANGE: ${driverData.driverName} (${driverId})`);
          console.log(`📊 Status: ${oldStatus} → ${status}`);
          
          // Save to database
          await saveDriverLocationToDB(
            driverId, 
            driverData.driverName,
            driverData.location.latitude, 
            driverData.location.longitude, 
            driverData.vehicleType,
            status
          );
          
          // Broadcast to all users
          broadcastDriverLocations();
        }
      } catch (error) {
        console.error("❌ Error updating driver status:", error);
      }
    });
    
// -------------------- REQUEST NEARBY DRIVERS --------------------
socket.on("requestNearbyDrivers", ({ latitude, longitude, radius = 5000 }) => {
  try {
    console.log(`\n🔍 USER REQUESTED NEARBY DRIVERS: ${socket.id}`);
    console.log(`📍 User location: ${latitude}, ${longitude}`);
    console.log(`📏 Search radius: ${radius}m`);

    // Get all active drivers (only those who are online)
    const drivers = Array.from(activeDriverSockets.values())
      .filter(driver => driver.isOnline)
      .map(driver => ({
        driverId: driver.driverId,
        name: driver.driverName,
        location: {
          coordinates: [driver.location.longitude, driver.location.latitude]
        },
        vehicleType: driver.vehicleType,
        status: driver.status,
        lastUpdate: driver.lastUpdate
      }));

    console.log(`📤 Sending ${drivers.length} online drivers to user`);

    // Send to the requesting client only
    socket.emit("nearbyDriversResponse", { drivers });
  } catch (error) {
    console.error("❌ Error fetching nearby drivers:", error);
    socket.emit("nearbyDriversResponse", { drivers: [] });
  }
});

    
    // -------------------- BOOK RIDE --------------------
    socket.on("bookRide", (data) => {
      try {
        const { rideId, userId, pickup, drop, vehicleType } = data;
        
        console.log(`\n🚕 NEW RIDE BOOKING: ${rideId}`);
        console.log(`👤 User ID: ${userId}`);
        console.log(`📍 Pickup: ${pickup.address || pickup.lat + ',' + pickup.lng}`);
        console.log(`📍 Drop: ${drop.address || drop.lat + ',' + drop.lng}`);
        console.log(`🚗 Vehicle type: ${vehicleType}`);
        
        // Store ride data
        rides[rideId] = {
          ...data,
          status: "pending",
          timestamp: Date.now()
        };
        
        // Broadcast to all drivers
        io.emit("newRideRequest", data);
        console.log(`📡 Ride request broadcasted to all drivers`);
        
        // Log current status
        logRideStatus();
        
      } catch (error) {
        console.error("❌ Error booking ride:", error);
      }
    });
    
    // -------------------- ACCEPT RIDE --------------------
    socket.on("acceptRide", (data) => {
      try {
        const { rideId, RAID_ID, driverId, driverName } = data;
        
        console.log(`\n✅ RIDE ACCEPTED: ${rideId || RAID_ID}`);
        console.log(`🚗 Driver: ${driverName} (${driverId})`);
        
        // Use rideId or RAID_ID to find the ride
        const rideIdentifier = rideId || RAID_ID;
        if (rides[rideIdentifier]) {
          rides[rideIdentifier].status = "accepted";
          rides[rideIdentifier].driverId = driverId;
          rides[rideIdentifier].driverName = driverName;
          rides[rideIdentifier].acceptedAt = Date.now();
          
          // Generate OTP
          const otp = Math.floor(1000 + Math.random() * 9000).toString();
          rides[rideIdentifier].otp = otp;
          
          // Notify the user
          const userId = rides[rideIdentifier].userId;
          io.to(userId).emit("rideAccepted", {
            rideId: rideIdentifier,
            driverId,
            driverName
          });
          
          // Send OTP to the user
          io.to(userId).emit("rideOTP", {
            rideId: rideIdentifier,
            otp
          });
          
          // Send OTP to the driver
          io.to(`driver_${driverId}`).emit("rideOTP", {
            rideId: rideIdentifier,
            otp
          });
          
          console.log(`📡 OTP sent to both user and driver: ${otp}`);
          
          // Update driver status
          if (activeDriverSockets.has(driverId)) {
            const driverData = activeDriverSockets.get(driverId);
            driverData.status = "onRide";
            driverData.isOnline = true; // Keep driver online
            activeDriverSockets.set(driverId, driverData);
            
            // Emit status update
            socket.emit("driverStatusUpdate", {
              driverId,
              status: "onRide"
            });
          }
          
          // Log current status
          logRideStatus();
        }
      } catch (error) {
        console.error("❌ Error accepting ride:", error);
      }
    });
    
    // -------------------- REJECT RIDE --------------------
    socket.on("rejectRide", (data) => {
      try {
        const { rideId, driverId } = data;
        
        console.log(`\n❌ RIDE REJECTED: ${rideId}`);
        console.log(`🚗 Driver: ${driverId}`);
        
        if (rides[rideId]) {
          rides[rideId].status = "rejected";
          rides[rideId].rejectedAt = Date.now();
          
          // Update driver status back to online
          if (activeDriverSockets.has(driverId)) {
            const driverData = activeDriverSockets.get(driverId);
            driverData.status = "Live";
            driverData.isOnline = true; // Keep driver online
            activeDriverSockets.set(driverId, driverData);
            
            // Emit status update
            socket.emit("driverStatusUpdate", {
              driverId,
              status: "Live"
            });
          }
          
          // Log current status
          logRideStatus();
        }
      } catch (error) {
        console.error("❌ Error rejecting ride:", error);
      }
    });
    
    // -------------------- COMPLETE RIDE --------------------
    socket.on("completeRide", (data) => {
      try {
        const { rideId, driverId, distance } = data;
        
        console.log(`\n🎉 RIDE COMPLETED: ${rideId}`);
        console.log(`🚗 Driver: ${driverId}`);
        console.log(`📏 Distance: ${distance.toFixed(2)} km`);
        
        if (rides[rideId]) {
          rides[rideId].status = "completed";
          rides[rideId].completedAt = Date.now();
          rides[rideId].distance = distance;
          
          // Notify the user
          const userId = rides[rideId].userId;
          io.to(userId).emit("rideCompleted", {
            rideId,
            distance
          });
          
          // Update driver status back to online
          if (activeDriverSockets.has(driverId)) {
            const driverData = activeDriverSockets.get(driverId);
            driverData.status = "Live";
            driverData.isOnline = true; // Keep driver online
            activeDriverSockets.set(driverId, driverData);
            
            // Emit status update
            socket.emit("driverStatusUpdate", {
              driverId,
              status: "Live"
            });
          }
          
          // Remove ride after 5 seconds
          setTimeout(() => {
            delete rides[rideId];
            console.log(`🗑️  Removed completed ride: ${rideId}`);
          }, 5000);
          
          // Log current status
          logRideStatus();
        }
      } catch (error) {
        console.error("❌ Error completing ride:", error);
      }
    });
    
    // -------------------- DRIVER HEARTBEAT --------------------
    // Add this to keep drivers online even if they don't send location updates
    socket.on("driverHeartbeat", ({ driverId }) => {
      if (activeDriverSockets.has(driverId)) {
        const driverData = activeDriverSockets.get(driverId);
        driverData.lastUpdate = Date.now();
        driverData.isOnline = true;
        activeDriverSockets.set(driverId, driverData);
        
        console.log(`❤️  Heartbeat received from driver: ${driverId}`);
      }
    });
    
    // -------------------- DISCONNECT --------------------
    socket.on("disconnect", () => {
      console.log(`\n❌ Client disconnected: ${socket.id}`);
      console.log(`📱 Remaining connected clients: ${io.engine.clientsCount - 1}`);
      
      if (socket.driverId) {
        console.log(`🛑 Driver ${socket.driverName} (${socket.driverId}) disconnected`);
        
        // Mark driver as offline but keep in memory for a while
        if (activeDriverSockets.has(socket.driverId)) {
          const driverData = activeDriverSockets.get(socket.driverId);
          driverData.isOnline = false;
          driverData.status = "Offline";
          activeDriverSockets.set(socket.driverId, driverData);
          
          // Save final location with offline status
          saveDriverLocationToDB(
            socket.driverId, 
            socket.driverName,
            driverData.location.latitude, 
            driverData.location.longitude, 
            driverData.vehicleType,
            "Offline"
          ).catch(console.error);
        }
        
        broadcastDriverLocations();
        
        // Log current status
        logDriverStatus();
      }
    });
  });
  
  // Clean up ONLY offline drivers every 60 seconds (not active ones)
  setInterval(() => {
    const now = Date.now();
    const fiveMinutesAgo = now - 300000; // 5 minutes
    let cleanedCount = 0;
    
    Array.from(activeDriverSockets.entries()).forEach(([driverId, driver]) => {
      // Only remove drivers who have been offline for more than 5 minutes
      if (!driver.isOnline && driver.lastUpdate < fiveMinutesAgo) {
        activeDriverSockets.delete(driverId);
        cleanedCount++;
        console.log(`🧹 Removed offline driver (5+ minutes): ${driver.driverName} (${driverId})`);
      }
    });
    
    if (cleanedCount > 0) {
      console.log(`\n🧹 Cleaned up ${cleanedCount} offline drivers`);
      broadcastDriverLocations();
      logDriverStatus();
    }
  }, 60000); // Check every minute
};

// Helper function to save driver location to database
async function saveDriverLocationToDB(driverId, driverName, latitude, longitude, vehicleType, status = "Live") {
  try {
    const locationDoc = new DriverLocation({
      driverId,
      driverName,
      latitude,
      longitude,
      vehicleType,
      status,
      timestamp: new Date()
    });
    
    await locationDoc.save();
    console.log(`💾 Saved location for driver ${driverId} (${driverName}) to database`);
    return true;
  } catch (error) {
    console.error("❌ Error saving driver location to DB:", error);
    return false;
  }
}

// Helper function to broadcast driver locations to all users
function broadcastDriverLocations() {
  // Only broadcast drivers who are online
  const drivers = Array.from(activeDriverSockets.values())
    .filter(driver => driver.isOnline)
    .map(driver => ({
      driverId: driver.driverId,
      name: driver.driverName,
      location: {
        coordinates: [driver.location.longitude, driver.location.latitude]
      },
      vehicleType: driver.vehicleType,
      status: driver.status,
      lastUpdate: driver.lastUpdate
    }));
  
  io.emit("driverLocationsUpdate", drivers);
}

// -------------------- GET IO INSTANCE --------------------
const getIO = () => {
  if (!io) throw new Error("❌ Socket.io not initialized!");
  return io;
};

module.exports = { init, getIO };