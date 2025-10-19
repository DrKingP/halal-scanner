// Get all the HTML elements we need
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const resultsDiv = document.getElementById('results');
const captureButton = document.getElementById('captureButton');
const scanButton = document.getElementById('scanButton');
const retakeButton = document.getElementById('retakeButton');
const actionsContainer = document.getElementById('actions-container');
const context = canvas.getContext('2d');

// --- 1. Start the Camera ---
navigator.mediaDevices.getUserMedia({ 
    video: { facingMode: 'environment' } 
})
.then(function(stream) {
    video.srcObject = stream;
    video.play();
})
.catch(function(err) {
    console.log("An error occurred: " + err);
    resultsDiv.innerHTML = `<div class="result-box error"><h2>Camera Error</h2><p>Could not access the camera. Please make sure you have granted permission.</p></div>`;
});

// --- 2. NEW WORKFLOW ---

// When "Capture Image" is clicked
captureButton.addEventListener('click', () => {
    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    // Draw the current video frame onto the canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Hide the video and show the canvas (the captured image)
    video.classList.add('hidden');
    canvas.classList.remove('hidden');
    
    // Hide the capture button
    captureButton.classList.add('hidden');
    // Show the "Scan" and "Retake" buttons
    actionsContainer.classList.remove('hidden');
});

// When "Retake" is clicked
retakeButton.addEventListener('click', () => {
    // Hide the canvas and show the video feed again
    canvas.classList.add('hidden');
    video.classList.remove('hidden');
    
    // Hide the "Scan" and "Retake" buttons
    actionsContainer.classList.add('hidden');
    // Show the main capture button
    captureButton.classList.remove('hidden');
    // Clear any previous results
    resultsDiv.innerHTML = '';
});

// When "Scan This Image" is clicked
scanButton.addEventListener('click', () => {
    scanButton.disabled = true;
    scanButton.textContent = 'SCANNING...';
    resultsDiv.innerHTML = ''; // Clear previous results

    const selectedLanguage = document.querySelector('input[name="language"]:checked').value;

    Tesseract.recognize(
        canvas, // Process the image from the canvas
        selectedLanguage,
        { logger: m => console.log(m) }
    ).then(({ data: { text } }) => {
        analyzeIngredients(text);
    }).catch(err => {
        // THIS IS THE NEW ERROR HANDLING!
        console.error(err);
        resultsDiv.innerHTML = `<div class="result-box error"><h2>Scan Failed</h2><p>Could not read the text. Please try again with a clearer, well-lit image.</p></div>`;
    }).finally(() => {
        // THIS IS NEW! IT RUNS AFTER SUCCESS OR FAILURE
        // Reset the button so the user can try again
        scanButton.disabled = false;
        scanButton.textContent = 'Scan This Image';
    });
});

// --- 3. Analyze the Ingredients (No changes needed here) ---
async function analyzeIngredients(text) {
    const response = await fetch('database.json');
    const db = await response.json();
    const ingredientsFromImage = text.toLowerCase().replace(/[,.()\[\]{}・「」、。]/g, ' ').split(/\s+/);
    let foundHaram = new Set();
    let foundMushbooh = new Set();
    const allHaram = [...db.haram_en, ...db.haram_jp];
    const allMushbooh = [...db.mushbooh_en, ...db.mushbooh_jp];
    ingredientsFromImage.forEach(ingredient => {
        if (allHaram.includes(ingredient)) { foundHaram.add(ingredient); }
        if (allMushbooh.includes(ingredient)) { foundMushbooh.add(ingredient); }
    });
    let html = '';
    if (foundHaram.size > 0) {
        html = `<div class="result-box haram"><h2>🔴 Haram</h2><p>This product is considered Haram because it contains the following:</p><h3>Haram Ingredients:</h3><p class="ingredient-list">${[...foundHaram].join(', ')}</p>`;
        if (foundMushbooh.size > 0) { html += `<h3>Doubtful Ingredients Also Found:</h3><p class="ingredient-list">${[...foundMushbooh].join(', ')}</p>`; }
        html += '</div>';
    } else if (foundMushbooh.size > 0) {
        html = `<div class="result-box mushbooh"><h2>🟡 Doubtful (Mushbooh)</h2><p>This product is Doubtful. The source of the following ingredients should be verified:</p><h3>Doubtful Ingredients:</h3><p class="ingredient-list">${[...foundMushbooh].join(', ')}</p></div>`;
    } else {
        html = `<div class="result-box halal"><h2>✅ Halal</h2><p>Based on our database, no Haram or Doubtful ingredients were detected in the scanned text.</p></div>`;
    }
    html += '<p class="disclaimer">Disclaimer: This tool is for guidance only and is not a substitute for official Halal certification. OCR accuracy may vary.</p>';
    resultsDiv.innerHTML = html;
    resultsDiv.scrollIntoView({ behavior: 'smooth' });
}