// DOM elements
const videoElement = document.getElementById('video_input');
const canvasElement = document.getElementById('output_canvas');
const snapButton = document.getElementById('snap_button');
const resetButton = document.getElementById('reset_button');
const statusElement = document.getElementById('status');

// Canvas context
const canvasCtx = canvasElement.getContext('2d');
canvasElement.width = 640;
canvasElement.height = 480;

// Variables for hand tracking
let handLandmarks = null;
let lastVideoFrame = null;
let physicsEngine = null;

// Variables for snap detection - completely new approach
let previousFrameLandmarks = null;
let snapCooldown = false;
let dustMode = false;

// Variables for particles
let particles = [];

// Status updates
function updateStatus(message) {
    statusElement.textContent = message;
    console.log(message);
}

// Initialize MediaPipe Hands
updateStatus("Setting up hand tracking...");
const hands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// Process results from MediaPipe
hands.onResults((results) => {
    // Clear canvas
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Store last video frame for background
    lastVideoFrame = results.image;
    
    if (!dustMode) {
        // Draw camera feed
        canvasCtx.drawImage(
            results.image, 0, 0, canvasElement.width, canvasElement.height
        );
        
        // Check if hands are detected
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            updateStatus("Hand detected");
            handLandmarks = results.multiHandLandmarks;
            
            // Draw hands
            for (const landmarks of results.multiHandLandmarks) {
                // Draw connections
                drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, 
                    {color: '#00FF00', lineWidth: 5});
                
                // Draw landmarks
                drawLandmarks(canvasCtx, landmarks, 
                    {color: '#FF0000', lineWidth: 2});
            }
            
            // Detect snap gesture with our completely new approach
            if (results.multiHandLandmarks[0]) {
                completelyNewSnapDetection(results.multiHandLandmarks[0]);
            }
            
            // Store current landmarks for next frame comparison
            previousFrameLandmarks = JSON.parse(JSON.stringify(results.multiHandLandmarks[0]));
        } else {
            updateStatus("No hand detected");
            handLandmarks = null;
            previousFrameLandmarks = null;
        }
    } else {
        // We're in dust mode, update particles
        updateParticles();
    }
});

// Setup camera
updateStatus("Starting camera...");
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({image: videoElement});
    },
    width: 640,
    height: 480
});

camera.start()
    .then(() => {
        updateStatus("Camera started. Show your hand and make a snap gesture.");
    })
    .catch(error => {
        updateStatus("Camera error: " + error.message);
    });

// COMPLETELY NEW SNAP DETECTION!
// This checks if middle or ring finger is touching thumb and then separates
function completelyNewSnapDetection(landmarks) {
    if (snapCooldown || dustMode || !previousFrameLandmarks) return;
    
    // Get landmarks of interest:
    // - Thumb tip (4)
    // - Middle finger tip (12)
    // - Ring finger tip (16)
    const thumbTip = landmarks[4];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    
    // Get previous frame positions
    const prevThumbTip = previousFrameLandmarks[4];
    const prevMiddleTip = previousFrameLandmarks[12];
    const prevRingTip = previousFrameLandmarks[16];
    
    // Calculate current distances
    const thumbMiddleDist = getDistance(thumbTip, middleTip);
    const thumbRingDist = getDistance(thumbTip, ringTip);
    
    // Calculate previous distances
    const prevThumbMiddleDist = getDistance(prevThumbTip, prevMiddleTip);
    const prevThumbRingDist = getDistance(prevThumbTip, prevRingTip);
    
    // Calculate the change in distance (positive means they're moving apart)
    const middleDistChange = thumbMiddleDist - prevThumbMiddleDist;
    const ringDistChange = thumbRingDist - prevThumbRingDist;
    
    // Debug information
    updateStatus(`Mid: ${thumbMiddleDist.toFixed(1)} (${middleDistChange.toFixed(1)}), Ring: ${thumbRingDist.toFixed(1)} (${ringDistChange.toFixed(1)})`);
    
    // Detect a snap when:
    // 1. Either finger is very close to thumb in previous frame (touching)
    // 2. And then rapidly moves away in current frame (snapping motion)
    // 3. With significant velocity (fast motion)
    
    const MIN_TOUCH_DIST = 0.08; // How close is "touching" (normalized)
    const MIN_SEPARATION_RATE = 0.04; // How fast they need to separate (normalized)
    
    // Check middle finger snap
    if (prevThumbMiddleDist < MIN_TOUCH_DIST && middleDistChange > MIN_SEPARATION_RATE) {
        updateStatus("SNAP DETECTED! (middle finger)");
        triggerDustEffect();
        snapCooldown = true;
        setTimeout(() => { snapCooldown = false; }, 1000);
        return;
    }
    
    // Check ring finger snap
    if (prevThumbRingDist < MIN_TOUCH_DIST && ringDistChange > MIN_SEPARATION_RATE) {
        updateStatus("SNAP DETECTED! (ring finger)");
        triggerDustEffect();
        snapCooldown = true;
        setTimeout(() => { snapCooldown = false; }, 1000);
        return;
    }
}

// Helper function to get distance between landmarks (normalized)
function getDistance(landmark1, landmark2) {
    return Math.hypot(landmark1.x - landmark2.x, landmark1.y - landmark2.y);
}

// Trigger dust effect directly from hand landmarks 
function triggerDustEffect() {
    dustMode = true;
    updateStatus("Dust effect triggered!");
    
    // Initialize physics engine
    const engine = Matter.Engine.create();
    const world = engine.world;
    
    // Set gravity to be horizontal (wind effect) instead of downward
    world.gravity.x = 0.3;  // Wind blowing to the right
    world.gravity.y = 0.05; // Slight downward drift
    
    // Clear any existing particles
    particles = [];
    
    // Create particles from hand landmarks
    createParticlesFromHandLandmarks(world);
    
    // Store the engine for updates
    physicsEngine = engine;
}

