const fs = require('fs');
const path = require('path');

// Check if javascript-obfuscator is installed
let JavaScriptObfuscator;
try {
    JavaScriptObfuscator = require('javascript-obfuscator');
} catch (error) {
    console.error('Error: javascript-obfuscator not found.');
    console.error('Please install it with: npm install --save-dev javascript-obfuscator');
    process.exit(1);
}

console.log('Starting build process...\n');

// Create build directory
if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
    console.log('Created dist/ directory');
}

// Read source files
const mainSource = fs.readFileSync('evelodb.js', 'utf8');

// Check for dependency files
const requiredFiles = ['encryption.js', 'imageProcess.js'];
const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));

if (missingFiles.length > 0) {
    console.warn('Warning: Missing dependency files:', missingFiles.join(', '));
    console.warn('Make sure these files exist or adjust the require statements.');
}

// Create UMD wrapper for universal compatibility
const createUMDWrapper = (sourceCode) => {
    return `/*!
 * EveloDB - Lightweight File-Based Database
 * Version: 1.3.9
 * Built: ${new Date().toISOString()}
 */
(function (root, factory) {
    'use strict';
    
    if (typeof exports === 'object' && typeof module !== 'undefined') {
        // CommonJS (Node.js)
        module.exports = factory(
            require('fs'),
            require('bson'), 
            require('@google/genai'),
            require('./encryption'),
            require('./imageProcess'),
            require('path')
        );
    } else if (typeof define === 'function' && define.amd) {
        // AMD (RequireJS)
        define([
            'fs', 'bson', '@google/genai', 
            './encryption', './imageProcess', 'path'
        ], factory);
    } else {
        // Browser globals
        root.EveloDB = factory(
            root.fs || {},
            root.BSON || {},
            root.GoogleGenAI || {},
            root.encryption || {},
            root.imageProcess || {},
            root.path || {}
        );
    }
}(typeof self !== 'undefined' ? self : this, function (fs, bson, genai, encryption, imageProcess, path) {
    'use strict';

${sourceCode.replace('module.exports = eveloDB;', 'return eveloDB;')}

}));`;
};

// Wrap the source code
const wrappedCode = createUMDWrapper(mainSource);

// Save unobfuscated version for debugging
fs.writeFileSync('dist/evelodb.debug.js', wrappedCode);
console.log('Created dist/evelodb.debug.js (unobfuscated for debugging)');

// Obfuscation configuration
const obfuscationOptions = {
    // Basic settings
    compact: true,
    simplify: true,
    
    // Control flow obfuscation
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    
    // Dead code injection
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    
    // Debug protection
    debugProtection: false, // Disable to avoid issues in development
    debugProtectionInterval: 0,
    
    // Console output
    disableConsoleOutput: false, // Keep console for debugging
    
    // Identifier names
    identifierNamesGenerator: 'hexadecimal',
    identifierNamesCache: {},
    identifiersDictionary: [],
    identifiersPrefix: '',
    
    // Rename properties
    renameProperties: false, // Disable to maintain API compatibility
    renamePropertiesMode: 'safe',
    reservedNames: [
        // Preserve important method names for API
        'create', 'delete', 'find', 'findOne', 'get', 'edit', 'drop',
        'search', 'count', 'inject', 'writeData', 'readData',
        'writeFile', 'readFile', 'readImage', 'deleteFile', 'allFiles',
        'analyse', 'check', 'reset', 'changeConfig', 'rebuildBTree',
        'generateKey', 'encrypt', 'decrypt'
    ],
    
    // Numbers transformation
    numbersToExpressions: true,
    
    // String array obfuscation
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.5,
    stringArrayEncoding: ['base64'],
    stringArrayIndexesType: ['hexadecimal-number'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 1,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 2,
    stringArrayWrappersType: 'variable',
    stringArrayThreshold: 0.75,
    
    // String splitting
    splitStrings: true,
    splitStringsChunkLength: 5,
    
    // Self defending
    selfDefending: true,
    
    // Options for better performance
    ignoreImports: true,
    log: false,
    renameGlobals: false,
    
    // Advanced options
    seed: Math.floor(Math.random() * 10000),
    sourceMap: false,
    sourceMapBaseUrl: '',
    sourceMapFileName: '',
    sourceMapMode: 'separate',
    
    // Transform object keys
    transformObjectKeys: false, // Keep false to maintain API
    
    // Unicode escape
    unicodeEscapeSequence: false
};

console.log('Obfuscating code...');
console.log('Options:', {
    controlFlowFlattening: obfuscationOptions.controlFlowFlattening,
    deadCodeInjection: obfuscationOptions.deadCodeInjection,
    stringArrayEncoding: obfuscationOptions.stringArrayEncoding,
    selfDefending: obfuscationOptions.selfDefending
});

try {
    const obfuscationResult = JavaScriptObfuscator.obfuscate(wrappedCode, obfuscationOptions);
    const obfuscatedCode = obfuscationResult.getObfuscatedCode();
    
    // Write obfuscated version
    fs.writeFileSync('dist/evelodb.min.js', obfuscatedCode);
    console.log('Created dist/evelodb.min.js (obfuscated)');
    
    // Get file sizes
    const originalSize = Buffer.byteLength(wrappedCode, 'utf8');
    const obfuscatedSize = Buffer.byteLength(obfuscatedCode, 'utf8');
    const compressionRatio = ((originalSize - obfuscatedSize) / originalSize * 100).toFixed(1);
    
    console.log(`\nFile sizes:`);
    console.log(`  Original: ${(originalSize / 1024).toFixed(1)} KB`);
    console.log(`  Obfuscated: ${(obfuscatedSize / 1024).toFixed(1)} KB`);
    console.log(`  Size change: ${compressionRatio > 0 ? '-' : '+'}${Math.abs(compressionRatio)}%`);
    
} catch (error) {
    console.error('Obfuscation failed:', error.message);
    console.error('Falling back to minified but unobfuscated version...');
    
    // Simple minification fallback
    const minified = wrappedCode
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
        .replace(/\/\/.*$/gm, '') // Remove line comments
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/;\s*}/g, ';}') // Remove spaces before closing braces
        .replace(/{\s*/g, '{') // Remove spaces after opening braces
        .trim();
    
    fs.writeFileSync('dist/evelodb.min.js', minified);
    console.log('Created dist/evelodb.min.js (minified only)');
}

