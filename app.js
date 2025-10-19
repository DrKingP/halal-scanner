// Get the HTML elements we need to work with
const video = document.getElementById('video');
const scanButton = document.getElementById('scanButton');
const resultsDiv = document.getElementById('results');

// --- 1. Start the Camera ---
navigator.mediaDevices.getUserMedia({ 
    video: { 
        facingMode: 'environment'
    } 
})
.then(function(stream) {
    video.srcObject = stream;
    video.play();
})
.catch(function(err) {
    console.log("An error occurred: " + err);
});

// --- 2. Set up the Scan Button ---
scanButton.addEventListener('click', () => {
    scanButton.disabled = true;
    scanButton.textContent = 'SCANNING...';
    
    const selectedLanguage = document.querySelector('input[name="language"]:checked').value;
    console.log("Using language:", selectedLanguage);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    Tesseract.recognize(
        canvas,
        selectedLanguage,
        { logger: m => {
            console.log(m);
            if (m.status === 'recognizing text') {
                 scanButton.textContent = `SCANNING... ${Math.round(m.progress * 100)}%`;
            }
        }}
    ).then(({ data: { text } }) => {
        analyzeIngredients(text);
        scanButton.disabled = false;
        scanButton.textContent = 'Scan Ingredients';
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
        if (allHaram.includes(ingredient)) {
            foundHaram.add(ingredient);
        }
        if (allMushbooh.includes(ingredient)) {
            foundMushbooh.add(ingredient);
        }
    });

    // --- 4. Display the Results (NEW LOGIC) ---
    let html = '';

    // Case 1: At least one Haram ingredient found.
    if (foundHaram.size > 0) {
        html = `
            <div class="result-box haram">
                <h2>🔴 Haram</h2>
                <p>This product is considered Haram because it contains the following:</p>
                <h3>Haram Ingredients:</h3>
                <p class="ingredient-list">${[...foundHaram].join(', ')}</p>
        `;
        if (foundMushbooh.size > 0) {
            html += `
                <h3>Doubtful Ingredients Also Found:</h3>
                <p class="ingredient-list">${[...foundMushbooh].join(', ')}</p>
            `;
        }
        html += '</div>';

    // Case 2: NO Haram, but at least one Doubtful ingredient found.
    } else if (foundMushbooh.size > 0) {
        html = `
            <div class="result-box mushbooh">
                <h2>🟡 Doubtful (Mushbooh)</h2>
                <p>This product is Doubtful. The source of the following ingredients should be verified:</p>
                <h3>Doubtful Ingredients:</h3>
                <p class="ingredient-list">${[...foundMushbooh].join(', ')}</p>
            </div>
        `;

    // Case 3: NO Haram and NO Doubtful ingredients found.
    } else {
        html = `
            <div class="result-box halal">
                <h2>✅ Halal</h2>
                <p>Based on our database, no Haram or Doubtful ingredients were detected in the scanned text.</p>
            </div>
        `;
    }

    // Add the disclaimer at the end
    html += '<p class="disclaimer">Disclaimer: This tool is for guidance only and is not a substitute for official Halal certification. OCR accuracy may vary.</p>';

    resultsDiv.innerHTML = html;

    // Automatically scroll down to show the result
    resultsDiv.scrollIntoView({ behavior: 'smooth' }); 
}