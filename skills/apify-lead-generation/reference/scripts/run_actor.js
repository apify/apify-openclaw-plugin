#!/usr/bin/env node
/**
 * Apify Actor Runner - Runs Apify actors and exports results.
 *
 * Usage:
 *   # Quick answer (display in chat, no file saved)
 *   node scripts/run_actor.js --actor ACTOR_ID --input '{}'
 *
 *   # Export to file
 *   node scripts/run_actor.js --actor ACTOR_ID --input '{}' --output leads.csv --format csv
 */

import { parseArgs } from 'node:util';
import { writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// User-Agent for tracking skill usage in Apify analytics
const USER_AGENT = 'apify-agent-skills/apify-lead-generation-1.1.11';

// Validate Actor ID format: "owner/actor-name" or raw 17-char alphanumeric ID
function validateActorId(actorId) {
    const TECHNICAL_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
    const RAW_ID = /^[a-zA-Z0-9]{17}$/;
    if (!TECHNICAL_NAME.test(actorId) && !RAW_ID.test(actorId)) {
        console.error(`Error: Invalid Actor ID format: ${actorId}`);
        console.error('Expected "owner/actor-name" (e.g., compass/crawler-google-places) or a 17-character alphanumeric ID.');
        process.exit(1);
    }
}

// Validate JSON input string is parseable and is an object
function validateJsonInput(inputStr) {
    let parsed;
    try {
        parsed = JSON.parse(inputStr);
    } catch (e) {
        console.error(`Error: Invalid JSON input: ${e.message}`);
        process.exit(1);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        console.error('Error: JSON input must be a plain object (e.g., {"key": "value"}).');
        process.exit(1);
    }
    return parsed;
}

// Validate output format is one of the allowed values
function validateFormat(format) {
    const ALLOWED_FORMATS = ['csv', 'json'];
    if (!ALLOWED_FORMATS.includes(format)) {
        console.error(`Error: Invalid format '${format}'. Allowed: ${ALLOWED_FORMATS.join(', ')}`);
        process.exit(1);
    }
}

// Validate output path is within the current working directory
function validateOutputPath(outputPath) {
    const resolved = resolve(outputPath);
    const cwd = process.cwd();
    if (!resolved.startsWith(cwd + '/') && resolved !== cwd) {
        console.error(`Error: Output path must be within the current directory. Got: ${outputPath}`);
        process.exit(1);
    }
}

// Parse command-line arguments
function parseCliArgs() {
    const options = {
        actor: { type: 'string', short: 'a' },
        input: { type: 'string', short: 'i' },
        output: { type: 'string', short: 'o' },
        format: { type: 'string', short: 'f', default: 'csv' },
        timeout: { type: 'string', short: 't', default: '600' },
        'poll-interval': { type: 'string', default: '5' },
        help: { type: 'boolean', short: 'h' },
    };

    const { values } = parseArgs({ options, allowPositionals: false });

    if (values.help) {
        printHelp();
        process.exit(0);
    }

    if (!values.actor) {
        console.error('Error: --actor is required');
        printHelp();
        process.exit(1);
    }

    if (!values.input) {
        console.error('Error: --input is required');
        printHelp();
        process.exit(1);
    }

    validateActorId(values.actor);
    const parsedInput = validateJsonInput(values.input);
    const format = values.format || 'csv';
    validateFormat(format);

    if (values.output) {
        validateOutputPath(values.output);
    }

    return {
        actor: values.actor,
        parsedInput,
        output: values.output,
        format,
        timeout: parseInt(values.timeout, 10),
        pollInterval: parseInt(values['poll-interval'], 10),
    };
}

function printHelp() {
    console.log(`
Apify Actor Runner - Run Apify actors and export results

Usage:
  node scripts/run_actor.js --actor ACTOR_ID --input '{}'

Options:
  --actor, -a       Actor ID (e.g., compass/crawler-google-places) [required]
  --input, -i       Actor input as JSON string [required]
  --output, -o      Output file path (optional - if not provided, displays quick answer)
  --format, -f      Output format: csv, json (default: csv)
  --timeout, -t     Max wait time in seconds (default: 600)
  --poll-interval   Seconds between status checks (default: 5)
  --help, -h        Show this help message

Output Formats:
  JSON (all data)     --output file.json --format json
  CSV (all data)      --output file.csv --format csv
  Quick answer        (no --output) - displays top 5 in chat

Examples:
  # Quick answer - display top 5 in chat
  node scripts/run_actor.js \\
    --actor "compass/crawler-google-places" \\
    --input '{"searchStringsArray": ["coffee shops"], "locationQuery": "Seattle, USA"}'

  # Export all data to CSV
  node scripts/run_actor.js \\
    --actor "compass/crawler-google-places" \\
    --input '{"searchStringsArray": ["coffee shops"], "locationQuery": "Seattle, USA"}' \\
    --output leads.csv --format csv
`);
}

// Start an actor run and return { runId, datasetId }
async function startActor(token, actorId, parsedInput) {
    // Convert "author/actor" format to "author~actor" for API compatibility
    const apiActorId = actorId.replace('/', '~');
    const url = `https://api.apify.com/v2/acts/${apiActorId}/runs`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'User-Agent': `${USER_AGENT}/start_actor`,
        },
        body: JSON.stringify(parsedInput),
    });

    if (response.status === 404) {
        console.error(`Error: Actor '${actorId}' not found`);
        process.exit(1);
    }

    if (!response.ok) {
        const text = await response.text();
        console.error(`Error: API request failed (${response.status}): ${text}`);
        process.exit(1);
    }

    const result = await response.json();
    return {
        runId: result.data.id,
        datasetId: result.data.defaultDatasetId,
    };
}

