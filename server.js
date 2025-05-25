const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const app = express();

// Use PORT from environment variable (required by Render)
const port = process.env.PORT || 3000;

const DB_FILE = path.join(__dirname, 'barcodes.json');

// Enable CORS for all origins (adjust for production)
app.use(cors({
    origin: '*' // Allow all origins for testing; specify origins in production
}));

// Middleware to parse JSON
app.use(express.json());

// Serve static files (index.html)
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database file if it doesn't exist
async function initDatabase() {
    try {
        await fs.access(DB_FILE);
    } catch {
        await fs.writeFile(DB_FILE, JSON.stringify([]));
    }
}

// Read database
async function readDatabase() {
    try {
        const data = await fs.readFile(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading database:', error);
        return [];
    }
}

// Write to database
async function writeDatabase(data) {
    try {
        await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error writing to database:', error);
        throw error;
    }
}

// Endpoint to get latest barcodes
app.get('/api/barcodes', async (req, res) => {
    try {
        const folders = await readDatabase();
        if (folders.length === 0) {
            return res.json({ barcodes: [], folderId: null });
        }
        const latestFolder = folders[folders.length - 1];
        res.json({ barcodes: latestFolder.barcodes, folderId: latestFolder.folderId });
    } catch (error) {
        console.error('Error fetching barcodes:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Endpoint to store barcodes
app.post('/api/barcodes', async (req, res) => {
    try {
        const { barcodes, timestamp } = req.body;
        if (!barcodes || !Array.isArray(barcodes)) {
            return res.status(400).json({ error: 'Invalid barcode data' });
        }
        const folderId = uuidv4();
        const folderData = { folderId, barcodes, timestamp };
        const folders = await readDatabase();
        folders.push(folderData);
        await writeDatabase(folders);
        res.json({ folderId });
    } catch (error) {
        console.error('Error storing barcodes:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Endpoint to display barcode data in HTML
app.get('/download/:folderId', async (req, res) => {
    try {
        const { folderId } = req.params;
        const folders = await readDatabase();
        const data = folders.find(folder => folder.folderId === folderId);
        if (!data || !data.barcodes) {
            return res.status(404).send('Barcode data not found');
        }

        const currentDate = new Date(data.timestamp);
        const htmlContent = `
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>تقرير مجلد الباركود</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f9f9f9; padding: 20px; direction: rtl; }
                    .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
                    h1 { color: #2d3748; text-align: center; margin-bottom: 20px; }
                    .metadata { margin-bottom: 20px; color: #4a5568; }
                    .barcode-list { list-style: none; padding: 0; }
                    .barcode-item { padding: 10px; border-bottom: 1px solid #e2e8f0; }
                    .barcode-text { font-family: 'Courier New', monospace; color: #2d3748; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>تقرير مجلد الباركود</h1>
                    <div class="metadata">
                        <p>تاريخ الإنشاء: ${currentDate.toLocaleDateString('ar-SA')}</p>
                        <p>الوقت: ${currentDate.toLocaleTimeString('ar-SA')}</p>
                        <p>إجمالي الباركودات: ${data.barcodes.length}</p>
                    </div>
                    <ul class="barcode-list">
                        ${data.barcodes.map((barcode, index) => `
                            <li class="barcode-item">
                                <span class="barcode-text">${index + 1}. ${barcode}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </body>
            </html>
        `;

        res.setHeader('Content-Type', 'text/html');
        res.send(htmlContent);
    } catch (error) {
        console.error('Error generating HTML:', error);
        res.status(500).send(`Error generating HTML: ${error.message}`);
    }
});

// Initialize and start server
initDatabase().then(() => {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}).catch((error) => {
    console.error('Failed to start server:', error);
});