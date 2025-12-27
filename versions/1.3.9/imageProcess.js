const sharp = require('sharp');
const path = require('path');

async function imageProcess(imageBuffer, fileExtension, config = {
    returnBase64: true,
    quality: 1,
    pixels: 0, // 0 = keep original
    blackAndWhite: false,
    mirror: false,
    upToDown: false,
    invert: false,
    brightness: 1,
    contrast: 1
}) {
    try {
        let image = sharp(imageBuffer);

        // Get image metadata
        const metadata = await image.metadata();

        // Apply mirror/flip if requested (left-right)
        if (config.mirror) {
            image = image.flop(); // Horizontal flip
        }

        // Apply up-to-down flip if requested (vertical flip)
        if (config.upToDown) {
            image = image.flip(); // Vertical flip
        }

        // Apply black and white effect
        if (config.blackAndWhite) {
            image = image.greyscale();
        }

        // Apply inversion if requested
        if (config.invert) {
            image = image.negate({ alpha: false });
        }

        // Apply brightness
        if (config.brightness !== 1) {
            image = image.modulate({
                brightness: config.brightness
            });
        }

        // Apply contrast
        if (config.contrast !== 1) {
            // Approximate contrast adjustment
            image = image.linear(config.contrast, -(128 * (config.contrast - 1)));
        }

        // Resize if pixels limit is specified and current pixels exceed the limit
        if (config.pixels > 0) {
            const currentPixels = metadata.width * metadata.height;

            if (currentPixels > config.pixels) {
                const scaleFactor = Math.sqrt(config.pixels / currentPixels);
                const newWidth = Math.round(metadata.width * scaleFactor);
                const newHeight = Math.round(metadata.height * scaleFactor);

                image = image.resize(newWidth, newHeight, {
                    fit: 'inside',
                    withoutEnlargement: true,
                    kernel: sharp.kernel.lanczos3
                });
            }
        }

        // Apply quality settings based on image format
        const formatOptions = {};

        switch (fileExtension) {
            case '.jpg':
            case '.jpeg':
            case '.jfif':
                formatOptions.format = 'jpeg';
                formatOptions.quality = Math.round(config.quality * 100);
                formatOptions.mozjpeg = true;
                break;

            case '.png':
                formatOptions.format = 'png';
                formatOptions.quality = Math.round(config.quality * 100);
                formatOptions.compressionLevel = Math.round(9 * (1 - config.quality));
                break;

            case '.webp':
                formatOptions.format = 'webp';
                formatOptions.quality = Math.round(config.quality * 100);
                break;

            case '.avif':
                formatOptions.format = 'avif';
                formatOptions.quality = Math.round(config.quality * 100);
                break;

            case '.tiff':
                formatOptions.format = 'tiff';
                formatOptions.quality = Math.round(config.quality * 100);
                break;

            case '.gif':
                formatOptions.format = 'gif';
                break;

            default:
                formatOptions.quality = Math.round(config.quality * 100);
        }

        // Process the image
        let processedBuffer;

        if (fileExtension === '.svg') {
            // SVG is vector, handle differently - apply transformations if needed
            if (config.blackAndWhite || config.mirror || config.upToDown ||
                config.invert || config.brightness !== 1 || config.contrast !== 1) {
                // Convert SVG to raster for transformations
                const rasterImage = sharp(imageBuffer).png();
                processedBuffer = await rasterImage.toFormat('png', formatOptions).toBuffer();
                fileExtension = '.png'; // Change extension for MIME type
            } else {
                // SVG remains vector
                if (config.returnBase64) {
                    return imageBuffer.toString('base64');
                }
                return imageBuffer;
            }
        } else {
            processedBuffer = await image.toFormat(formatOptions.format || metadata.format, formatOptions).toBuffer();
        }

        // Return based on configuration
        if (config.returnBase64) {
            // Determine MIME type
            let mimeType;
            switch (fileExtension) {
                case '.jpg': case '.jpeg': case '.jfif': mimeType = 'image/jpeg'; break;
                case '.png': mimeType = 'image/png'; break;
                case '.gif': mimeType = 'image/gif'; break;
                case '.webp': mimeType = 'image/webp'; break;
                case '.bmp': mimeType = 'image/bmp'; break;
                case '.tiff': mimeType = 'image/tiff'; break;
                case '.svg': mimeType = 'image/svg+xml'; break;
                case '.ico': mimeType = 'image/x-icon'; break;
                case '.heic': mimeType = 'image/heic'; break;
                case '.avif': mimeType = 'image/avif'; break;
                default: mimeType = 'application/octet-stream';
            }

            const base64Data = processedBuffer.toString('base64');
            return `data:${mimeType};base64,${base64Data}`;
        } else {
            return processedBuffer;
        }

    } catch (error) {
        throw new Error(`Image processing failed: ${error.message}`);
    }
}

// Basic version without sharp for fallback
async function imageProcessBasic(imageBuffer, fileExtension, config = {
    returnBase64: true,
    quality: 1,
    pixels: 0,
    blackAndWhite: false,
    mirror: false,
    upToDown: false,
    invert: false,
    brightness: 1,
    contrast: 1
}) {
    try {
        if (config.returnBase64) {
            // Determine MIME type
            let mimeType;
            switch (fileExtension) {
                case '.jpg': case '.jpeg': case '.jfif': mimeType = 'image/jpeg'; break;
                case '.png': mimeType = 'image/png'; break;
                case '.gif': mimeType = 'image/gif'; break;
                case '.webp': mimeType = 'image/webp'; break;
                case '.bmp': mimeType = 'image/bmp'; break;
                case '.tiff': mimeType = 'image/tiff'; break;
                case '.svg': mimeType = 'image/svg+xml'; break;
                case '.ico': mimeType = 'image/x-icon'; break;
                case '.heic': mimeType = 'image/heic'; break;
                case '.avif': mimeType = 'image/avif'; break;
                default: mimeType = 'application/octet-stream';
            }

            const base64Data = imageBuffer.toString('base64');
            return `data:${mimeType};base64,${base64Data}`;
        } else {
            return imageBuffer;
        }
    } catch (error) {
        throw new Error(`Image processing failed: ${error.message}`);
    }
}

module.exports = async function (imageBuffer, fileExtension, config) {
    try {
        if (typeof sharp === 'function') {
            return await imageProcess(imageBuffer, fileExtension, config);
        } else {
            console.warn('Sharp not available, using basic image processing');
            return await imageProcessBasic(imageBuffer, fileExtension, config);
        }
    } catch (error) {
        console.warn('Sharp processing failed, falling back to basic:', error.message);
        return await imageProcessBasic(imageBuffer, fileExtension, config);
    }
};