// Poll run status until complete or timeout
async function pollUntilComplete(token, runId, timeout, interval) {
    const url = `https://api.apify.com/v2/actor-runs/${runId}`;
    const startTime = Date.now();
    let lastStatus = null;

    while (true) {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            const text = await response.text();
            console.error(`Error: Failed to get run status: ${text}`);
            process.exit(1);
        }

        const result = await response.json();
        const status = result.data.status;

        // Only print when status changes
        if (status !== lastStatus) {
            console.log(`Status: ${status}`);
            lastStatus = status;
        }

        if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
            return status;
        }

        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed > timeout) {
            console.error(`Warning: Timeout after ${timeout}s, actor still running`);
            return 'TIMED-OUT';
        }

        await sleep(interval * 1000);
    }
}

// Download dataset items
async function downloadResults(token, datasetId, outputPath, format) {
    const url = `https://api.apify.com/v2/datasets/${datasetId}/items?format=json`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': `${USER_AGENT}/download_${format}`,
        },
    });

    if (!response.ok) {
        const text = await response.text();
        console.error(`Error: Failed to download results: ${text}`);
        process.exit(1);
    }

    const data = await response.json();

    try {
        if (format === 'json') {
            writeFileSync(outputPath, JSON.stringify(data, null, 2));
        } else {
            // CSV output
            if (data.length > 0) {
                const fieldnames = Object.keys(data[0]);
                const csvLines = [fieldnames.join(',')];

                for (const row of data) {
                    const values = fieldnames.map((key) => {
                        let value = row[key];

                        // Truncate long text fields
                        if (typeof value === 'string' && value.length > 200) {
                            value = value.slice(0, 200) + '...';
                        } else if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
                            value = JSON.stringify(value) || '';
                        }

                        // CSV escape: wrap in quotes if contains comma, quote, or newline
                        if (value === null || value === undefined) {
                            return '';
                        }
                        const strValue = String(value);
                        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
                            return `"${strValue.replace(/"/g, '""')}"`;
                        }
                        return strValue;
                    });
                    csvLines.push(values.join(','));
                }

                writeFileSync(outputPath, csvLines.join('\n'));
            } else {
                writeFileSync(outputPath, '');
            }
        }
    } catch (err) {
        console.error(`Error: Failed to write output file '${outputPath}': ${err.message}`);
        process.exit(1);
    }

    console.log(`Saved to: ${outputPath}`);
}

