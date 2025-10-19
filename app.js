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

// --- YOUR API KEY IS INCLUDED HERE ---
const API_KEY = 'K89442506988957';

// --- 1. Start the Camera ---
navigator.mediaDevices.getUserMedia({ 
    video: { facingMode: 'environment' } 
})
.then(function(stream) {
    video.srcObject = stream;
    video.play();
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
    statusMessage.textContent = 'Uploading image...';
    progressBar.style.width = '25%';

    const imageDataUrl = canvas.toDataURL('image/jpeg');
    const formData = new FormData();
    formData.append('apikey', API_KEY);
    formData.append('base64Image', imageDataUrl);
    formData.append('language', 'jpn');
    formData.append('isOverlayRequired', false);

    fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        statusMessage.textContent = 'Analyzing text...';
        progressBar.style.width = '75%';
        const recognizedText = data.ParsedResults[0]?.ParsedText || 'No text recognized.';
        analyzeIngredients(recognizedText);
    })
    .catch(err => {
        console.error(err);
        resultsDiv.innerHTML = `<div class="result-box error"><h2>Scan Failed</h2><p>Could not connect to the OCR server. Please check your connection and API key.</p></div>`;
    })
    .finally(() => {
        scanButton.disabled = false;
        retakeButton.disabled = false;
        statusContainer.classList.add('hidden');
    });
});

// --- 3. Analyze the Ingredients (FINAL LOGIC WITH QUALITY CHECK) ---
async function analyzeIngredients(text) {
    debugContainer.classList.remove('hidden');
    debugContainer.innerHTML = `<h3>Raw Text Recognized:</h3><pre>${text || 'No text recognized'}</pre>`;

    // --- NEW QUALITY CHECK ---
    // A simple check: if the text contains many strange characters, it's likely a bad scan.
    const qualityCheck = (text.match(/[^a-zA-Z0-9\s\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]/g) || []).length;
    if ((text.length > 0 && qualityCheck / text.length > 0.3) || text.trim() === '') {
        resultsDiv.innerHTML = `<div class="result-box error"><h2>Poor Scan Quality</h2><p>The text could not be read clearly. Please try again with a better lit, non-reflective, and focused photo.</p></div>`;
        resultsDiv.scrollIntoView({ behavior: 'smooth' });
        return;
    }

    const response = await fetch('database.json');
    const db = await response.json();

    const searchableText = text.toLowerCase();
    let foundHaram = new Set();
    let foundMushbooh = new Set();
    
    const findMatches = (list, resultSet) => {
        list.forEach(ingredient => {
            for (const alias of ingredient.aliases) {
                const regex = new RegExp(`\\b${alias.toLowerCase().replace(/ /g, '\\s*')}\\b`, 'i');
                if (regex.test(searchableText)) {
                    resultSet.add(ingredient.name);
                    break;
                }
            }
        });
    };

    findMatches(db.haram, foundHaram);
    findMatches(db.mushbooh, foundMushbooh);
    
    foundHaram.forEach(item => foundMushbooh.delete(item));

    let html = '';
    if (foundHaram.size > 0) {
        html += `<div class="result-box haram"><h2>🔴 Haram</h2><p>This product is considered Haram because it contains the following:</p><h3>Haram Ingredients:</h3><p class="ingredient-list">${[...foundHaram].join(', ')}</p></div>`;
    }
    
    if (foundMushbooh.size > 0) {
        const marginTop = foundHaram.size > 0 ? 'style="margin-top: 15px;"' : '';
        const title = foundHaram.size > 0 ? '<h3>🟡 Doubtful Ingredients Also Found:</h3>' : '<h2>🟡 Doubtful (Mushbooh)</h2>';
        html += `<div class="result-box mushbooh" ${marginTop}>${title}<p>The source of the following ingredients should be verified:</p><p class="ingredient-list">${[...foundMushbooh].join(', ')}</p></div>`;
    }

    if (html === '') {
        html = `<div class="result-box halal"><h2>✅ Halal</h2><p>Based on our database, no Haram or Doubtful ingredients were detected.</p></div>`;
    }

    resultsDiv.innerHTML = html;
    resultsDiv.scrollIntoView({ behavior: 'smooth' });
}