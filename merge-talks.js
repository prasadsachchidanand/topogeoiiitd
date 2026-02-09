const fs = require('fs').promises;
const path = require('path');

// IMPORTANT: Map JSON filenames to their actual series directory names
const seriesDirectoryMap = {
    'kim.json': 'knot-theory',
    'sergio.json': 'coarse-cohomology',
    'lukas.json': 'spin-geometry-and-scalar-curvature-rigidity',
    'oscar.json': 'invariant-theory-of-hamiltonian-mechanics-and-related-numerical-analysis',
    'rajas.json': 'existence-of-higher-extremal-kahler-metrics-on-minimal-ruled-surface',
    'sandip.json': 'on-the-groups-of-self-homotopy-equivalences'
    // Add more mappings when you add new series
};

async function mergeTalks() {
    try {
        const dataDir = path.join(__dirname, 'data');
        const files = await fs.readdir(dataDir);
        const jsonFiles = files.filter(file => file.endsWith('.json') && file !== 'talks.json');

        let allTalks = [];
        
        for (const file of jsonFiles) {
            const filePath = path.join(dataDir, file);
            const data = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(data);
            
            // Get the series directory slug from the map
            const seriesSlug = seriesDirectoryMap[file];
            
            if (!seriesSlug) {
                console.warn(`⚠️  No series directory mapping found for ${file}. Please add it to seriesDirectoryMap.`);
                continue;
            }
            
            // Check if using new optimized structure (object with series/talks) or old structure (array)
            const isOptimized = parsed.series && parsed.talks;
            
            if (isOptimized) {
                // New optimized structure - flatten it
                const seriesInfo = parsed.series;
                
                const talks = parsed.talks.map(talk => ({
                    ...talk,
                    // Inherit series-level data if not present in talk
                    series: seriesInfo.name,
                    speaker: talk.speaker || seriesInfo.speaker,
                    affiliation: talk.affiliation || seriesInfo.affiliation,
                    personalPage: talk.personalPage || seriesInfo.personalPage,
                    mail: talk.mail || seriesInfo.mail,
                    description: talk.description || seriesInfo.description,
                    about: talk.about || seriesInfo.about,
                    zoomLink: talk.zoomLink || seriesInfo.zoomLink || '',
                    meetingId: talk.meetingId || seriesInfo.meetingId || '',
                    passcode: talk.passcode || seriesInfo.passcode || '',
                    // Generate clean seriesLink using the directory map
                    seriesLink: talk.seriesLink || `/series/${seriesSlug}/`
                }));
                
                allTalks = allTalks.concat(talks);
            } else if (Array.isArray(parsed)) {
                // Old structure (array of talks) - ensure seriesLink exists
                const talksWithLinks = parsed.map(talk => ({
                    ...talk,
                    // Generate clean seriesLink using the directory map
                    seriesLink: talk.seriesLink || `/series/${seriesSlug}/`
                }));
                allTalks = allTalks.concat(talksWithLinks);
            } else {
                console.warn(`⚠️  Skipping ${file}: Unknown structure`);
            }
        }

        // Sort talks by date
        allTalks.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Write to talks.json
        const outputPath = path.join(dataDir, 'talks.json');
        await fs.writeFile(outputPath, JSON.stringify(allTalks, null, 2));
        
        console.log(`\n✅ Successfully merged ${allTalks.length} talks from ${jsonFiles.length} files into data/talks.json`);
        console.log(`   Files processed: ${jsonFiles.join(', ')}\n`);
    } catch (error) {
        console.error('❌ Error merging talks:', error);
    }
}

mergeTalks();