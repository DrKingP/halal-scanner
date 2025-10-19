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

// --- 2. WORKFLOW ---

// When "Capture Image" is clicked
captureButton.addEventListener('click', () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    video.classList.add('hidden');
    canvas.classList.remove('hidden');
    
    captureButton.classList.add('hidden');
    actionsContainer.classList.remove('hidden');
});

// When "Retake" is clicked
retakeButton.addEventListener('click', () => {
    canvas.classList.add('hidden');
    video.classList.remove('hidden');
    
    actionsContainer.classList.add('hidden');
    captureButton.classList.remove('hidden');
    resultsDiv.innerHTML = '';
});

// When "Scan This Image" is clicked
scanButton.addEventListener('click', () => {
    // Disable both buttons to prevent issues
    scanButton.disabled = true;
    retakeButton.disabled = true;
    scanButton.textContent = 'SCANNING...';
    
    // Show a processing message immediately
    resultsDiv.innerHTML = `<div class="result-box processing"><h2>Scanning Image...</h2><p>This may take a moment. Please wait.</p></div>`;
    resultsDiv.scrollIntoView({ behavior: 'smooth' });

    // Tell Tesseract to look for English AND Japanese
    Tesseract.recognize(
        canvas,
        'eng+jpn', // Automatic language detection!
        { logger: m => console.log(m) }
    ).then(({ data: { text } }) => {
        analyzeIngredients(text);
    }).catch(err => {
        console.error(err);
        resultsDiv.innerHTML = `<div class="result-box error"><h2>Scan Failed</h2><p>Could not read the text. Please try again with a clearer, well-lit image.</p></div>`;
    }).finally(() => {
        // This ALWAYS runs, ensuring the buttons are never stuck
        scanButton.disabled = false;
        retakeButton.disabled = false;
        scanButton.textContent = 'Scan This Image';
    });
});

// --- 3. Analyze the Ingredients ---
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