// Copy TypeScript declaration file
if (fs.existsSync('evelodb.d.ts')) {
    fs.copyFileSync('evelodb.d.ts', 'dist/evelodb.d.ts');
    console.log('Copied evelodb.d.ts to dist/');
} else {
    console.warn('Warning: evelodb.d.ts not found. TypeScript support will be limited.');
}

// Create package.json for dist folder
const packageTemplate = {
    "name": "evelodb",
    "version": "1.3.9",
    "description": "A lightweight, file-based database with encryption support",
    "main": "evelodb.min.js",
    "types": "evelodb.d.ts",
    "files": ["*.js", "*.d.ts"],
    "keywords": ["database", "file-based", "encryption", "bson", "json", "nosql"],
    "author": "Your Name",
    "license": "MIT",
    "engines": {
        "node": ">=12.0.0"
    },
    "peerDependencies": {
        "@google/genai": "^1.8.0",
        "bson": "^6.10.4",
        "sharp": "^0.34.3"
    }
};

fs.writeFileSync('dist/package.json', JSON.stringify(packageTemplate, null, 2));
console.log('Created dist/package.json');

// Create README for dist
const readmeContent = fs.readFileSync('README.md', 'utf8');

fs.writeFileSync('dist/README.md', readmeContent);
console.log('Created dist/README.md');

console.log('\n✓ Build completed successfully!');
console.log('\nGenerated files:');
console.log('  - dist/evelodb.min.js (obfuscated production build)');
console.log('  - dist/evelodb.debug.js (unobfuscated for debugging)');
console.log('  - dist/evelodb.d.ts (TypeScript definitions)');
console.log('  - dist/package.json (NPM package config)');
console.log('  - dist/README.md (documentation)');

console.log('\nNext steps:');
console.log('1. Test the obfuscated build: node -e "const db = require(\'./dist/evelodb.min.js\'); console.log(\'OK\')"');
console.log('2. Publish to NPM: cd dist && npm publish');
console.log('3. Or use locally: npm install ./dist');

// Basic validation test
try {
    console.log('\nRunning basic validation...');
    const TestDB = require('./dist/evelodb.min.js');
    console.log('✓ Module loads successfully');
    
    // Test constructor
    const testDb = new TestDB({ directory: './test-tmp' });
    console.log('✓ Constructor works');
    
    // Cleanup test directory if it was created
    if (fs.existsSync('./test-tmp')) {
        fs.rmSync('./test-tmp', { recursive: true, force: true });
    }
    
    console.log('✓ All validation tests passed!');
} catch (error) {
    console.error('✗ Validation failed:', error.message);
    console.error('Please check the obfuscated build manually.');
}