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

// --- 3. Analyze the Ingredients (FINAL, BULLETPROOF TWO-PASS LOGIC) ---
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

    const searchableText = text.toLowerCase().replace(/[\s.,()（）\[\]{}・「」、。]/g, '');

    // STEP 1: Find all potential aliases that exist in the text, regardless of exceptions
    const findRawMatches = (list) => {
        const matches = new Map(); // Using a Map to store { alias -> ingredient object }
        list.forEach(ingredient => {
            for (const alias of ingredient.aliases) {
                const cleanedAlias = alias.toLowerCase().replace(/[\s.,()（）\[\]{}・「」、。]/g, '');
                if (cleanedAlias.length > 1 && searchableText.includes(cleanedAlias)) {
                    matches.set(alias.toLowerCase(), ingredient);
                }
            }
        });
        return matches;
    };

    let haramMatchesMap = findRawMatches(db.haram);
    let mushboohMatchesMap = findRawMatches(db.mushbooh);

    // STEP 2: Filter out exceptions from the Mushbooh list
    const exceptionsToRemove = new Set();
    mushboohMatchesMap.forEach((ingredient, alias) => {
        const exceptions = db.halal_exceptions[alias];
        if (exceptions) {
            for (const exceptionPhrase of exceptions) {
                const cleanedException = exceptionPhrase.toLowerCase().replace(/[\s.,()（）\[\]{}・「」、。]/g, '');
                if (searchableText.includes(cleanedException)) {
                    exceptionsToRemove.add(alias);
                    break;
                }
            }
        }
    });
    exceptionsToRemove.forEach(alias => mushboohMatchesMap.delete(alias));

    // STEP 3: Group the final, filtered aliases by their category for display
    const groupResults = (matchesMap) => {
        const resultMap = {};
        matchesMap.forEach((ingredient, alias) => {
            const originalAlias = ingredient.aliases.find(a => a.toLowerCase() === alias) || alias;
            if (!resultMap[ingredient.name]) {
                resultMap[ingredient.name] = new Set();
            }
            resultMap[ingredient.name].add(originalAlias);
        });
        return resultMap;
    };

    let foundHaram = groupResults(haramMatchesMap);
    let foundMushbooh = groupResults(mushboohMatchesMap);

    // FINAL REDUNDANCY FIX: If a specific term is found, remove its general parent from the same category
    for (const category in foundMushbooh) {
        const specificTerms = [...foundMushbooh[category]].filter(t => t.length > 3); // A simple heuristic
        specificTerms.forEach(specific => {
            [...foundMushbooh[category]].forEach(general => {
                if (specific.toLowerCase() !== general.toLowerCase() && specific.toLowerCase().includes(general.toLowerCase())) {
                    foundMushbooh[category].delete(general);
                }
            });
        });
    }

    for (const category in foundHaram) {
        delete foundMushbooh[category];
    }

    // STEP 4: Generate the final HTML
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