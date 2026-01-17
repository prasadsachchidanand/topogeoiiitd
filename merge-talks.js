const fs = require('fs').promises;
const path = require('path');

async function mergeTalks() {
    try {
        const dataDir = path.join(__dirname, 'data');
        const files = await fs.readdir(dataDir);
        const jsonFiles = files.filter(file => file.endsWith('.json') && file !== 'talks.json');

        let allTalks = [];
        for (const file of jsonFiles) {
            const filePath = path.join(dataDir, file);
            const data = await fs.readFile(filePath, 'utf8');
            const talks = JSON.parse(data);
            allTalks = allTalks.concat(talks);
        }

        // Sort talks by date (optional)
        allTalks.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Write to talks.json
        const outputPath = path.join(dataDir, 'talks.json');
        await fs.writeFile(outputPath, JSON.stringify(allTalks, null, 2));
        console.log('Successfully merged talks into data/talks.json');
    } catch (error) {
        console.error('Error merging talks:', error);
    }
}

mergeTalks();