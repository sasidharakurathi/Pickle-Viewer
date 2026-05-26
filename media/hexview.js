(function() {
    // Hex View Controller Namespace
    const HexView = {
        bytes: null,
        currentPage: 0,
        pageSize: 1024,
        totalBytes: 0,
        totalPages: 0,

        // DOM elements
        viewport: null,
        btnPrev: null,
        btnNext: null,
        pageInfo: null,
        pageSizeSelector: null,

        init(base64Data) {
            // Decode base64 bytes to Uint8Array
            try {
                const binaryString = atob(base64Data);
                const len = binaryString.length;
                this.bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    this.bytes[i] = binaryString.charCodeAt(i);
                }
                this.totalBytes = len;
            } catch (e) {
                console.error("Hex decoding failed:", e);
                this.viewport.innerText = "Error decoding binary stream: " + e.message;
                return;
            }

            // Cache DOM elements
            this.viewport = document.getElementById('hex-viewport');
            this.btnPrev = document.getElementById('btn-hex-prev');
            this.btnNext = document.getElementById('btn-hex-next');
            this.pageInfo = document.getElementById('hex-page-info');
            this.pageSizeSelector = document.getElementById('hex-page-size');

            // Set up pagination listener
            this.pageSize = parseInt(this.pageSizeSelector.value) || 1024;
            this.currentPage = 0;
            this.calculateTotalPages();

            // Bind listeners once
            if (!this.listenersBound) {
                this.btnPrev.addEventListener('click', () => this.prevPage());
                this.btnNext.addEventListener('click', () => this.nextPage());
                this.pageSizeSelector.addEventListener('change', (e) => {
                    this.pageSize = parseInt(e.target.value) || 1024;
                    this.currentPage = 0;
                    this.calculateTotalPages();
                    this.render();
                });
                this.listenersBound = true;
            }

            // Render first page
            this.render();
        },

        calculateTotalPages() {
            this.totalPages = Math.ceil(this.totalBytes / this.pageSize);
            if (this.totalPages === 0) this.totalPages = 1;
        },

        prevPage() {
            if (this.currentPage > 0) {
                this.currentPage--;
                this.render();
            }
        },

        nextPage() {
            if (this.currentPage < this.totalPages - 1) {
                this.currentPage++;
                this.render();
            }
        },

        render() {
            if (!this.bytes || this.totalBytes === 0) {
                this.viewport.innerText = "No binary data loaded.";
                return;
            }

            // Paginated byte slicing
            const startOffset = this.currentPage * this.pageSize;
            const endOffset = Math.min(startOffset + this.pageSize, this.totalBytes);
            const pageSlice = this.bytes.slice(startOffset, endOffset);

            // Construct traditional hex view editor grid layout
            let hexOutput = '';
            const bytesPerLine = 16;
            
            for (let lineOffset = 0; lineOffset < pageSlice.length; lineOffset += bytesPerLine) {
                const globalAddress = startOffset + lineOffset;
                // Column 1: 8-digit hexadecimal offset address address
                const addressCol = globalAddress.toString(16).padStart(8, '0').toUpperCase();
                
                // Fetch slice for this single line
                const lineSlice = pageSlice.slice(lineOffset, lineOffset + bytesPerLine);
                
                // Column 2: 16 columns of bytes
                let byteCol = '';
                // Column 3: ASCII printable translation
                let asciiCol = '';

                for (let i = 0; i < bytesPerLine; i++) {
                    if (i < lineSlice.length) {
                        const byteVal = lineSlice[i];
                        byteCol += byteVal.toString(16).padStart(2, '0').toUpperCase() + ' ';
                        
                        // Printable ASCII characters are range 32-126
                        if (byteVal >= 32 && byteVal <= 126) {
                            asciiCol += String.fromCharCode(byteVal);
                        } else {
                            asciiCol += '.';
                        }
                    } else {
                        // Empty padding spaces for short lines
                        byteCol += '   ';
                        asciiCol += ' ';
                    }

                    // Add nice visual divider spacer after the 8th byte
                    if (i === 7) {
                        byteCol += ' ';
                    }
                }

                hexOutput += `${addressCol}  ${byteCol} |${asciiCol}|\n`;
            }

            // Write to workspace pre container
            this.viewport.innerText = hexOutput;

            // Update UI Pagination details
            this.pageInfo.innerText = `Page ${this.currentPage + 1} / ${this.totalPages} (Offsets: 0x${startOffset.toString(16).toUpperCase()} - 0x${endOffset.toString(16).toUpperCase()})`;
            
            this.btnPrev.classList.toggle('disabled', this.currentPage === 0);
            this.btnNext.classList.toggle('disabled', this.currentPage === this.totalPages - 1);
        }
    };

    // Attach to global window scope so main.js can trigger it on demand
    window.HexView = HexView;

})();
