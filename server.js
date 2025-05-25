const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const port = 3000;

const DB_FILE = path.join(__dirname, 'barcodes.json');
// Path to Arabic font (place Amiri-Regular.ttf in a fonts directory)
const ARABIC_FONT_PATH = path.join(__dirname, 'fonts', 'Amiri-Regular.ttf');

// Enable CORS for all origins (adjust for production)
app.use(cors({
    origin: '*' // Allow all origins for testing; specify origins in production
}));

// Middleware to parse JSON
app.use(express.json());

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

// Endpoint to download PDF
app.get('/download/:folderId', async (req, res) => {
    try {
        const { folderId } = req.params;
        const folders = await readDatabase();
        const data = folders.find(folder => folder.folderId === folderId);
        if (!data || !data.barcodes) {
            return res.status(404).send('Barcode data not found');
        }

        const doc = new PDFDocument({ autoFirstPage: false }); // Delay page creation for RTL setup
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=barcode-folder-${folderId}.pdf`);

        doc.pipe(res);

        // Add a new page with RTL layout
        doc.addPage({
            layout: 'portrait',
            margin: 20
        });

        // Register Arabic font
        doc.registerFont('Amiri', ARABIC_FONT_PATH);

        // Set font and size for header
        doc.font('Amiri').fontSize(16);
        doc.text('تقرير مجلد الباركود', 190, 20, { align: 'right' }); // Start from right edge

        // Add metadata
        doc.fontSize(12);
        const currentDate = new Date(data.timestamp);
        doc.text(`تاريخ الإنشاء: ${currentDate.toLocaleDateString('ar-SA')}`, 190, 35, { align: 'right' });
        doc.text(`الوقت: ${currentDate.toLocaleTimeString('ar-SA')}`, 190, 45, { align: 'right' });
        doc.text(`إجمالي الباركودات: ${data.barcodes.length}`, 190, 55, { align: 'right' });

        // Add line separator
        doc.moveTo(20, 65).lineTo(190, 65).stroke();

        // Add barcode list
        doc.fontSize(11);
        doc.text('قائمة الباركودات:', 190, 75, { align: 'right' });

        // Use Amiri for Arabic, Courier for barcodes (assuming they are Latin digits)
        doc.fontSize(10);
        let yPosition = 85;

        data.barcodes.forEach((barcode, index) => {
            if (yPosition > 270) {
                doc.addPage();
                yPosition = 20;
            }
            const paddedIndex = String(index + 1).padStart(2, '0');
            // Render index and dot with Amiri for Arabic numbers
            doc.font('Amiri');
            doc.text(`${paddedIndex}.`, 190, yPosition, { align: 'right', continued: true });
            // Switch to Courier for barcode (assuming Latin digits)
            doc.font('Courier');
            doc.text(` ${barcode}`, { align: 'right' });
            yPosition += 10;
        });

        // Add footer
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            doc.font('Amiri').fontSize(8);
            doc.text(`الصفحة ${i + 1} من ${pageCount}`, 190, 285, { align: 'right' });
            doc.text('تم إنشاؤه بواسطة مدير الباركود', 20, 285, { align: 'left' }); // Left-align for readability
        }

        doc.end();
    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).send('Error generating PDF');
    }
});

// Initialize and start server
initDatabase().then(() => {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
});