// Create particles based on hand landmarks with "dust" appearance
function createParticlesFromHandLandmarks(world) {
    if (!handLandmarks || handLandmarks.length === 0) {
        updateStatus("No hand landmarks for particles!");
        return;
    }
    
    const landmarks = handLandmarks[0];
    
    // Create more particles for dustier effect
    const particleCount = 350;
    
    // Debug message to confirm we're creating particles
    console.log(`Creating ${particleCount} particles`);
    
    // Color variations for dust (browns, grays)
    const dustColors = [
        'rgba(60, 40, 20, 0.8)',   // Brown
        'rgba(80, 70, 60, 0.8)',   // Lighter brown
        'rgba(50, 50, 50, 0.8)',   // Dark gray
        'rgba(70, 70, 70, 0.8)',   // Medium gray
        'rgba(100, 90, 80, 0.8)'   // Light tan
    ];
    
    for (let i = 0; i < particleCount; i++) {
        // Randomly select a landmark to center this particle around
        const landmarkIndex = Math.floor(Math.random() * landmarks.length);
        const landmark = landmarks[landmarkIndex];
        
        // Get the base position from the landmark
        const lx = landmark.x * canvasElement.width;
        const ly = landmark.y * canvasElement.height;
        
        // Add some random offset (within 20 pixels)
        const offsetX = (Math.random() - 0.5) * 40;
        const offsetY = (Math.random() - 0.5) * 40;
        
        const x = lx + offsetX;
        const y = ly + offsetY;
        
        // Varied particle sizes, mostly small for dust effect
        const size = Math.random() * 3 + 1;
        
        // Create physics body
        const body = Matter.Bodies.circle(x, y, size, {
            friction: 0.05,
            frictionAir: 0.002,  // Air resistance for more natural movement
            restitution: 0.3,
            density: 0.0005 + Math.random() * 0.001  // Random density for varied movement
        });
        
        // Add initial random velocity (mostly rightward but with variation)
        const initialVelocity = {
            x: Math.random() * 2 + 0.5,     // Rightward velocity (0.5 to 2.5)
            y: (Math.random() - 0.5) * 1.5  // Small random vertical component
        };
        
        Matter.Body.setVelocity(body, initialVelocity);
        
        // Add to physics world
        Matter.World.add(world, body);
        
        // Create particle object with dust coloring
        const particle = {
            body: body,
            size: size,
            life: 200 + Math.random() * 200,  // Random lifespan
            color: dustColors[Math.floor(Math.random() * dustColors.length)]
        };
        
        particles.push(particle);
    }
    
    // Debug message to confirm particles were created
    console.log(`Created ${particles.length} particles`);
}

// Update and render particles for dust effect
function updateParticles() {
    // Clear canvas
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw the video frame first
    if (lastVideoFrame) {
        canvasCtx.drawImage(lastVideoFrame, 0, 0, canvasElement.width, canvasElement.height);
    }
    
    // Run the physics engine update
    if (!physicsEngine) {
        console.error("Physics engine is not initialized!");
        return;
    }
    
    Matter.Engine.update(physicsEngine);
    
    // If no particles left or all particles have moved off-screen to the right, reset
    let activeParticles = 0;
    let visibleParticles = 0;
    
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.life > 0) {
            activeParticles++;
            if (p.body.position.x < canvasElement.width + 50) {
                visibleParticles++;
            }
        }
    }
    
    if (activeParticles === 0 || visibleParticles === 0) {
        console.log("No visible particles left, resetting effect");
        resetEffect();
        return;
    }
    
    // Draw each particle
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        
        // Decrease life
        p.life -= 1;
        
        // If particle is dead or way off-screen, remove it
        if (p.life <= 0 || 
            p.body.position.y > canvasElement.height + 100 || 
            p.body.position.y < -100 ||
            p.body.position.x > canvasElement.width + 200 || 
            p.body.position.x < -200) {
            
            Matter.World.remove(physicsEngine.world, p.body);
            particles.splice(i, 1);
            continue;
        }
        
        // Calculate opacity based on life and distance from origin
        // This creates a fading effect as particles move away
        const distanceFactor = Math.min(
            Math.abs(p.body.position.x - p.body.positionPrev.x) * 10,
            1
        );
        const lifeFactor = p.life / 400;
        const opacity = Math.min(lifeFactor, 1) * 0.9;
        
        // Extract the base color and apply new opacity
        const baseColor = p.color.substring(0, p.color.lastIndexOf(',') + 1);
        const displayColor = `${baseColor} ${opacity})`;
        
        // Draw the particle
        canvasCtx.fillStyle = displayColor;
        canvasCtx.beginPath();
        canvasCtx.arc(
            p.body.position.x, 
            p.body.position.y, 
            p.size, 
            0, 
            Math.PI * 2
        );
        canvasCtx.fill();
    }
}

// Reset effect
function resetEffect() {
    // Clean up physics engine
    if (physicsEngine && particles.length > 0) {
        for (const p of particles) {
            Matter.World.remove(physicsEngine.world, p.body);
        }
    }
    
    // Reset variables
    dustMode = false;
    particles = [];
    physicsEngine = null;
    
    updateStatus("Effect reset. Show your hand and make a snap gesture.");
}

// Manual snap button
snapButton.addEventListener('click', () => {
    triggerDustEffect();
});

// Reset button
resetButton.addEventListener('click', () => {
    resetEffect();
});