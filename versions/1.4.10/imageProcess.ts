import sharp from 'sharp';

interface ImageProcessConfig {
    returnBase64?: boolean;
    quality?: number;
    pixels?: number;
    blackAndWhite?: boolean;
    mirror?: boolean;
    upToDown?: boolean;
    invert?: boolean;
    brightness?: number;
    contrast?: number;
}

const defaultConfig: Required<ImageProcessConfig> = {
    returnBase64: true,
    quality: 1,
    pixels: 0,
    blackAndWhite: false,
    mirror: false,
    upToDown: false,
    invert: false,
    brightness: 1,
    contrast: 1,
};

function getMimeType(fileExtension: string): string {
    switch (fileExtension) {
        case '.jpg':
        case '.jpeg':
        case '.jfif':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.gif':
            return 'image/gif';
        case '.webp':
            return 'image/webp';
        case '.bmp':
            return 'image/bmp';
        case '.tiff':
            return 'image/tiff';
        case '.svg':
            return 'image/svg+xml';
        case '.ico':
            return 'image/x-icon';
        case '.heic':
            return 'image/heic';
        case '.avif':
            return 'image/avif';
        default:
            return 'application/octet-stream';
    }
}

async function imageProcess(
    imageBuffer: Buffer,
    fileExtension: string,
    config: Required<ImageProcessConfig>
): Promise<string | Buffer> {
    let image = sharp(imageBuffer);
    const metadata = await image.metadata();

    if (config.mirror) {
        image = image.flop();
    }

    if (config.upToDown) {
        image = image.flip();
    }

    if (config.blackAndWhite) {
        image = image.greyscale();
    }

    if (config.invert) {
        image = image.negate({ alpha: false });
    }

    if (config.brightness !== 1) {
        image = image.modulate({ brightness: config.brightness });
    }

    if (config.contrast !== 1) {
        image = image.linear(config.contrast, -(128 * (config.contrast - 1)));
    }

    if (config.pixels > 0) {
        const currentPixels = (metadata.width ?? 0) * (metadata.height ?? 0);

        if (currentPixels > config.pixels) {
            const scaleFactor = Math.sqrt(config.pixels / currentPixels);
            const newWidth = Math.round((metadata.width ?? 0) * scaleFactor);
            const newHeight = Math.round((metadata.height ?? 0) * scaleFactor);

            image = image.resize(newWidth, newHeight, {
                fit: 'inside',
                withoutEnlargement: true,
                kernel: sharp.kernel.lanczos3,
            });
        }
    }

    type SharpFormat = Parameters<sharp.Sharp['toFormat']>[0];
    type FormatOptions = {
        format?: SharpFormat;
        quality?: number;
        compressionLevel?: number;
        mozjpeg?: boolean;
    };

    const formatOptions: FormatOptions = {};
    let resolvedExtension = fileExtension;

    if (fileExtension === '.svg') {
        const hasTransformations =
            config.blackAndWhite ||
            config.mirror ||
            config.upToDown ||
            config.invert ||
            config.brightness !== 1 ||
            config.contrast !== 1;

        if (hasTransformations) {
            const processedBuffer = await sharp(imageBuffer).png().toBuffer();
            resolvedExtension = '.png';

            if (config.returnBase64) {
                const base64Data = processedBuffer.toString('base64');
                return `data:${getMimeType(resolvedExtension)};base64,${base64Data}`;
            }
            return processedBuffer;
        } else {
            if (config.returnBase64) {
                return imageBuffer.toString('base64');
            }
            return imageBuffer;
        }
    }

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

    const targetFormat = formatOptions.format ?? (metadata.format as SharpFormat);
    const processedBuffer = await image.toFormat(targetFormat, formatOptions).toBuffer();

    if (config.returnBase64) {
        const base64Data = processedBuffer.toString('base64');
        return `data:${getMimeType(resolvedExtension)};base64,${base64Data}`;
    }

    return processedBuffer;
}

async function imageProcessBasic(
    imageBuffer: Buffer,
    fileExtension: string,
    config: Required<ImageProcessConfig>
): Promise<string | Buffer> {
    if (config.returnBase64) {
        const base64Data = imageBuffer.toString('base64');
        return `data:${getMimeType(fileExtension)};base64,${base64Data}`;
    }
    return imageBuffer;
}

export default async function processImage(
    imageBuffer: Buffer,
    fileExtension: string,
    config: ImageProcessConfig = {}
): Promise<string | Buffer> {
    const resolvedConfig: Required<ImageProcessConfig> = { ...defaultConfig, ...config };

    try {
        return await imageProcess(imageBuffer, fileExtension, resolvedConfig);
    } catch (error) {
        console.warn(
            'Sharp processing failed, falling back to basic:',
            error instanceof Error ? error.message : error
        );
        return await imageProcessBasic(imageBuffer, fileExtension, resolvedConfig);
    }
}