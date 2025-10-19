// Get the HTML elements we need to work with
const video = document.getElementById('video');
const scanButton = document.getElementById('scanButton');
const resultsDiv = document.getElementById('results');

// --- 1. Start the Camera ---
// We ask the browser for camera access
navigator.mediaDevices.getUserMedia({ 
    video: { 
        facingMode: 'environment' // This asks for the back camera
    } 
})
.then(function(stream) {
    // If the user says "yes", we show the camera stream in the video element
    video.srcObject = stream;
    video.play();
})
.catch(function(err) {
    // If there's an error (e.g., user denies access), we log it.
    console.log("An error occurred: " + err);
});

// --- 2. Set up the Scan Button ---
scanButton.addEventListener('click', () => {
    scanButton.disabled = true;
    scanButton.textContent = 'SCANNING...';
    
    // Create a temporary canvas to draw the current video frame on
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    // Use Tesseract.js to recognize text from the canvas image
    Tesseract.recognize(
        canvas,
        'eng', // English language
        { logger: m => console.log(m) }
    ).then(({ data: { text } }) => {
        // When OCR is done, call our function to analyze the text
        analyzeIngredients(text);
        scanButton.disabled = false;
        scanButton.textContent = 'Scan Ingredients';
    });
});

// --- 3. Analyze the Ingredients ---
async function analyzeIngredients(text) {
    // Fetch our ingredient database
    const response = await fetch('database.json');
    const db = await response.json();

    // Clean up the text: make it lowercase and remove common punctuation
    const ingredientsFromImage = text.toLowerCase().replace(/[,.()\[\]{}]/g, ' ').split(/\s+/);
    
    // Use a Set to store unique found ingredients to avoid duplicates
    let foundHaram = new Set();
    let foundMushbooh = new Set();

    // Check each recognized word against our database
    ingredientsFromImage.forEach(ingredient => {
        if (db.haram.includes(ingredient)) {
            foundHaram.add(ingredient);
        }
        if (db.mushbooh.includes(ingredient)) {
            foundMushbooh.add(ingredient);
        }
    });

    // --- 4. Display the Results ---
    let html = '';
    if (foundHaram.size > 0) {
        html += `<div class="haram"><h3>🔴 Haram Ingredients Found:</h3><p>${[...foundHaram].join(', ')}</p></div>`;
    }
    if (foundMushbooh.size > 0) {
        html += `<div class="mushbooh"><h3>🟡 Doubtful (Mushbooh) Ingredients Found:</h3><p>Source should be verified for: ${[...foundMushbooh].join(', ')}</p></div>`;
    }
    if (html === '') {
        html = '<div class="halal"><h3>✅ No Haram or Doubtful Ingredients Detected</h3><p>Based on our database, the ingredients appear to be Halal. Always double-check.</p></div>';
    }

    // Add a disclaimer
    html += '<p style="font-size:12px; color: grey; margin-top: 15px;">Disclaimer: This tool is for guidance only and is not a substitute for official Halal certification. OCR accuracy may vary.</p>';

    resultsDiv.innerHTML = html;
}