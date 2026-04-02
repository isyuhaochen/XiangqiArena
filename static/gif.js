/**
 * Minimal animated GIF encoder for replay export.
 * Uses a fixed 3-3-2 palette to avoid external dependencies.
 */

(() => {
    class ByteStream {
        constructor(chunkSize = 65536) {
            this.chunkSize = chunkSize;
            this.parts = [];
            this.chunk = new Uint8Array(chunkSize);
            this.offset = 0;
        }

        _flushChunk() {
            if (this.offset === 0) return;
            this.parts.push(this.chunk.slice(0, this.offset));
            this.chunk = new Uint8Array(this.chunkSize);
            this.offset = 0;
        }

        writeByte(value) {
            if (this.offset >= this.chunk.length) {
                this._flushChunk();
            }
            this.chunk[this.offset++] = value & 0xFF;
        }

        writeShort(value) {
            this.writeByte(value & 0xFF);
            this.writeByte((value >> 8) & 0xFF);
        }

        writeAscii(text) {
            for (let i = 0; i < text.length; i++) {
                this.writeByte(text.charCodeAt(i));
            }
        }

        writeArray(values) {
            let index = 0;
            while (index < values.length) {
                if (this.offset >= this.chunk.length) {
                    this._flushChunk();
                }

                const remainingChunk = this.chunk.length - this.offset;
                const remainingValues = values.length - index;
                const copyLength = Math.min(remainingChunk, remainingValues);

                if (typeof values.subarray === 'function') {
                    this.chunk.set(values.subarray(index, index + copyLength), this.offset);
                    this.offset += copyLength;
                    index += copyLength;
                    continue;
                }

                for (let i = 0; i < copyLength; i++) {
                    this.chunk[this.offset + i] = values[index + i] & 0xFF;
                }
                this.offset += copyLength;
                index += copyLength;
            }
        }

        toBlob(type = 'application/octet-stream') {
            this._flushChunk();
            return new Blob(this.parts, { type });
        }
    }

    function build332Palette() {
        const palette = new Uint8Array(256 * 3);
        for (let i = 0; i < 256; i++) {
            const red = (i >> 5) & 0x07;
            const green = (i >> 2) & 0x07;
            const blue = i & 0x03;
            const base = i * 3;
            palette[base] = Math.round((red * 255) / 7);
            palette[base + 1] = Math.round((green * 255) / 7);
            palette[base + 2] = Math.round((blue * 255) / 3);
        }
        return palette;
    }

    class BattleChessGifEncoder {
        constructor(width, height, options = {}) {
            this.width = width;
            this.height = height;
            this.loopCount = options.loopCount == null ? 0 : options.loopCount;
            this.palette = options.palette || build332Palette();
            this.stream = new ByteStream();
            this.started = false;
        }

        addFrame(imageData, delayMs = 100) {
            if (!imageData || !imageData.data) {
                throw new Error('Expected ImageData for GIF frame export.');
            }
            if (!this.started) {
                this._writeHeader();
            }
            const delayCs = Math.max(1, Math.round(delayMs / 10));
            const indexed = this._rgbaToIndexed(imageData.data);
            this._writeGraphicControlExtension(delayCs);
            this._writeImageDescriptor();
            this._writeImageData(indexed);
        }

        finish() {
            if (!this.started) {
                this._writeHeader();
            }
            this.stream.writeByte(0x3B);
            return this.stream.toBlob('image/gif');
        }

        _writeHeader() {
            this.started = true;
            this.stream.writeAscii('GIF89a');
            this.stream.writeShort(this.width);
            this.stream.writeShort(this.height);
            this.stream.writeByte(0xF7);
            this.stream.writeByte(0x00);
            this.stream.writeByte(0x00);
            this.stream.writeArray(this.palette);

            this.stream.writeByte(0x21);
            this.stream.writeByte(0xFF);
            this.stream.writeByte(0x0B);
            this.stream.writeAscii('NETSCAPE2.0');
            this.stream.writeByte(0x03);
            this.stream.writeByte(0x01);
            this.stream.writeShort(this.loopCount);
            this.stream.writeByte(0x00);
        }

        _writeGraphicControlExtension(delayCs) {
            this.stream.writeByte(0x21);
            this.stream.writeByte(0xF9);
            this.stream.writeByte(0x04);
            this.stream.writeByte(0x00);
            this.stream.writeShort(delayCs);
            this.stream.writeByte(0x00);
            this.stream.writeByte(0x00);
        }

        _writeImageDescriptor() {
            this.stream.writeByte(0x2C);
            this.stream.writeShort(0);
            this.stream.writeShort(0);
            this.stream.writeShort(this.width);
            this.stream.writeShort(this.height);
            this.stream.writeByte(0x00);
        }

        _writeImageData(indexedPixels) {
            const minCodeSize = 8;
            const compressed = this._lzwEncode(indexedPixels, minCodeSize);
            this.stream.writeByte(minCodeSize);
            for (let offset = 0; offset < compressed.length; offset += 255) {
                const blockLength = Math.min(255, compressed.length - offset);
                this.stream.writeByte(blockLength);
                this.stream.writeArray(compressed.subarray(offset, offset + blockLength));
            }
            this.stream.writeByte(0x00);
        }

        _rgbaToIndexed(rgba) {
            const indexed = new Uint8Array(this.width * this.height);
            for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
                const alpha = rgba[i + 3] / 255;
                const red = Math.round(255 + (rgba[i] - 255) * alpha);
                const green = Math.round(255 + (rgba[i + 1] - 255) * alpha);
                const blue = Math.round(255 + (rgba[i + 2] - 255) * alpha);
                indexed[j] = (red & 0xE0) | ((green & 0xE0) >> 3) | (blue >> 6);
            }
            return indexed;
        }

        _lzwEncode(indexedPixels, minCodeSize) {
            const clearCode = 1 << minCodeSize;
            const endCode = clearCode + 1;
            let nextCode = endCode + 1;
            let codeSize = minCodeSize + 1;
            const output = [];
            let bitBuffer = 0;
            let bitLength = 0;
            let hasPreviousCode = false;

            const writeCode = (code) => {
                bitBuffer |= code << bitLength;
                bitLength += codeSize;
                while (bitLength >= 8) {
                    output.push(bitBuffer & 0xFF);
                    bitBuffer >>= 8;
                    bitLength -= 8;
                }
            };

            const resetDictionary = () => {
                nextCode = endCode + 1;
                codeSize = minCodeSize + 1;
                hasPreviousCode = false;
            };

            resetDictionary();
            writeCode(clearCode);

            for (let i = 0; i < indexedPixels.length; i++) {
                writeCode(indexedPixels[i]);

                if (!hasPreviousCode) {
                    hasPreviousCode = true;
                    continue;
                }

                if (nextCode < 4096) {
                    nextCode++;
                    if (nextCode === (1 << codeSize) && codeSize < 12) {
                        codeSize++;
                    }
                    continue;
                }

                writeCode(clearCode);
                resetDictionary();
            }

            writeCode(endCode);

            if (bitLength > 0) {
                output.push(bitBuffer & 0xFF);
            }

            return Uint8Array.from(output);
        }
    }

    window.BattleChessGifEncoder = BattleChessGifEncoder;
})();
