const fs = require('fs').promises;
const path = require('path');

async function setupSeriesDirectories() {
    try {
        const dataDir = path.join(__dirname, 'data');
        const seriesDir = path.join(__dirname, 'series');
        const templateFile = path.join(__dirname, 'series-template.html');
        
        // Read all JSON files in data directory (except talks.json)
        const files = await fs.readdir(dataDir);
        const jsonFiles = files.filter(file => file.endsWith('.json') && file !== 'talks.json');
        
        // Create series directory if it doesn't exist
        try {
            await fs.mkdir(seriesDir, { recursive: true });
        } catch (error) {
            // Directory might already exist, that's fine
        }
        
        console.log('📁 Setting up series directories...\n');
        
        for (const file of jsonFiles) {
            const seriesSlug = file.replace('.json', '');
            const seriesPath = path.join(seriesDir, seriesSlug);
            
            // Create series subdirectory
            await fs.mkdir(seriesPath, { recursive: true });
            
            // Copy template as index.html
            const templateContent = await fs.readFile(templateFile, 'utf8');
            const indexPath = path.join(seriesPath, 'index.html');
            await fs.writeFile(indexPath, templateContent);
            
            console.log(`✓ Created /series/${seriesSlug}/index.html`);
        }
        
        console.log(`\n✅ Setup complete! Created ${jsonFiles.length} series directories.`);
        console.log('\n📋 Your URLs:');
        jsonFiles.forEach(file => {
            const seriesSlug = file.replace('.json', '');
            console.log(`   /series/${seriesSlug}/`);
        });
        console.log('\n💡 Tip: Run this script whenever you add a new series JSON file.');
        
    } catch (error) {
        console.error('❌ Error setting up directories:', error);
    }
}

setupSeriesDirectories();