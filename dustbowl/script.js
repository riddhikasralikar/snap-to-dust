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

// Variables for tracking
let handLandmarks = null;
let poseLandmarks = null;
let faceLandmarks = null;
let lastVideoFrame = null;
let physicsEngine = null;

// Variables for snap detection - improved approach
let previousFrameLandmarks = null;
let snapCooldown = false;
let dustMode = false;

// Variables for particles
let particles = [];

// Variables for flashing text
let showFlashingText = false;
let flashingTextTimer = 0;
let flashingTextState = true; // true for red, false for white

// Body part weights for particle distribution
const bodyPartWeights = {
    hands: 5,    // Particles from hands
    face: 12,    // Many particles from face
    body: 15     // Most particles from body
};

// Status updates
function updateStatus(message) {
    statusElement.textContent = message;
    console.log(message);
}

// Initialize MediaPipe Hands and Pose
updateStatus("Setting up hand and body tracking...");
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

// Initialize Pose detection
const pose = new Pose({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// Variables to store detection results
let handResults = null;
let poseResults = null;

// Process results from MediaPipe Hands
hands.onResults((results) => {
    handResults = results;
    handLandmarks = results.multiHandLandmarks;
    
    // Only process if we have both results or are in dust mode
    if (poseResults || dustMode) {
        processResults();
    }
});

// Process results from MediaPipe Pose
pose.onResults((results) => {
    poseResults = results;
    poseLandmarks = results.poseLandmarks;
    faceLandmarks = results.faceLandmarks;
    
    // Only process if we have both results or are in dust mode
    if (handResults || dustMode) {
        processResults();
    }
});

// Fix potential bug with text not showing by placing it inside the main loop
function processResults() {
    // Clear canvas
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Use either pose results or hand results for the video frame
    if (poseResults && poseResults.image) {
        lastVideoFrame = poseResults.image;
    } else if (handResults && handResults.image) {
        lastVideoFrame = handResults.image;
    }
    
    if (!dustMode) {
        // Draw camera feed
        if (lastVideoFrame) {
            canvasCtx.drawImage(
                lastVideoFrame, 0, 0, canvasElement.width, canvasElement.height
            );
        }
        
        // Draw pose skeleton if detected
        if (poseLandmarks) {
            drawConnectors(canvasCtx, poseLandmarks, POSE_CONNECTIONS,
                {color: '#00B5FF', lineWidth: 4});
            drawLandmarks(canvasCtx, poseLandmarks,
                {color: '#FF0000', lineWidth: 2});
        }
        
        // Draw hands if detected
        if (handLandmarks && handLandmarks.length > 0) {
            updateStatus("Hand detected");
            
            // Draw hands
            for (const landmarks of handLandmarks) {
                // Draw connections
                drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, 
                    {color: '#00FF00', lineWidth: 5});
                
                // Draw landmarks
                drawLandmarks(canvasCtx, landmarks, 
                    {color: '#FF0000', lineWidth: 2});
            }
            
            // Detect snap gesture with our improved approach
            if (handLandmarks[0]) {
                improvedSnapDetection(handLandmarks[0]);
            }
            
            // Store current landmarks for next frame comparison
            previousFrameLandmarks = JSON.parse(JSON.stringify(handLandmarks[0]));
        } else {
            handLandmarks = null;
            previousFrameLandmarks = null;
        }
        
        if (!handLandmarks && !poseLandmarks) {
            updateStatus("No body or hand detected");
        } else if (poseLandmarks && !handLandmarks) {
            updateStatus("Body detected, no hands");
        }
    } else {
        // We're in dust mode, update particles
        updateParticles();
        
        // GUARANTEED TEXT DRAWING - DIRECT IMPLEMENTATION
        if (showFlashingText) {
            // Update flash timer (toggle every 7 frames for faster flashing)
            flashingTextTimer++;
            if (flashingTextTimer >= 7) {
                flashingTextTimer = 0;
                flashingTextState = !flashingTextState;
            }
            
            // Set fill color based on flash state - HIGH CONTRAST COLORS
            const fillColor = flashingTextState ? '#FF0000' : '#FFFFFF';
            
            // Position in the absolute center of the canvas
            const centerX = canvasElement.width / 2;
            const centerY = canvasElement.height / 2;
            
            // Draw text with maximum visibility
            drawBigText(canvasCtx, "GET DUSTBOWLED", centerX, centerY - 70, fillColor);
            drawBigText(canvasCtx, "IDIOT", centerX, centerY + 70, fillColor);
        }
    }
}

// Helper function for drawing big text with multiple outlines
function drawBigText(ctx, text, x, y, fillColor) {
    // Save the current canvas state
    ctx.save();
    
    // Flip the text horizontally to counter the mirror effect of the camera
    ctx.scale(-1, 1);
    x = -x; // Adjust x position for the flipped context
    
    // Set text properties - ENORMOUS SIZE
    ctx.font = 'bold 100px Impact, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // First thick black outline
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 15;
    ctx.strokeText(text, x, y);
    
    // Second yellow outline for contrast
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 8;
    ctx.strokeText(text, x, y);
    
    // Fill with current flashing color
    ctx.fillStyle = fillColor;
    ctx.fillText(text, x, y);
    
    // Restore the canvas state
    ctx.restore();
}

// Setup camera
updateStatus("Starting camera...");
const camera = new Camera(videoElement, {
    onFrame: async () => {
        // Send the same frame to both models
        await hands.send({image: videoElement});
        await pose.send({image: videoElement});
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

// IMPROVED SNAP DETECTION with HAND ORIENTATION AWARENESS!
// This checks if middle or ring finger touches thumb and then moves in the correct direction
// based on the hand's orientation
function improvedSnapDetection(landmarks) {
    if (snapCooldown || dustMode || !previousFrameLandmarks) return;
    
    // Get landmarks of interest:
    // Wrist (0), thumb base (1), thumb tip (4), index knuckle (5), 
    // Middle finger tip (12), Ring finger tip (16)
    const wrist = landmarks[0];
    const thumbBase = landmarks[1];
    const thumbTip = landmarks[4];
    const indexKnuckle = landmarks[5];
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
    
    // Check if fingers were touching thumb in previous frame
    const MIN_TOUCH_DIST = 0.08; // How close is "touching" (normalized)
    const wasTouchingMiddle = prevThumbMiddleDist < MIN_TOUCH_DIST;
    const wasTouchingRing = prevThumbRingDist < MIN_TOUCH_DIST;
    
    // Determine hand orientation by calculating the angle between wrist-knuckle line and vertical
    const dx = indexKnuckle.x - wrist.x;
    const dy = indexKnuckle.y - wrist.y;
    const handAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    
    // Determine hand orientation category
    // Hand angle within +/- 45 degrees of vertical is considered upright
    // Otherwise it's considered sideways
    const isHandUpright = Math.abs(handAngle) > 45 && Math.abs(handAngle) < 135;
    
    // Get thumb direction vector (from base to tip)
    const thumbDirX = thumbTip.x - thumbBase.x;
    const thumbDirY = thumbTip.y - thumbBase.y;
    
    // Determine if a finger has moved in the correct snap direction based on hand orientation
    let middleSnapped = false;
    let ringSnapped = false;
    
    if (wasTouchingMiddle || wasTouchingRing) {
        if (isHandUpright) {
            // For upright hand, check if finger moved below thumb
            // In the Y coordinate, higher values are lower in the image
            middleSnapped = wasTouchingMiddle && 
                           middleTip.y > thumbTip.y && 
                           prevMiddleTip.y <= prevThumbTip.y;
            
            ringSnapped = wasTouchingRing && 
                         ringTip.y > thumbTip.y && 
                         prevRingTip.y <= prevThumbTip.y;
            
            updateStatus(`Hand UPRIGHT: Mid: ${thumbMiddleDist.toFixed(3)} (${middleTip.y > thumbTip.y ? 'below' : 'above'}), 
                        Ring: ${thumbRingDist.toFixed(3)} (${ringTip.y > thumbTip.y ? 'below' : 'above'})`);
        } else {
            // For sideways hand, check direction perpendicular to thumb direction
            
            // Calculate perpendicular vector to thumb (rotate 90 degrees)
            const perpX = -thumbDirY;
            const perpY = thumbDirX;
            
            // Normalize the perpendicular vector
            const perpLength = Math.sqrt(perpX * perpX + perpY * perpY);
            const perpNormX = perpX / perpLength;
            const perpNormY = perpY / perpLength;
            
            // Check if middle finger moved in the perpendicular direction
            const middlePrevDotProd = (prevMiddleTip.x - prevThumbTip.x) * perpNormX + 
                                     (prevMiddleTip.y - prevThumbTip.y) * perpNormY;
            const middleCurrDotProd = (middleTip.x - thumbTip.x) * perpNormX + 
                                     (middleTip.y - thumbTip.y) * perpNormY;
            
            // Check if ring finger moved in the perpendicular direction
            const ringPrevDotProd = (prevRingTip.x - prevThumbTip.x) * perpNormX + 
                                   (prevRingTip.y - prevThumbTip.y) * perpNormY;
            const ringCurrDotProd = (ringTip.x - thumbTip.x) * perpNormX + 
                                   (ringTip.y - thumbTip.y) * perpNormY;
            
            // A negative dot product means the finger has moved in the "snap" direction
            // relative to the thumb orientation
            middleSnapped = wasTouchingMiddle && 
                           middlePrevDotProd > -0.03 && 
                           middleCurrDotProd < -0.05;
            
            ringSnapped = wasTouchingRing && 
                         ringPrevDotProd > -0.03 && 
                         ringCurrDotProd < -0.05;
            
            updateStatus(`Hand SIDEWAYS (${handAngle.toFixed(0)}°): Mid: ${middleCurrDotProd.toFixed(3)}, Ring: ${ringCurrDotProd.toFixed(3)}`);
        }
    }
    
    // Detect a snap when either finger has moved in the correct snap direction
    if (middleSnapped) {
        updateStatus("SNAP DETECTED! (middle finger)");
        triggerDustEffect();
        snapCooldown = true;
        setTimeout(() => { snapCooldown = false; }, 1000);
        return;
    }
    
    if (ringSnapped) {
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

// Trigger dust effect from all detected landmarks
function triggerDustEffect() {
    dustMode = true;
    updateStatus("Disintegration effect triggered!");
    
    // Initialize physics engine
    const engine = Matter.Engine.create();
    const world = engine.world;
    
    // Set gravity to be horizontal (wind effect) in the left direction
    world.gravity.x = -0.3;  // Wind blowing to the left
    world.gravity.y = 0.05;  // Slight downward drift
    
    // Clear any existing particles
    particles = [];
    
    // Create particles from all available landmarks
    createParticlesFromHandLandmarks(world);
    
    // Store the engine for updates
    physicsEngine = engine;
    
    // Activate flashing text
    showFlashingText = true;
    flashingTextTimer = 0;
}

// Create particles based on body, face, and hand landmarks
function createParticlesFromHandLandmarks(world) {
    // Reduced total particles for better performance
    const totalParticleCount = 1000;
    
    // Initialize empty arrays if landmarks are null
    const hands = handLandmarks && handLandmarks.length > 0 ? handLandmarks : [];
    const body = poseLandmarks || [];
    
    // Detect if we have any landmarks to work with
    if (hands.length === 0 && body.length === 0) {
        updateStatus("No landmarks detected for particles!");
        return;
    }
    
    // Debug message
    updateStatus(`Creating disintegration effect with ${totalParticleCount} particles`);
    
    // Color variations for dust (browns, grays)
    const dustColors = [
        'rgba(60, 40, 20, 0.8)',   // Brown
        'rgba(80, 70, 60, 0.8)',   // Lighter brown
        'rgba(50, 50, 50, 0.8)',   // Dark gray
        'rgba(70, 70, 70, 0.8)',   // Medium gray
        'rgba(100, 90, 80, 0.8)'   // Light tan
    ];
    
    // Calculate the number of particles for each body part based on weights
    // and what landmarks are available
    let totalWeight = 0;
    if (hands.length > 0) totalWeight += bodyPartWeights.hands;
    if (body.length > 0) {
        // Check if face points (0-10) are present in pose landmarks
        const hasFacePoints = body.length > 10 && 
                             body.slice(0, 10).some(lm => lm && lm.visibility > 0.5);
        
        if (hasFacePoints) totalWeight += bodyPartWeights.face;
        totalWeight += bodyPartWeights.body;
    }
    
    // If no weights, just return (shouldn't happen but just in case)
    if (totalWeight === 0) return;
    
    // Calculate particle counts
    const handParticles = hands.length > 0 ? 
        Math.floor(totalParticleCount * bodyPartWeights.hands / totalWeight) : 0;
    
    const faceParticles = body.length > 0 && body[0] && body[0].visibility > 0.5 ? 
        Math.floor(totalParticleCount * bodyPartWeights.face / totalWeight) : 0;
    
    const bodyParticles = body.length > 0 ? 
        totalParticleCount - handParticles - faceParticles : 0;
    
    console.log(`Particle distribution - Hand: ${handParticles}, Face: ${faceParticles}, Body: ${bodyParticles}`);
    
    // Create particles for hands with wide dispersion
    if (handParticles > 0 && hands.length > 0) {
        for (let i = 0; i < handParticles; i++) {
            // Select which hand to use (if multiple)
            const handIndex = hands.length > 1 ? Math.floor(Math.random() * hands.length) : 0;
            const landmarks = hands[handIndex];
            
            // Randomly select a landmark
            const landmarkIndex = Math.floor(Math.random() * landmarks.length);
            const landmark = landmarks[landmarkIndex];
            
            // Create particle with wider dispersion (100px offset range)
            createSingleParticle(landmark.x, landmark.y, dustColors, world, 100);
        }
    }
    
    // Create particles for face with wide dispersion
    if (faceParticles > 0 && body.length > 0) {
        // Face landmarks are 0-10 in MediaPipe Pose
        const faceLandmarkIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        
        for (let i = 0; i < faceParticles; i++) {
            // Select a random face landmark
            const landmarkIndex = faceLandmarkIndices[Math.floor(Math.random() * faceLandmarkIndices.length)];
            if (body[landmarkIndex] && body[landmarkIndex].visibility > 0.5) {
                // Create particle with wider dispersion (100px offset range)
                createSingleParticle(body[landmarkIndex].x, body[landmarkIndex].y, dustColors, world, 100);
            } else {
                // If landmark isn't visible, try a body landmark instead
                const randomBodyIndex = 11 + Math.floor(Math.random() * (body.length - 11));
                if (body[randomBodyIndex] && body[randomBodyIndex].visibility > 0.5) {
                    createSingleParticle(body[randomBodyIndex].x, body[randomBodyIndex].y, dustColors, world, 100);
                }
            }
        }
    }
    
    // Create particles for body with wider dispersion
    if (bodyParticles > 0 && body.length > 0) {
        // Filter for visible body landmarks
        const visibleBodyLandmarks = body
            .slice(11)
            .map((lm, idx) => ({ index: idx + 11, landmark: lm }))
            .filter(item => item.landmark && item.landmark.visibility > 0.5);
        
        // If we have visible landmarks, create widely dispersed particles
        if (visibleBodyLandmarks.length > 0) {
            for (let i = 0; i < bodyParticles; i++) {
                // Select a random visible body landmark
                const landmarkData = visibleBodyLandmarks[
                    Math.floor(Math.random() * visibleBodyLandmarks.length)
                ];
                
                // Create particle with much wider dispersion (120px offset range)
                createSingleParticle(
                    landmarkData.landmark.x, 
                    landmarkData.landmark.y, 
                    dustColors, 
                    world,
                    120  // Much larger offset for better dispersion
                );
            }
        } else {
            // Fallback if no visible body landmarks
            for (let i = 0; i < bodyParticles; i++) {
                const randomBodyIndex = 11 + Math.floor(Math.random() * (body.length - 11));
                if (body[randomBodyIndex]) {
                    createSingleParticle(body[randomBodyIndex].x, body[randomBodyIndex].y, dustColors, world, 100);
                }
            }
        }
    }
    
    // Debug message to confirm particles were created
    console.log(`Created ${particles.length} particles`);
}

// Helper function to create a single particle
function createSingleParticle(normalizedX, normalizedY, dustColors, world, offsetRange = 40) {
    // Convert normalized coordinates to canvas coordinates
    const x = normalizedX * canvasElement.width;
    const y = normalizedY * canvasElement.height;
    
    // Add random offset with specified range
    const offsetX = (Math.random() - 0.5) * offsetRange;
    const offsetY = (Math.random() - 0.5) * offsetRange;
    
    const finalX = x + offsetX;
    const finalY = y + offsetY;
    
    // Varied particle sizes, slightly larger for better visibility with fewer particles
    const size = Math.random() * 4 + 1.5;
    
    // Create physics body with reduced mass for better performance
    const body = Matter.Bodies.circle(finalX, finalY, size, {
        friction: 0.03,         // Reduced friction
        frictionAir: 0.001,     // Reduced air resistance for faster movement
        restitution: 0.4,       // Slightly increased bounciness
        density: 0.0002 + Math.random() * 0.0005  // Reduced density for better performance
    });
    
    // Add initial random velocity (leftward but with MORE variation)
    const initialVelocity = {
        x: Math.random() * -3 - 1,    // Faster leftward velocity (-1 to -4)
        y: (Math.random() - 0.5) * 2.5  // More vertical variation
    };
    
    Matter.Body.setVelocity(body, initialVelocity);
    
    // Add to physics world
    Matter.World.add(world, body);
    
    // Create particle object with dust coloring
    const particle = {
        body: body,
        size: size,
        life: 150 + Math.random() * 150,  // Reduced lifespan for better performance
        color: dustColors[Math.floor(Math.random() * dustColors.length)]
    };
    
    particles.push(particle);
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
    
    // If no particles left or all particles have moved off-screen to the left, reset
    let activeParticles = 0;
    let visibleParticles = 0;
    
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.life > 0) {
            activeParticles++;
            if (p.body.position.x > -50) { // Changed from < width+50 to > -50 for leftward movement
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
            p.body.position.x < -200 ||  // Changed for leftward movement
            p.body.position.x > canvasElement.width + 200) {
            
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
    showFlashingText = false;
    flashingTextTimer = 0;
    
    // Also reset detection results to ensure clean state
    handResults = null;
    poseResults = null;
    
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