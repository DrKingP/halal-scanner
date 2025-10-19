// Get all the HTML elements we need
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const resultsDiv = document.getElementById('results');
const captureButton = document.getElementById('captureButton');
const scanButton = document.getElementById('scanButton');
const retakeButton = document.getElementById('retakeButton');
const actionsContainer = document.getElementById('actions-container');
const context = canvas.getContext('2d');
const statusContainer = document.getElementById('status-container');
const statusMessage = document.getElementById('status-message');
const progressBar = document.getElementById('progress-bar');
const debugContainer = document.getElementById('debug-container');

// --- 1. Start the Camera ---
navigator.mediaDevices.getUserMedia({ 
    video: { facingMode: 'environment' } 
})
.then(function(stream) {
    video.srcObject = stream;
    video.play();
})
.catch(function(err) {
    console.error("Camera Error:", err);
    resultsDiv.innerHTML = `<div class="result-box error"><h2>Camera Error</h2><p>Could not access the camera. Please check browser and system permissions.</p></div>`;
});

// --- 2. WORKFLOW ---
captureButton.addEventListener('click', () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    video.classList.add('hidden');
    canvas.classList.remove('hidden');
    captureButton.classList.add('hidden');
    actionsContainer.classList.remove('hidden');
});

retakeButton.addEventListener('click', () => {
    canvas.classList.add('hidden');
    video.classList.remove('hidden');
    actionsContainer.classList.add('hidden');
    captureButton.classList.remove('hidden');
    resultsDiv.innerHTML = '';
    statusContainer.classList.add('hidden');
    debugContainer.classList.add('hidden'); 
});

scanButton.addEventListener('click', () => {
    scanButton.disabled = true;
    retakeButton.disabled = true;
    resultsDiv.innerHTML = '';
    debugContainer.classList.add('hidden');
    statusContainer.classList.remove('hidden');
    progressBar.style.width = '0%';
    
    const languages = 'eng+jpn';

    Tesseract.recognize(
        canvas,
        languages,
        { logger: m => {
            statusMessage.textContent = `${m.status.replace(/_/g, ' ')}...`;
            if (m.status === 'recognizing text') { progressBar.style.width = `${m.progress * 100}%`; }
        }}
    ).then(({ data: { text } }) => {
        analyzeIngredients(text);
    }).catch(err => {
        console.error(err);
        resultsDiv.innerHTML = `<div class="result-box error"><h2>Scan Failed</h2><p>Could not read the text. Please try again with a clearer image.</p></div>`;
    }).finally(() => {
        scanButton.disabled = false;
        retakeButton.disabled = false;
        statusContainer.classList.add('hidden');
    });
});

// --- 3. Analyze the Ingredients (FINAL LOGIC) ---
async function analyzeIngredients(text) {
    // Show the raw OCR output first
    debugContainer.classList.remove('hidden');
    debugContainer.innerHTML = `<h3>Raw Text Recognized:</h3><pre>${text || 'No text recognized'}</pre>`;

    // NEW: Check if any text was recognized at all
    if (!text || text.trim() === '') {
        resultsDiv.innerHTML = `<div class="result-box error"><h2>Scan Failed</h2><p>No text could be detected in the image. Please try again with a clear, well-lit photo of printed text.</p></div>`;
        resultsDiv.scrollIntoView({ behavior: 'smooth' });
        return; // Exit the function immediately
    }

    const response = await fetch('database.json');
    const db = await response.json();

    const ingredientsFromImage = text
        .toLowerCase()
        .replace(/[.,()"\[\]{}・「」、。]/g, ' ')
        .split(/\s+/) 
        .filter(word => word.length > 0);

    let foundHaram = new Set();
    let foundMushbooh = new Set();
    const allHaram = [...db.haram_en, ...db.haram_jp];
    const allMushbooh = [...db.mushbooh_en, ...db.mushbooh_jp];
    
    ingredientsFromImage.forEach(ingredient => {
        if (allHaram.includes(ingredient)) {
            foundHaram.add(ingredient);
        }
        if (allMushbooh.includes(ingredient)) {
            foundMushbooh.add(ingredient);
        }
    });

    let html = '';
    if (foundHaram.size > 0) {
        html = `<div class="result-box haram"><h2>🔴 Haram</h2><p>This product is considered Haram because it contains the following:</p><h3>Haram Ingredients:</h3><p class="ingredient-list">${[...foundHaram].join(', ')}</p></div>`;
    } else if (foundMushbooh.size > 0) {
        html = `<div class="result-box mushbooh"><h2>🟡 Doubtful (Mushbooh)</h2><p>This product is Doubtful. The source of the following ingredients should be verified:</p><h3>Doubtful Ingredients:</h3><p class="ingredient-list">${[...foundMushbooh].join(', ')}</p></div>`;
    } else {
        html = `<div class="result-box halal"><h2>✅ Halal</h2><p>Based on our database, no Haram or Doubtful ingredients were detected.</p></div>`;
    }

    resultsDiv.innerHTML = html;
    resultsDiv.scrollIntoView({ behavior: 'smooth' });
}