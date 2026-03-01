const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const pdfParser = require('pdf-parse');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Knowledge = require('../models/Knowledge');
const User = require('../models/User');

const BASE_PATH = path.join(__dirname, '..', '..');
const SUBMODULES = {
    books: path.join(BASE_PATH, 'books'),
    guide: path.join(BASE_PATH, 'guide')
};

async function syncRepo() {
    try {
        console.log('--- STARTING REPOSITORY SYNC ---');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Find an admin user to associate the knowledge with
        const admin = await User.findOne({ role: 'admin' }) || await User.findOne();
        if (!admin) {
            console.error('❌ No user found in database. Please register first.');
            process.exit(1);
        }
        console.log(`Using User ID: ${admin._id} (${admin.username})`);

        for (const [category, dirPath] of Object.entries(SUBMODULES)) {
            if (!fs.existsSync(dirPath)) {
                console.warn(`⚠️  Directory not found: ${dirPath}`);
                continue;
            }

            console.log(`\nScanning ${category.toUpperCase()}...`);
            const files = fs.readdirSync(dirPath);

            for (const file of files) {
                if (file === '.git' || fs.statSync(path.join(dirPath, file)).isDirectory()) continue;

                // Check if already indexed
                const exists = await Knowledge.findOne({ fileName: file });
                if (exists) {
                    console.log(`- Skipping ${file} (Already Indexed)`);
                    continue;
                }

                console.log(`- Ingesting ${file}...`);
                const filePath = path.join(dirPath, file);
                const fileType = path.extname(file).slice(1).toLowerCase();
                let text = '';

                try {
                    if (fileType === 'pdf') {
                        const dataBuffer = fs.readFileSync(filePath);
                        const data = await pdfParser(dataBuffer);
                        text = data.text;
                    } else if (fileType === 'md' || fileType === 'txt') {
                        text = fs.readFileSync(filePath, 'utf-8');
                    } else {
                        console.log(`  ! Unsupported type: ${fileType}`);
                        continue;
                    }

                    const trimmedText = text ? text.trim() : '';

                    if (!trimmedText) {
                        // Save placeholder for scanned
                        const placeholder = new Knowledge({
                            userId: admin._id,
                            content: "[SCANNED DOCUMENT - NO TEXT EXTRACTED]",
                            fileName: file,
                            fileType: fileType
                        });
                        await placeholder.save();
                        console.log(`  + Saved as SCANNED DOCUMENT`);
                    } else {
                        // Chunk and save
                        const chunkSize = 1000;
                        const chunks = [];
                        for (let i = 0; i < text.length; i += chunkSize) {
                            const chunk = text.substring(i, i + chunkSize).trim();
                            if (chunk.length >= 20) chunks.push(chunk);
                        }

                        if (chunks.length > 0) {
                            await Promise.all(chunks.map(content => {
                                return new Knowledge({
                                    userId: admin._id,
                                    content,
                                    fileName: file,
                                    fileType: fileType
                                }).save();
                            }));
                            console.log(`  + Saved ${chunks.length} snippets`);
                        } else {
                            console.log(`  ! No valid snippets found`);
                        }
                    }
                } catch (err) {
                    console.error(`  ❌ Error processing ${file}:`, err.message);
                }
            }
        }

        console.log('\n--- SYNC COMPLETE ---');
        process.exit(0);
    } catch (error) {
        console.error('❌ Sync Failed:', error);
        process.exit(1);
    }
}

syncRepo();