// Display top 5 results in chat format
async function displayQuickAnswer(token, datasetId) {
    const url = `https://api.apify.com/v2/datasets/${datasetId}/items?format=json`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': `${USER_AGENT}/quick_answer`,
        },
    });

    if (!response.ok) {
        const text = await response.text();
        console.error(`Error: Failed to download results: ${text}`);
        process.exit(1);
    }

    const data = await response.json();
    const total = data.length;

    if (total === 0) {
        console.log('\nNo results found.');
        return;
    }

    // Display top 5
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TOP 5 RESULTS (of ${total} total)`);
    console.log('='.repeat(60));

    for (let i = 0; i < Math.min(5, data.length); i++) {
        const item = data[i];
        console.log(`\n--- Result ${i + 1} ---`);

        for (const [key, value] of Object.entries(item)) {
            let displayValue = value;

            // Truncate long values
            if (typeof value === 'string' && value.length > 100) {
                displayValue = value.slice(0, 100) + '...';
            } else if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
                const jsonStr = JSON.stringify(value);
                displayValue = jsonStr.length > 100 ? jsonStr.slice(0, 100) + '...' : jsonStr;
            }

            console.log(`  ${key}: ${displayValue}`);
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    if (total > 5) {
        console.log(`Showing 5 of ${total} results.`);
    }
    console.log(`Full data available at: https://console.apify.com/storage/datasets/${datasetId}`);
    console.log('='.repeat(60));
}

// Report summary of downloaded data
function reportSummary(outputPath, format) {
    const stats = statSync(outputPath);
    const size = stats.size;

    let count;
    try {
        const content = require('fs').readFileSync(outputPath, 'utf-8');
        if (format === 'json') {
            const data = JSON.parse(content);
            count = Array.isArray(data) ? data.length : 1;
        } else {
            // CSV - count lines minus header
            const lines = content.split('\n').filter((line) => line.trim());
            count = Math.max(0, lines.length - 1);
        }
    } catch {
        count = 'unknown';
    }

    console.log(`Records: ${count}`);
    console.log(`Size: ${size.toLocaleString()} bytes`);
}

// Helper: sleep for ms
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Main function
async function main() {
    // Parse args first so --help works without token
    const args = parseCliArgs();

    // Check for APIFY_TOKEN
    const token = process.env.APIFY_TOKEN;
    if (!token) {
        console.error('Error: APIFY_TOKEN environment variable not found');
        console.error('');
        console.error('Configure APIFY_TOKEN in your OpenClaw settings.');
        console.error('Get your token: https://console.apify.com/account/integrations');
        process.exit(1);
    }

    // Start the actor run
    console.log(`Starting actor: ${args.actor}`);
    const { runId, datasetId } = await startActor(token, args.actor, args.parsedInput);
    console.log(`Run ID: ${runId}`);
    console.log(`Dataset ID: ${datasetId}`);

    // Poll for completion
    const status = await pollUntilComplete(token, runId, args.timeout, args.pollInterval);

    if (status !== 'SUCCEEDED') {
        console.error(`Error: Actor run ${status}`);
        console.error(`Details: https://console.apify.com/actors/runs/${runId}`);
        process.exit(1);
    }

    // Determine output mode
    if (args.output) {
        // File output mode
        await downloadResults(token, datasetId, args.output, args.format);
        reportSummary(args.output, args.format);
    } else {
        // Quick answer mode - display in chat
        await displayQuickAnswer(token, datasetId);
    }
}

main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
});
