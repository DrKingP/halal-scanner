// Get all the HTML elements we need
const video = document.getElementById('video');
const resultsDiv = document.getElementById('results');
const captureButton = document.getElementById('captureButton');
const mainContent = document.getElementById('main-content');
// Cropper modal elements
const cropperModal = document.getElementById('cropper-modal');
const imageToCrop = document.getElementById('image-to-crop');
const cropAndScanButton = document.getElementById('crop-and-scan-button');
const cancelCropButton = document.getElementById('cancel-crop-button');
// Status elements
const statusContainer = document.getElementById('status-container');
const statusMessage = document.getElementById('status-message');
const progressBar = document.getElementById('progress-bar');
let cropper;

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
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    imageToCrop.src = canvas.toDataURL('image/jpeg');
    
    // Show the cropper modal and HIDE the main content
    cropperModal.classList.remove('hidden');
    mainContent.classList.add('hidden'); // This is the key line
    
    cropper = new Cropper(imageToCrop, {
        viewMode: 1,
        dragMode: 'move',
        background: false,
        autoCropArea: 0.8
    });
});

// When "Cancel" in the cropper is clicked
cancelCropButton.addEventListener('click', () => {
    // Hide the cropper modal and SHOW the main content
    cropperModal.classList.add('hidden');
    mainContent.classList.remove('hidden'); // This brings the camera back
    cropper.destroy();
});

// When "Crop & Scan" is clicked
cropAndScanButton.addEventListener('click', () => {
    // Hide the cropper modal and SHOW the main content
    cropperModal.classList.add('hidden');
    mainContent.classList.remove('hidden'); // This brings the main page back for results
    resultsDiv.innerHTML = '';

    statusContainer.classList.remove('hidden');
    progressBar.style.width = '0%';
    const selectedLanguage = document.querySelector('input[name="language"]:checked').value;
    const croppedCanvas = cropper.getCroppedCanvas();
    cropper.destroy();

    Tesseract.recognize(
        croppedCanvas,
        selectedLanguage,
        { logger: m => {
            statusMessage.textContent = `${m.status.replace(/_/g, ' ')}...`;
            if (m.status === 'recognizing text') {
                progressBar.style.width = `${m.progress * 100}%`;
            }
        }}
    ).then(({ data: { text } }) => {
        analyzeIngredients(text);
    }).catch(err => {
        console.error(err);
        resultsDiv.innerHTML = `<div class="result-box error"><h2>Scan Failed</h2><p>Could not read the text. Please try again.</p></div>`;
    }).finally(() => {
        statusContainer.classList.add('hidden');
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