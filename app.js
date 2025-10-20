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
const initialButtons = document.getElementById('initial-buttons');
const uploadButton = document.getElementById('uploadButton');
const uploadInput = document.getElementById('uploadInput');

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
function showScanUI() {
    video.classList.add('hidden');
    canvas.classList.remove('hidden');
    initialButtons.classList.add('hidden');
    actionsContainer.classList.remove('hidden');
}

captureButton.addEventListener('click', () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    showScanUI();
});

uploadButton.addEventListener('click', () => {
    uploadInput.click();
});

uploadInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const MAX_WIDTH = 1024;
            let width = img.width;
            let height = img.height;
            if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
            }
            canvas.width = width;
            canvas.height = height;
            context.drawImage(img, 0, 0, width, height);
            showScanUI();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
});

retakeButton.addEventListener('click', () => {
    canvas.classList.add('hidden');
    video.classList.remove('hidden');
    actionsContainer.classList.add('hidden');
    initialButtons.classList.remove('hidden');
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
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), 20000));
    const fetchPromise = fetch('https://api.ocr.space/parse/image', { method: 'POST', body: formData });
    Promise.race([fetchPromise, timeoutPromise])
    .then(response => response.json())
    .then(data => {
        statusMessage.textContent = 'Analyzing text...';
        progressBar.style.width = '75%';
        const recognizedText = data.ParsedResults[0]?.ParsedText || 'No text recognized.';
        analyzeIngredients(recognizedText);
    })
    .catch(err => {
        console.error(err);
        let errorMessage = 'Could not connect to the OCR server. Please check your connection and API key.';
        if (err.message === 'Request timed out') {
            errorMessage = 'The server is taking too long to respond. Please try again.';
        }
        resultsDiv.innerHTML = `<div class="result-box error"><h2>Scan Failed</h2><p>${errorMessage}</p></div>`;
    })
    .finally(() => {
        scanButton.disabled = false;
        retakeButton.disabled = false;
        statusContainer.classList.add('hidden');
    });
});

// --- 3. Analyze the Ingredients (FINAL, THREE-PASS LOGIC) ---
async function analyzeIngredients(text) {
    debugContainer.classList.remove('hidden');
    debugContainer.innerHTML = `<h3>Raw Text Recognized:</h3><pre>${text || 'No text recognized'}</pre>`;

    const qualityCheck = (text.match(/[^a-zA-Z0-9\s\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]/g) || []).length;
    if ((text.length > 0 && qualityCheck / text.length > 0.4) || text.trim() === '') {
        resultsDiv.innerHTML = `<div class="result-box error"><h2>Poor Scan Quality</h2><p>The text could not be read clearly. Please try again with a better lit, non-reflective, and focused photo.</p></div>`;
        resultsDiv.scrollIntoView({ behavior: 'smooth' });
        return;
    }

    const response = await fetch('database.json');
    const db = await response.json();

    let searchableText = text.toLowerCase();
    // FIX: Standardize Japanese separators to commas and remove only whitespace for better complex term matching (e.g., カゼインNa)
    searchableText = searchableText.replace(/、/g, ',').replace(/・/g, ',').replace(/\s/g, ''); 

    // Helper function to standardize a phrase for comparison
    const standardizePhrase = (phrase) => {
        return phrase.toLowerCase().replace(/、/g, ',').replace(/・/g, ',').replace(/\s/g, '');
    }
    
    // --- NEW STEP 1A: Find and "neutralize" all universally Halal safe phrases (e.g., Vitamin C, base Casein) ---
    for (const key in db.halal_safe_exceptions) {
        for (const safePhrase of db.halal_safe_exceptions[key]) {
            const cleanedSafe = standardizePhrase(safePhrase);
            // Replace the found safe phrase with an empty string
            searchableText = searchableText.replace(new RegExp(cleanedSafe, 'g'), '');
        }
    }

    // --- STEP 1B: Find and "neutralize" conditional Halal exception phrases (e.g., Soy Emulsifier) ---
    for (const key in db.halal_exceptions) {
        for (const exceptionPhrase of db.halal_exceptions[key]) {
            const cleanedException = standardizePhrase(exceptionPhrase);
            // Replace the found exception phrase with an empty string
            searchableText = searchableText.replace(new RegExp(cleanedException, 'g'), '');
        }
    }

    let foundHaram = {};
    let foundMushbooh = {};
    
    // STEP 2: Now, find matches in the remaining (neutralized) text
    const findMatches = (list, resultMap) => {
        list.forEach(ingredient => {
            for (const alias of ingredient.aliases) {
                // Clean the alias using the same standardization
                const cleanedAlias = standardizePhrase(alias);
                
                if (cleanedAlias.length > 1 && searchableText.includes(cleanedAlias)) {
                    if (!resultMap[ingredient.name]) {
                        resultMap[ingredient.name] = new Set();
                    }
                    resultMap[ingredient.name].add(alias);
                }
            }
        });
    };

    findMatches(db.haram, foundHaram);
    findMatches(db.mushbooh, foundMushbooh);
    
    for (const category in foundHaram) {
        delete foundMushbooh[category];
    }

    const generateListHtml = (resultMap) => {
        let listHtml = '';
        for (const category in resultMap) {
            listHtml += `<div class="category-group"><h4>${category}:</h4><p class="ingredient-list">${[...resultMap[category]].join(', ')}</p></div>`;
        }
        return listHtml;
    };

    let html = '';
    const haramCategories = Object.keys(foundHaram);
    const mushboohCategories = Object.keys(foundMushbooh);

    if (haramCategories.length > 0) {
        html += `<div class="result-box haram"><h2>🔴 Haram</h2><p>This product is considered Haram because it contains the following:</p>${generateListHtml(foundHaram)}</div>`;
    }
    
    if (mushboohCategories.length > 0) {
        const marginTop = haramCategories.length > 0 ? 'style="margin-top: 15px;"' : '';
        const title = haramCategories.length > 0 ? '<h3>🟡 Doubtful Ingredients Also Found:</h3>' : '<h2>🟡 Doubtful (Mushbooh)</h2>';
        html += `<div class="result-box mushbooh" ${marginTop}>${title}<p>The source of the following ingredients should be verified:</p>${generateListHtml(foundMushbooh)}</div>`;
    }

    if (html === '') {
        html = `<div class="result-box halal"><h2>✅ Halal</h2><p>Based on our database, no Haram or Doubtful ingredients were detected.</p></div>`;
    }

    resultsDiv.innerHTML = html;
    resultsDiv.scrollIntoView({ behavior: 'smooth' });
}